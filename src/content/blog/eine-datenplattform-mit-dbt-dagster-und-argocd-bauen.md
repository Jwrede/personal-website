---
title: "Eine Datenplattform mit dbt, Dagster und ArgoCD bauen"
description: "Wie ich eine ELT-Datenplattform für 100k+ IoT-Geräte gebaut habe: Dagster für Orchestrierung, dbt für Transformationen, Sqitch für Migrationen, ArgoCD für GitOps-Deployment und PII-sichere Extraktion aus fünf API-Shards."
pubDate: 2026-05-07
tags: ["data-engineering", "kubernetes", "python", "building"]
lang: "de"
translationKey: "data-platform-dbt-dagster"
---

## Das Problem

Bei Vilisto betreiben wir 100k+ smarte Thermostate bei Hunderten Kunden.
Die operativen Systeme (fünf Backend-Shards, eine Batterie-Datenbank,
ML-Evaluierungspipelines) halten jeweils einen Teil des Gesamtbildes, aber
keines davon ist für Analytics gebaut. Eine einfache Frage wie "wie viele
Geräte pro Firmware-Version letzte Woche offline gegangen sind" erforderte
Einmal-Skripte gegen Produktions-APIs.

Ich habe eine Datenplattform gebaut, um das zu lösen: aus allen Quellen
extrahieren, in ein Warehouse laden, mit dbt transformieren, in Grafana
visualisieren und mit ArgoCD deployen.

## Architektur

Die Plattform folgt dem ELT-Paradigma mit einer Medallion-Architektur
(Bronze/Silver/Gold):

```
Operative Systeme (5 API-Shards, MinIO, Battery DB)
    ↓
[Extract + Load] Dagster Assets → PostgreSQL `raw` Schema (Bronze)
    ↓
[Transform] dbt-Modelle: Staging Views (Silver) → Mart Tables (Gold)
    ↓
[Visualize] Grafana Dashboards
```

Fünf Schichten, jede mit einer klaren Aufgabe:

1. **Sqitch**: verwaltet das Raw-Schema. Migrationen laufen als Kubernetes
   Init-Container bevor die Hauptanwendung startet.
2. **Dagster**: orchestriert Extraktion und Laden. Jede Quelle ist ein
   Dagster-Asset mit eigenem Schedule.
3. **dbt**: transformiert rohes JSONB in typisierte, indizierte Tabellen.
   Staging-Modelle entpacken verschachtelte Daten und deduplizieren,
   Mart-Modelle joinen und indizieren für schnelle Abfragen.
4. **Helm + ArgoCD**: deklaratives Deployment. Schema-Migrationen, Secrets
   und der Dagster-Webserver sind in Helm-Templates definiert.
5. **Grafana**: Dashboards, die direkt die Mart-Tabellen abfragen.

## Extraktion: fünf Shards, PII-sicher

Der schwierigste Teil der Extraktion: Vilistos Backend ist auf fünf Instanzen
geshardet. Der API-Client authentifiziert sich gegen jeden Shard und liefert
Daten pro Kunde:

```python
BACKEND_SHARDS = [
    "backend-1.example.com",
    "backend-2.example.com",
    "backend-3.example.com",
    "backend-4.example.com",
    "backend-5.example.com",
]
```

Jedes Extraktions-Asset folgt demselben Muster: API aufrufen, sensible Felder
entfernen, in das Raw-Schema upserten. PII-Handling ist Allowlist-basiert,
nicht Blocklist-basiert. Nur freigegebene Konfigurationsparameter gelangen ins
Warehouse:

```python
CONFIGURATION_PARAMETERS = [
    "userSetTemp", "batteryRemainingDays",
    "heatingMode", "firmwareTarget",
    # ... ~10 weitere Felder
]
```

Sensible Felder werden explizit an der Quelle entfernt. Wenn ein neues Feld in
der API-Antwort auftaucht, erreicht es das Warehouse nie, es sei denn, jemand
fügt es zur Allowlist hinzu.

Für tägliche Aggregate (Ventilbewegung, Temperatur, Luftfeuchtigkeit,
Batteriespannung) versucht der Client zuerst einen API-Call auf Kundenebene.
Wenn das fehlschlägt, fällt er auf Geräteebene zurück. Das ist relevant, wenn
ein einzelner Kunde tausende Geräte hat, da der Kunden-Endpoint deutlich
schneller ist, aber nicht immer verfügbar.

## Dagster: Assets und Schedules

Drei geplante Jobs decken unterschiedliche Frische-Anforderungen ab:

| Job | Schedule | Was geladen wird |
|-----|----------|------------------|
| `twelve_hourly_elt` | `0 */12 * * *` | Gerätestatus-Snapshots, Thermostat-Hierarchie |
| `daily_aggregates_elt` | `0 3 * * *` | Ventilbewegung, Temperatur, Luftfeuchtigkeit, RSSI |
| `battery_algorithm_eval_results_elt` | `15 2 * * *` | ML-Evaluierungsergebnisse aus MinIO |

Jedes Asset zeichnet Metadaten auf (Kundenanzahl, Thermostatanzahl,
Fehleranzahl, Ausführungsdauer), die in der Dagster-UI sichtbar werden. Der
Daily-Aggregates-Job nutzt `multiprocess_executor` für parallele Extraktion
über Kunden hinweg.

Das Resource-Injection-Pattern macht Testen einfach. Dev und Prod teilen
denselben Asset-Code, bekommen aber unterschiedliche Ressourcen:

