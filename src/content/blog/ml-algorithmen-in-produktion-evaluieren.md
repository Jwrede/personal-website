---
title: "ML-Algorithmen in Produktion evaluieren: von Felddaten zum Fleet-Rollout"
description: "Wie ich eine Evaluierungspipeline für Batterie-Vorhersagealgorithmen für 100k+ IoT-Geräte gebaut habe: Dagster-orchestrierte Datensatzerstellung aus Felddaten, Human-in-the-Loop-Review, isolierte Venv-Tests über Algorithmusversionen, MLflow-Tracking und Fleet-Rollout."
pubDate: 2026-05-07
tags: ["mlops", "python", "data-engineering", "building"]
lang: "de"
translationKey: "ml-eval-pipeline"
---

## Das Problem

Bei Vilisto prognostizieren wir die Batterielebensdauer für 100k+ smarte
Thermostate. Die Algorithmen schätzen verbleibende Kapazität (mAh) und
Laufzeit (Tage) pro Gerät, und diese Vorhersagen steuern
Wartungsentscheidungen für Gebäudemanager.

Die Algorithmen leben in einer internen Python-Bibliothek namens datavil. Neue
Versionen werden regelmäßig mit verbesserter Vorhersagelogik veröffentlicht.
Aber woher weiß man, ob eine neue Version tatsächlich besser ist? Man kann
Batterievorhersagen nicht per A/B-Test prüfen — bis eine Batterie leer ist,
hat das Experiment Monate gedauert.

Ich habe zwei Tools gebaut, um das zu lösen: eine Evaluierungspipeline, die
Algorithmusversionen gegen kuratierte Felddaten vergleicht, und ein
operatives Tool, das die beste Version auf die gesamte Flotte ausrollt.

## Datensatzerstellung aus Felddaten

Die erste Herausforderung: Evaluierungsdatensätze bauen. Labordaten gibt es
(Teststand-Messungen von Batterien unter kontrollierten Bedingungen), aber
reale Daten sind unordentlicher. Thermostate sitzen in Gebäuden mit
unterschiedlichen Heizmustern, Firmware-Versionen ändern sich mitten im
Betrieb, und Geräte gehen tagelang offline.

Die Evaluierungspipeline ist eine Dagster-Anwendung mit monatlich
partitionierten Assets. Für jeden Monat:

1. Ventilbewegung und Sensorlogs aus der Analytics-Datenbank abrufen
2. Kapazitäts-Testdaten von fünf Vilisto-API-Shards holen
3. Versionshistorie pro Gerät tracken (Hardware und Firmware zum
   Monatsanfang, Software-Änderungen während des Monats)
4. Alles als Parquet in MinIO speichern mit deterministischen Pfaden:
   `capacity/datasets/year=2026/month=04/dataset.parquet`

Das Versionshistorie-Tracking ist wichtig, weil die Algorithmen sich je nach
Hardware-Revision und Firmware unterschiedlich verhalten. Eine Vorhersage mit
Firmware-v3.2-Inputs sollte gegen v3.2-Verhalten evaluiert werden, nicht
gegen v3.5.

## Human-in-the-Loop-Review

Nicht jedes Gerät produziert saubere Evaluierungsdaten. Ein Thermostat, das
zwei Wochen mitten im Monat offline war, ist kein fairer Test für einen
Laufzeit-Vorhersagealgorithmus. Aber "sauber" programmatisch zu definieren
ist schwierig — die Grenzfälle sind endlos.

Die Lösung: eine Streamlit-Review-UI. Nach dem Dataset-Build öffnet ein
Reviewer die UI, sieht pro Sample Visualisierungen (Spannungskurven,
Ventilbewegungsmuster, Konnektivitätslücken) und markiert, welche Samples
für die Evaluierung geeignet sind:

```
sample_id,use_for_training
abc123,true
def456,false
ghi789,true
```

Diese Review-Manifeste sind CSV-Dateien, die in MinIO neben den Datensätzen
gespeichert werden. Der Evaluierungsschritt läuft nur auf genehmigten
Samples. Das hält die Pipeline reproduzierbar — dasselbe Manifest erzeugt
immer dieselbe Evaluierung — während Domain-Experten Urteil anwenden können,
das sich schwer in Regeln kodieren lässt.

## Isolierte Environments pro Algorithmusversion

Die zentrale Evaluierungsfrage: Wie schneidet datavil v0.8.0 im Vergleich
zu v0.9.0 auf demselben Datensatz ab? Beide Versionen im selben
Python-Prozess laufen zu lassen ist nicht möglich — es sind verschiedene
Paketversionen mit potenziell inkompatiblen Dependencies.

Die Pipeline erstellt ein temporäres Virtual Environment für jedes
Versions-Label:

```python
# Für jede datavil-Version (v0.6.0, v0.8.0, latest, ein Git-Ref...)
# 1. Temp-Venv erstellen
# 2. pip install datavil=={version} von GitLab PyPI
# 3. Evaluierung im Subprocess ausführen
# 4. Ergebnisse sammeln, Venv abräumen
```

