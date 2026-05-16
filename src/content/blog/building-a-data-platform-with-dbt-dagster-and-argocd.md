---
title: "Building a data platform with dbt, Dagster, and ArgoCD"
description: "How I built an ELT data platform for 100k+ IoT devices: Dagster for orchestration, dbt for transforms, Sqitch for migrations, ArgoCD for GitOps deployment, and PII-safe extraction from five API shards."
pubDate: 2026-05-07
tags: ["data-engineering", "kubernetes", "python", "case-study"]
lang: "en"
translationKey: "data-platform-dbt-dagster"
---

## The problem

At Vilisto we operate 100k+ smart thermostats across hundreds of customers.
The operational systems (five backend shards, a battery database, ML evaluation
pipelines) each hold a piece of the picture, but none of them are built for
analytics. Getting a simple answer like "how many devices went offline per
firmware version last week" meant writing one-off scripts against production
APIs.

I built a data platform to fix that: extract from all sources, load into a
warehouse, transform with dbt, visualize in Grafana, deploy via ArgoCD.

## Architecture

The platform follows the ELT paradigm with a medallion architecture
(bronze/silver/gold):

```
Operational Systems (5 API shards, MinIO, Battery DB)
    ↓
[Extract + Load] Dagster assets → PostgreSQL `raw` schema (bronze)
    ↓
[Transform] dbt models: staging views (silver) → mart tables (gold)
    ↓
[Visualize] Grafana dashboards
```

Five layers, each with a clear job:

1. **Sqitch**: manages the raw schema. Migrations run as a Kubernetes init
   container before the main app starts.
2. **Dagster**: orchestrates extraction and loading. Each source is a Dagster
   asset with its own schedule.
3. **dbt**: transforms raw JSONB into typed, indexed tables. Staging models
   flatten and deduplicate, mart models join and index for query performance.
4. **Helm + ArgoCD**: declarative deployment. Schema migrations, secrets, and
   the Dagster webserver are all defined in Helm templates.
5. **Grafana**: dashboards that query the mart tables directly.

## Extraction: five shards, PII-safe

The trickiest part of extraction is that Vilisto's backend is sharded across
five instances. The API client authenticates against each shard and yields
data per customer:

```python
BACKEND_SHARDS = [
    "backend-1.example.com",
    "backend-2.example.com",
    "backend-3.example.com",
    "backend-4.example.com",
    "backend-5.example.com",
]
```

Each extraction asset follows the same pattern: call the API, strip sensitive
fields, upsert into the raw schema. PII handling is allowlist-based, not
blocklist-based. Only whitelisted configuration parameters make it into the
warehouse:

```python
CONFIGURATION_PARAMETERS = [
    "userSetTemp", "batteryRemainingDays",
    "heatingMode", "firmwareTarget",
    # ... ~10 more fields
]
```

Sensitive fields are explicitly dropped at the source.
If a new field appears in the API response, it never reaches the warehouse
unless someone adds it to the allowlist.

For daily aggregates (valve movement, temperature, humidity, battery voltage),
the client first tries a customer-level API call. If that fails, it falls back
to device-level calls. This matters when a single customer has thousands of
devices, since the customer-level endpoint is significantly faster but not always
available.

## Dagster: assets and schedules

Three scheduled jobs cover different data freshness requirements:

| Job | Schedule | What it loads |
|-----|----------|---------------|
| `twelve_hourly_elt` | `0 */12 * * *` | Device state snapshots, thermostat hierarchy |
| `daily_aggregates_elt` | `0 3 * * *` | Valve movement, temperature, humidity, RSSI |
| `battery_algorithm_eval_results_elt` | `15 2 * * *` | ML evaluation results from MinIO |

Each asset records metadata (customer count, thermostat count, error count,
execution duration) that surfaces in the Dagster UI. The daily aggregates job
uses `multiprocess_executor` for parallel extraction across customers.

The resource injection pattern makes testing straightforward. Dev and prod
share the same asset code but get different resources:

