---
title: "Evaluating ML algorithms in production: from field data to fleet deployment"
description: "How I built an evaluation pipeline for battery prediction algorithms serving 100k+ IoT devices: Dagster-orchestrated dataset creation from field data, human-in-the-loop review, isolated venv testing across algorithm versions, MLflow tracking, and fleet-wide rollout."
pubDate: 2026-05-07
tags: ["mlops", "python", "data-engineering", "building"]
lang: "en"
translationKey: "ml-eval-pipeline"
---

## The problem

At Vilisto we predict battery lifetime for 100k+ smart thermostats. The
algorithms estimate remaining capacity (mAh) and runtime (days) per device,
and those predictions drive maintenance decisions for building managers.

The algorithms live in an internal Python library. New versions
ship regularly with improved prediction logic. But how do you know a new
version is actually better? You can't A/B test battery predictions because by
the time a battery dies, the experiment has run for months.

I built two tools to solve this: an evaluation pipeline that compares algorithm
versions against curated field data, and an operational tool that rolls out the
winning version fleet-wide.

## Dataset creation from field data

The first challenge: building evaluation datasets. Lab data exists (teststand
measurements of batteries under controlled conditions), but real-world data is
messier. Thermostats sit in buildings with varying heating patterns, firmware
versions change mid-deployment, and devices go offline for days.

The evaluation pipeline is a Dagster application with monthly partitioned
assets. For each month, it:

1. Fetches valve movement and sensor logs from the analytics database
2. Pulls capacity test data from five Vilisto API shards
3. Tracks per-device version history (hardware and firmware at month start,
   software changes during the month)
4. Stores everything as Parquet in MinIO with deterministic paths:
   `capacity/datasets/year=2026/month=04/dataset.parquet`

The version history tracking matters because the algorithms behave differently
depending on hardware revision and firmware. A prediction made with firmware
v3.2 inputs should be evaluated against v3.2 behavior, not v3.5.

## Human-in-the-loop review

Not every device produces clean evaluation data. A thermostat that was offline
for two weeks in the middle of the month isn't a fair test for a runtime
prediction algorithm. But defining "clean" programmatically is hard because the edge
cases are endless.

The solution: a Streamlit review UI. After datasets are built, a reviewer
opens the UI, sees per-sample visualizations (voltage curves, valve movement
patterns, connectivity gaps), and marks which samples are acceptable for
evaluation:

```
sample_id,use_for_training
abc123,true
def456,false
ghi789,true
```

These review manifests are CSV files stored in MinIO alongside the datasets.
The evaluation step only runs on approved samples. This keeps the pipeline
reproducible because the same manifest always produces the same evaluation,
while letting domain experts apply judgment that's hard to encode in rules.

## Isolated environments per algorithm version

The core evaluation question is: how does v0.8.0 compare to v0.9.0 on
the same dataset? Running both versions in the same Python process isn't
possible because they're different package versions with potentially incompatible
dependencies.

The pipeline creates a temporary virtual environment for each version label:

```python
# For each library version (v0.6.0, v0.8.0, latest, a git ref...)
# 1. Create temp venv
# 2. pip install battery-lib=={version} from a private PyPI index
# 3. Run evaluation in subprocess
# 4. Collect results, tear down venv
```

Version labels can be semantic versions (`v0.9.0`), `latest`, or even git
refs. Dagster's multi-partition support (month × library version) means the
pipeline tracks every combination.

This is the part I'm happiest with. No container builds, no separate CI
pipelines per version, just ephemeral venvs that exist for the duration of
one evaluation run.

## MLflow for version comparison

Each evaluation logs to MLflow:

- Per-sample predictions vs ground truth (capacity in mAh, runtime in days)
- Error distributions (mean, median, percentiles)
- Comparison plots across versions

MLflow makes it straightforward to answer "did v0.9.0 reduce the median
runtime prediction error compared to v0.8.0 on the April dataset?" without
writing custom analysis scripts every time.

The Dagster assets record metadata (sample count, error count, execution
duration) that surfaces in the Dagster UI, so you can see at a glance whether
an evaluation completed cleanly.

## Fleet-wide rollout

Once a version passes evaluation, it needs to run on the entire fleet. The
evaluation pipeline processes curated samples, hundreds of devices. The fleet
has 100k+.

A separate FastAPI application handles this. It spawns background worker
processes, each running in its own venv with the target library version:

- Workers process devices in batches of 250
- Each batch checkpoints progress to disk (JSON + CSV snapshots)
- Results upload to MinIO as Parquet when complete
- The admin UI shows live progress: devices processed, error count, elapsed
  time

The checkpoint pattern matters at this scale. A full fleet run takes hours.
If a worker crashes at device 80,000, you don't want to start over.

Three computation modes cover different operational needs:

- **fleet**: per-device Q10/Q90 capacity and runtime estimates
- **fleet-q10-distributions**: bucketed distribution snapshots (30-day runtime
  ranges, 10% capacity ranges) for fleet-level health views
- **configuration**: resets battery parameters across the fleet via the API

## What connects them

The two tools form a loop:

```
Field data → Curated datasets → Version evaluation → MLflow comparison
    ↑                                                        ↓
Fleet rollout ← Winning version selected ← Human decision ←─┘
```

Dagster orchestrates the evaluation side (monthly datasets, multi-version
evaluation, MLflow logging). FastAPI handles the operational side (fleet-wide
computation, progress tracking, configuration management). MinIO is the shared
storage layer: evaluation datasets and fleet results both live there as
versioned Parquet.

## What I'd do differently

- **Dataset versioning.** MinIO paths encode year/month/version, but there's
  no formal lineage tracking. If the extraction logic changes, old datasets
  become silently incomparable. A tool like DVC or even a metadata table would
  help.
- **Worker orchestration.** The FastAPI subprocess pattern works but is
  fragile. Dagster could manage fleet runs too, with proper retry and
  checkpointing built in.
- **Automated gating.** Right now a human looks at MLflow and decides whether
  to promote a version. An automated gate (e.g., "promote if median error
  improved by >5%") would close the loop.

## Stack

| Layer | Tool |
|-------|------|
| Evaluation orchestration | Dagster (monthly + multi-partitioned assets) |
| Dataset storage | MinIO (Parquet) |
| Experiment tracking | MLflow |
| Review UI | Streamlit |
| Fleet computation | FastAPI + subprocess workers |
| Algorithm library | Internal Python package (private PyPI) |
| Data processing | Polars, PyArrow |
| Databases | PostgreSQL (Analytics DB, Battery DB) |