Versions-Labels können semantische Versionen (`v0.9.0`), `latest` oder sogar
Git-Refs sein. Dagsters Multi-Partition-Support (Monat × datavil-Version)
bedeutet, dass die Pipeline jede Kombination trackt.

Das ist der Teil, mit dem ich am zufriedensten bin. Keine Container-Builds,
keine separaten CI-Pipelines pro Version — nur kurzlebige Venvs, die für
die Dauer eines Evaluierungslaufs existieren.

## MLflow für Versionsvergleich

Jede Evaluierung loggt in MLflow:

- Pro-Sample-Vorhersagen vs Ground Truth (Kapazität in mAh, Laufzeit in
  Tagen)
- Fehlerverteilungen (Mean, Median, Perzentile)
- Vergleichsplots über Versionen hinweg

MLflow macht es einfach zu beantworten: "Hat v0.9.0 den medianen
Laufzeit-Vorhersagefehler im Vergleich zu v0.8.0 auf dem April-Datensatz
reduziert?" — ohne jedes Mal eigene Analyseskripte zu schreiben.

Die Dagster-Assets zeichnen Metadaten auf (Sample-Anzahl, Fehleranzahl,
Ausführungsdauer), die in der Dagster-UI sichtbar werden, sodass man auf
einen Blick sieht, ob eine Evaluierung sauber abgeschlossen wurde.

## Fleet-Rollout

Sobald eine Version die Evaluierung besteht, muss sie auf der gesamten
Flotte laufen. Die Evaluierungspipeline verarbeitet kuratierte Samples —
hunderte Geräte. Die Flotte hat 100k+.

Eine separate FastAPI-Anwendung übernimmt das. Sie startet
Hintergrund-Worker-Prozesse, jeder in seinem eigenen Venv mit der
Ziel-datavil-Version:

- Worker verarbeiten Geräte in 250er-Batches
- Jeder Batch checkpointet den Fortschritt auf die Festplatte (JSON- +
  CSV-Snapshots)
- Ergebnisse werden nach Abschluss als Parquet nach MinIO hochgeladen
- Die Admin-UI zeigt Live-Fortschritt: verarbeitete Geräte, Fehleranzahl,
  verstrichene Zeit

Das Checkpoint-Pattern ist bei dieser Größenordnung wichtig. Ein voller
Fleet-Run dauert Stunden. Wenn ein Worker bei Gerät 80.000 abstürzt, will
man nicht von vorne anfangen.

Drei Berechnungsmodi decken verschiedene operative Bedürfnisse ab:

- **fleet**: Q10/Q90-Kapazitäts- und Laufzeitschätzungen pro Gerät
- **fleet-q10-distributions**: gebuckete Verteilungs-Snapshots
  (30-Tage-Laufzeitbereiche, 10%-Kapazitätsbereiche) für
  Fleet-Gesundheitsansichten
- **configuration**: setzt Batterieparameter über die API für die gesamte
  Flotte zurück

## Was sie verbindet

Die beiden Tools bilden eine Schleife:

```
Felddaten → Kuratierte Datensätze → Versions-Evaluierung → MLflow-Vergleich
    ↑                                                              ↓
Fleet-Rollout ← Beste Version gewählt ← Menschliche Entscheidung ←┘
```

Dagster orchestriert die Evaluierungsseite (monatliche Datensätze,
Multi-Versions-Evaluierung, MLflow-Logging). FastAPI übernimmt die operative
Seite (Fleet-weite Berechnung, Fortschritts-Tracking,
Konfigurations-Management). MinIO ist die gemeinsame Speicherschicht —
Evaluierungsdatensätze und Fleet-Ergebnisse leben dort beide als
versioniertes Parquet.

## Was ich anders machen würde

- **Dataset-Versionierung.** MinIO-Pfade kodieren Jahr/Monat/Version, aber
  es gibt kein formales Lineage-Tracking. Wenn sich die Extraktionslogik
  ändert, werden alte Datensätze stillschweigend unvergleichbar. Ein Tool wie
  DVC oder auch nur eine Metadaten-Tabelle würde helfen.
- **Worker-Orchestrierung.** Das FastAPI-Subprocess-Pattern funktioniert,
  ist aber fragil. Dagster könnte auch Fleet-Runs managen, mit eingebautem
  Retry und Checkpointing.
- **Automatisches Gating.** Aktuell schaut ein Mensch in MLflow und
  entscheidet, ob eine Version promoted wird. Ein automatisches Gate (z.B.
  "promote wenn der Median-Fehler um >5% gesunken ist") würde die Schleife
  schließen.

## Stack

| Schicht | Tool |
|---------|------|
| Evaluierungs-Orchestrierung | Dagster (monatlich + multi-partitionierte Assets) |
| Dataset-Speicher | MinIO (Parquet) |
| Experiment-Tracking | MLflow |
| Review-UI | Streamlit |
| Fleet-Berechnung | FastAPI + Subprocess-Worker |
| Algorithmus-Bibliothek | datavil (intern, installiert von GitLab PyPI) |
| Datenverarbeitung | Polars, PyArrow |
| Datenbanken | PostgreSQL (Analytics DB, Battery DB) |