```python
# Dev: stubbed data, local database
resources = {
    "ovis_client": StubbedOvisApiClient(),
    "db_client": DBClient(host="localhost", port=5434),
    "minio_client": StubbedMinioClient(),
    "dbt": DbtCliResource(target="local"),
}

# Prod: real shards, production database, real MinIO
resources = {
    "ovis_client": ShardedOvisAPIClient(shards=BACKEND_SHARDS),
    "db_client": DBClient(host=DB_HOST),
    "minio_client": MinioEvalResultsClient(endpoint=MINIO_ENDPOINT),
    "dbt": DbtCliResource(target="postgres"),
}
```

CI runs the full pipeline with stubbed data against a local TimescaleDB,
including Sqitch migrations and all dbt transforms. If any asset fails to
materialize, the pipeline breaks.

## dbt: from JSONB to indexed tables

The raw schema stores API responses as JSONB. The dbt layer turns them into
typed, queryable tables.

**Staging** models flatten and deduplicate. The most important one,
`stg_last_updates_per_day`, takes the raw JSONB snapshots and produces one
row per device per day with typed columns for firmware version, battery data,
valve position, connectivity ratios, and configuration parameters. It uses
incremental materialization with `unique_key=['device_id', 'queried_at::date']`
to avoid reprocessing the entire history on every run.

It also computes derived signals via window functions:

```sql
lag(uptime) over (
    partition by device_id order by queried_at
) > uptime as had_reset_since_previous_query,

calibration_total - lag(calibration_total) over (
    partition by device_id order by queried_at
) as calibrations_since_previous_query
```

**Mart** models join staging tables with seed data (firmware deployments,
data collection start dates) and add heavy indexing. `last_updates_per_day`
grows by 1.5-3M rows per month, so indices on `queried_date`, `customer_id`,
`device_id`, `embedded_version`, and `hardware_version` are essential for
Grafana queries to stay fast.

All mart tables use PostgreSQL's `unlogged` mode. They're derived data,
rebuilt on every dbt run, so WAL durability is unnecessary and unlogged tables
are significantly faster to write.

## Deployment: Sqitch init container + ArgoCD

The deployment has a trick I'm happy with: schema migrations run as a
Kubernetes init container.

```yaml
initContainers:
  - name: db-migration
    image: dbt-poc-sqitch:{{ .Values.image.tag }}
    command: ["sqitch", "deploy", "--target", "db:postgresql://..."]
```

The init container runs Sqitch before the Dagster pod starts. If a migration
fails, the pod never comes up, ArgoCD marks it as degraded, and nothing runs
against a half-migrated schema.

Secrets (database credentials, API passwords, MinIO keys) are managed with
SealedSecrets, encrypted at rest in Git. The full deployment is in Helm
templates: Deployment, Service, PVC, ConfigMap, SealedSecrets, ServiceAccount.

ArgoCD watches the repo. For staging, it auto-syncs from `HEAD`. For
production, I update the image tag in `values-prod.yaml`, merge to main, and
approve the sync manually in the ArgoCD UI.

## Source freshness

dbt's source freshness checks are wired into the pipeline. Each source has
warn and error thresholds:

| Source | Warn after | Error after |
|--------|-----------|-------------|
| Device last updates | 12 hours | 24 hours |
| Daily aggregates | 25 hours | 48 hours |
| Battery eval results | 7 days | 14 days |

If an extraction job silently fails, stale data surfaces in Grafana as a
freshness warning before anyone files a ticket.

## What I'd do differently

This was a PoC, and some decisions show it:

- **PostgreSQL as warehouse.** Fine for our scale (50-100k devices), but the
  mart tables are getting large. A columnar store like DuckDB or ClickHouse
  would be a better fit long-term.
- **Single-source EL.** The platform currently only ingests from ovis-cloud.
  Adding Zoho CRM, Prometheus metrics, or GitLab data would benefit from
  Airbyte instead of hand-written extractors.
- **No partitioning.** `last_updates_per_day` should be partitioned by month.
  The indices compensate, but partitioning would make backfills and retention
  policies cleaner.

## Stack

| Layer | Tool |
|-------|------|
| Orchestration | Dagster |
| Transformation | dbt |
| Schema migrations | Sqitch |
| Database | PostgreSQL + TimescaleDB |
| Object storage | MinIO |
| Visualization | Grafana |
| Deployment | Helm + ArgoCD |
| CI | GitLab CI (pytest + Kaniko + Aqua scan) |
| Secrets | SealedSecrets |