```python
# Dev: gestubte Daten, lokale Datenbank
resources = {
    "ovis_client": StubbedOvisApiClient(),
    "db_client": DBClient(host="localhost", port=5434),
    "minio_client": StubbedMinioClient(),
    "dbt": DbtCliResource(target="local"),
}

# Prod: echte Shards, Produktions-DB, echtes MinIO
resources = {
    "ovis_client": ShardedOvisAPIClient(shards=BACKEND_SHARDS),
    "db_client": DBClient(host=DB_HOST),
    "minio_client": MinioEvalResultsClient(endpoint=MINIO_ENDPOINT),
    "dbt": DbtCliResource(target="postgres"),
}
```

CI lässt die gesamte Pipeline mit gestubten Daten gegen eine lokale
TimescaleDB laufen, inklusive Sqitch-Migrationen und aller dbt-Transformationen.
Wenn ein Asset nicht materialisiert werden kann, bricht die Pipeline ab.

## dbt: von JSONB zu indizierten Tabellen

Das Raw-Schema speichert API-Antworten als JSONB. Die dbt-Schicht verwandelt
sie in typisierte, abfragbare Tabellen.

**Staging**-Modelle entpacken verschachtelte Daten und deduplizieren. Das wichtigste,
`stg_last_updates_per_day`, nimmt die rohen JSONB-Snapshots und produziert
eine Zeile pro Gerät pro Tag mit typisierten Spalten für Firmware-Version,
Batteriedaten, Ventilposition, Konnektivitäts-Ratios und
Konfigurationsparameter. Es nutzt inkrementelle Materialisierung mit
`unique_key=['device_id', 'queried_at::date']`, um bei jedem Lauf nicht die
gesamte Historie neu zu verarbeiten.

Es berechnet auch abgeleitete Signale über Window-Funktionen:

```sql
lag(uptime) over (
    partition by device_id order by queried_at
) > uptime as had_reset_since_previous_query,

calibration_total - lag(calibration_total) over (
    partition by device_id order by queried_at
) as calibrations_since_previous_query
```

**Mart**-Modelle joinen Staging-Tabellen mit Seed-Daten
(Firmware-Deployments, Datenerfassungs-Startdaten) und fügen umfangreiche
Indizierung hinzu. `last_updates_per_day` wächst um 1,5-3M Zeilen pro Monat,
daher sind Indizes auf `queried_date`, `customer_id`, `device_id`,
`embedded_version` und `hardware_version` essenziell, damit Grafana-Queries
schnell bleiben.

Alle Mart-Tabellen nutzen PostgreSQLs `unlogged`-Modus. Sie sind abgeleitete
Daten, werden bei jedem dbt-Run neu aufgebaut, daher ist WAL-Durability
unnötig und Unlogged Tables sind deutlich schneller zu schreiben.

## Deployment: Sqitch Init-Container + ArgoCD

Das Deployment hat einen Trick, der mir gefällt: Schema-Migrationen laufen
als Kubernetes Init-Container.

```yaml
initContainers:
  - name: db-migration
    image: dbt-poc-sqitch:{{ .Values.image.tag }}
    command: ["sqitch", "deploy", "--target", "db:postgresql://..."]
```

Der Init-Container führt Sqitch aus, bevor der Dagster-Pod startet. Wenn eine
Migration fehlschlägt, kommt der Pod nie hoch, ArgoCD markiert ihn als
degraded, und nichts läuft gegen ein halb-migriertes Schema.

Secrets (Datenbank-Credentials, API-Passwörter, MinIO-Keys) werden mit
SealedSecrets verwaltet, verschlüsselt im Git gespeichert. Das gesamte
Deployment steckt in Helm-Templates: Deployment, Service, PVC, ConfigMap,
SealedSecrets, ServiceAccount.

ArgoCD überwacht das Repo. Für Staging synchronisiert es automatisch von
`HEAD`. Für Produktion aktualisiere ich den Image-Tag in `values-prod.yaml`,
merge den Branch nach main und genehmige den Sync manuell in der ArgoCD-UI.

## Source Freshness

dbt-Source-Freshness-Checks sind in die Pipeline integriert. Jede Quelle hat
Warn- und Fehler-Schwellenwerte:

| Quelle | Warnung nach | Fehler nach |
|--------|-------------|-------------|
| Device Last Updates | 12 Stunden | 24 Stunden |
| Daily Aggregates | 25 Stunden | 48 Stunden |
| Battery Eval Results | 7 Tage | 14 Tage |

Wenn ein Extraktions-Job stillschweigend fehlschlägt, tauchen veraltete Daten
in Grafana als Freshness-Warnung auf, bevor jemand ein Ticket erstellt.

## Was ich anders machen würde

Das war ein PoC, und einige Entscheidungen zeigen es:

- **PostgreSQL als Warehouse.** Funktioniert für unsere Größe (50-100k
  Geräte), aber die Mart-Tabellen werden groß. Ein Columnar Store wie DuckDB
  oder ClickHouse wäre langfristig besser geeignet.
- **Single-Source EL.** Die Plattform ingestiert aktuell nur von ovis-cloud.
  Zoho CRM, Prometheus-Metriken oder GitLab-Daten hinzuzufügen würde von
  Airbyte profitieren statt von handgeschriebenen Extraktoren.
- **Keine Partitionierung.** `last_updates_per_day` sollte nach Monat
  partitioniert werden. Die Indizes kompensieren, aber Partitionierung würde
  Backfills und Retention Policies sauberer machen.

## Stack

| Schicht | Tool |
|---------|------|
| Orchestrierung | Dagster |
| Transformation | dbt |
| Schema-Migrationen | Sqitch |
| Datenbank | PostgreSQL + TimescaleDB |
| Object Storage | MinIO |
| Visualisierung | Grafana |
| Deployment | Helm + ArgoCD |
| CI | GitLab CI (pytest + Kaniko + Aqua Scan) |
| Secrets | SealedSecrets |
