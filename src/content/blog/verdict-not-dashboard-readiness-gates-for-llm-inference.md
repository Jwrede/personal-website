---
title: "Verdict, not dashboard: readiness gates for LLM inference deployments"
description: "Dashboards help you inspect LLM inference systems. They do not decide whether a new endpoint is safe to route traffic to. I built inference-readiness-kit to turn external probes and Prometheus metrics into deployment verdicts."
pubDate: 2026-05-16
tags: ["llm", "infrastructure", "prometheus", "kubernetes", "observability"]
lang: "en"
translationKey: "llm-inference-readiness-gates"
---

## The problem

Most inference monitoring starts inside the server.

vLLM exports metrics. Prometheus scrapes them. Grafana shows charts. That is
useful, but it does not answer the question I care about before routing traffic:

**Can users get a first token from this endpoint within the SLA right now?**

A server can look healthy while the user path is broken. The model might be
loaded, but the request path still includes DNS, TLS, a proxy, a load balancer,
an OpenAI-compatible adapter, rate limits, and streaming behavior. Server-side
metrics alone often miss this because they do not measure the full client path.

So I built
[inference-readiness-kit](https://github.com/Jwrede/inference-readiness-kit):
an operator workflow that combines external LLM endpoint probes with Prometheus
metrics and turns them into deployment decisions.

The important part is the shape of the output. It is not only a graph. It is a
verdict.

```text
READY
NOT READY
DEGRADED
```

That verdict can fail a CI/CD step, block a rollout, or send an operator to the
right runbook.

## Why external probes matter

The external probe is handled by
[llmprobe](https://github.com/Jwrede/llmprobe), a small Go CLI I built to
measure time to first token (TTFT), total latency, throughput, token count, and
health status for LLM APIs.

For readiness checks, the external probe answers:

- Does the endpoint accept requests?
- Does streaming actually start?
- How long does the first token take from the client side?
- Is the response empty or malformed?
- Does throughput collapse under load?

This is the client-side truth. It catches classes of failure that internal
server metrics cannot see directly: bad routing, proxy overhead, TLS overhead,
wrong model names, broken adapters, rate limits, and empty responses.

## Why Prometheus still matters

External probes tell you whether users have a problem. They do not always tell
you why.

That is where Prometheus comes in. For vLLM, the kit queries metrics such as:

- server-reported TTFT
- end-to-end request latency
- running requests
- waiting requests
- KV cache usage
- queue wait time

When client TTFT and server TTFT align, the bottleneck is probably inside the
inference path. If client TTFT is much worse than server TTFT, the gap is likely
outside the engine: network, proxy, load balancer, TLS, or routing.

The useful distinction is:

```text
llmprobe      -> Is there a user-visible problem?
Prometheus    -> What does the server say happened?
readiness-kit -> Should we route traffic, investigate, or scale?
```

## The three workflows

The project is built around three operator workflows.

### 1. Gate

The gate is for deployment automation.

```bash
./scripts/gate.sh configs/llmprobe/vllm.yml thresholds.yml 30s 5s
```

It runs external probes, checks them against SLA thresholds, writes the raw
JSONL data, and exits with `0` or `1`.

The thresholds are explicit:

```yaml
sla:
  ttft_ms: 500
  latency_ms: 10000
  min_throughput: 3.0
  max_error_rate: 0.01

gate:
  min_probes: 5
  pass_rate: 0.95
```

This is the most important interface. A dashboard can inform a person. An exit
code can stop a rollout.

### 2. Diagnose

Diagnosis correlates the client-side probe data with Prometheus.

```bash
python3 scripts/diagnose.py runs/latest/llmprobe.jsonl --prometheus http://localhost:9090
```

The report compares client-observed TTFT with server-reported TTFT and checks
queue depth, running requests, KV cache usage, and queue time. The result is a
Markdown diagnosis with likely causes and next actions.

Example output:

```text
Client and server TTFT p95 align (gap: 29ms). No significant network overhead.
No significant issues detected in server metrics.
```

If the gap is large, the report points at network or proxy overhead. If the
queue is full, it points at replica count, concurrency, or batching pressure.
If KV cache usage is high, it points at sequence length, cache pressure, and
preemption.

### 3. Capacity

The capacity workflow sweeps concurrency levels:

```bash
./scripts/sweep.sh configs/llmprobe/vllm.yml 1,2,4,8,16
```

It runs concurrent probe workers, writes one run directory per level, and
generates a comparison table. The goal is to find the point where TTFT,
latency, or error rate crosses the SLA.

In a local CPU experiment with Qwen2 0.5B on 8 vCPUs and 16GB RAM, vLLM and
Ollama behaved very differently:

| Concurrency | vLLM TTFT p50 | Ollama TTFT p50 | vLLM tok/s | Ollama tok/s |
|-------------|---------------|-----------------|------------|--------------|
| 1 | 110ms | 204ms | 16.4 | 42.3 |
| 4 | 225ms | 750ms | 17.5 | 59.3 |
| 8 | 327ms | 2.50s | 15.4 | 51.8 |
| 16 | 591ms | 6.90s | 10.7 | 53.1 |

Ollama won on per-token throughput because it used a quantized llama.cpp
backend. vLLM won on TTFT stability under load. For an interactive workload
with a 500ms TTFT target, that distinction matters more than raw throughput.

## Where Grafana fits

I still added a Grafana dashboard.

It visualizes the same Prometheus signals used by the diagnosis script:
TTFT, end-to-end latency, running and waiting requests, KV cache usage, queue
time, and throughput.

But Grafana is a companion artifact, not the core product.

The core product is still:

```text
probe -> correlate -> verdict -> report -> exit code
```

That distinction matters. In an incident, dashboards are useful for inspection.
In a deployment pipeline, the system needs to decide.

## What I would use this for

I would use this before routing traffic to a new model deployment:

1. Deploy the endpoint in a staging or canary environment.
2. Run the readiness gate against the OpenAI-compatible API.
3. If it fails, run diagnosis with Prometheus.
4. If it passes, run a short concurrency sweep.
5. Keep the generated Markdown report as release evidence.

The result is a small but practical workflow for LLM inference operations. It
does not replace Prometheus, Grafana, or Kubernetes readiness probes. It adds
the missing edge-to-edge LLM check: can this endpoint stream tokens within the
SLA from the client path that users actually hit?

GitHub:
[github.com/Jwrede/inference-readiness-kit](https://github.com/Jwrede/inference-readiness-kit)
