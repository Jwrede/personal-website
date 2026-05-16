---
title: "Entscheidung statt Dashboard: Readiness Gates für LLM-Inferenz-Deployments"
description: "Dashboards helfen bei der Inspektion von LLM-Inferenzsystemen. Sie entscheiden aber nicht, ob ein neuer Endpoint Traffic bekommen sollte. Ich habe inference-readiness-kit gebaut, um externe Probes und Prometheus-Metriken in Deployment-Entscheidungen zu übersetzen."
pubDate: 2026-05-16
tags: ["llm", "infrastruktur", "prometheus", "kubernetes", "observability"]
lang: "de"
translationKey: "llm-inference-readiness-gates"
---

## Das Problem

Die meisten Inferenz-Monitoring-Setups beginnen im Server.

vLLM exportiert Metriken. Prometheus sammelt sie ein. Grafana zeigt Diagramme.
Das ist nützlich, beantwortet aber nicht die Frage, die vor dem Routen von
Traffic entscheidend ist:

**Bekommt ein Nutzer von diesem Endpoint jetzt ein erstes Token innerhalb der
SLA?**

Ein Server kann gesund aussehen, während der Nutzerpfad kaputt ist. Das Modell
kann geladen sein, aber der Request läuft trotzdem durch DNS, TLS, Proxy,
Load Balancer, OpenAI-kompatible Adapter, Rate Limits und Streaming-Logik.
Server-seitige Metriken allein übersehen solche Probleme oft, weil sie nicht
den vollständigen Client-Pfad messen.

Deshalb habe ich
[inference-readiness-kit](https://github.com/Jwrede/inference-readiness-kit)
gebaut: einen Operator-Workflow, der externe LLM-Endpoint-Probes mit
Prometheus-Metriken kombiniert und daraus Deployment-Entscheidungen ableitet.

Der wichtige Teil ist die Form der Ausgabe. Es ist nicht nur ein Graph. Es ist
eine Entscheidung.

```text
READY
NOT READY
DEGRADED
```

Diese Entscheidung kann einen CI/CD-Schritt fehlschlagen lassen, ein Rollout
blockieren oder den Operator direkt zum passenden Runbook schicken.

## Warum externe Probes wichtig sind

Die externen Probes kommen von
[llmprobe](https://github.com/Jwrede/llmprobe), einem kleinen Go-CLI, das ich
gebaut habe, um Time to First Token (TTFT), Latenz, Durchsatz, Tokenzahl und
Health-Status von LLM-APIs zu messen.

Für Readiness Checks beantwortet der externe Probe diese Fragen:

- Nimmt der Endpoint Requests an?
- Startet Streaming wirklich?
- Wie lange dauert das erste Token aus Client-Sicht?
- Ist die Antwort leer oder kaputt?
- Bricht der Durchsatz unter Last ein?

Das ist die Client-seitige Wahrheit. Sie erkennt Fehlerklassen, die interne
Servermetriken nicht direkt sehen: falsches Routing, Proxy-Overhead,
TLS-Overhead, falsche Modellnamen, kaputte Adapter, Rate Limits und leere
Antworten.

## Warum Prometheus trotzdem wichtig ist

Externe Probes sagen, ob Nutzer ein Problem haben. Sie sagen nicht immer,
warum.

Dafür ist Prometheus da. Für vLLM fragt das Kit Metriken ab wie:

- Server-seitiges TTFT
- End-to-end Request-Latenz
- laufende Requests
- wartende Requests
- KV-Cache-Auslastung
- Queue-Wartezeit

Wenn Client-TTFT und Server-TTFT zusammenpassen, liegt der Engpass
wahrscheinlich im Inferenzpfad selbst. Wenn Client-TTFT deutlich schlechter
ist als Server-TTFT, liegt die Lücke wahrscheinlich außerhalb der Engine:
Netzwerk, Proxy, Load Balancer, TLS oder Routing.

Die nützliche Trennung ist:

```text
llmprobe      -> Gibt es ein für Nutzer sichtbares Problem?
Prometheus    -> Was sagt der Server, was passiert ist?
readiness-kit -> Sollten wir Traffic routen, untersuchen oder skalieren?
```

## Die drei Workflows

Das Projekt ist um drei Operator-Workflows gebaut.

### 1. Gate

Das Gate ist für Deployment-Automatisierung.

```bash
./scripts/gate.sh configs/llmprobe/vllm.yml thresholds.yml 30s 5s
```

Es führt externe Probes aus, prüft sie gegen SLA-Schwellen, schreibt die
rohen JSONL-Daten und beendet sich mit `0` oder `1`.

Die Schwellen sind explizit:

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

Das ist die wichtigste Schnittstelle. Ein Dashboard kann eine Person
informieren. Ein Exit Code kann ein Rollout stoppen.

### 2. Diagnose

Die Diagnose korreliert Client-seitige Probe-Daten mit Prometheus.

```bash
python3 scripts/diagnose.py runs/latest/llmprobe.jsonl --prometheus http://localhost:9090
```

Der Report vergleicht Client-TTFT mit Server-TTFT und prüft Queue-Tiefe,
laufende Requests, KV-Cache-Auslastung und Queue-Zeit. Das Ergebnis ist ein
Markdown-Report mit wahrscheinlichen Ursachen und nächsten Schritten.

Beispiel:

```text
Client and server TTFT p95 align (gap: 29ms). No significant network overhead.
No significant issues detected in server metrics.
```

Ist die Lücke groß, zeigt der Report auf Netzwerk- oder Proxy-Overhead. Ist
die Queue voll, zeigt er auf Replikazahl, Concurrency oder Batching-Druck. Ist
der KV-Cache voll, zeigt er auf Sequenzlänge, Cache-Druck und Preemption.

### 3. Capacity

Der Capacity-Workflow testet mehrere Concurrency-Level:

```bash
./scripts/sweep.sh configs/llmprobe/vllm.yml 1,2,4,8,16
```

Er startet parallele Probe-Worker, schreibt ein Run-Verzeichnis pro Level und
generiert eine Vergleichstabelle. Das Ziel ist, den Punkt zu finden, an dem
TTFT, Latenz oder Fehlerrate die SLA überschreiten.

In einem lokalen CPU-Experiment mit Qwen2 0.5B auf 8 vCPUs und 16GB RAM haben
sich vLLM und Ollama sehr unterschiedlich verhalten:

| Concurrency | vLLM TTFT p50 | Ollama TTFT p50 | vLLM Tok/s | Ollama Tok/s |
|-------------|---------------|-----------------|------------|--------------|
| 1 | 110ms | 204ms | 16,4 | 42,3 |
| 4 | 225ms | 750ms | 17,5 | 59,3 |
| 8 | 327ms | 2,50s | 15,4 | 51,8 |
| 16 | 591ms | 6,90s | 10,7 | 53,1 |

Ollama gewann beim Token-Durchsatz, weil es ein quantisiertes llama.cpp-Backend
verwendet hat. vLLM gewann bei der TTFT-Stabilität unter Last. Für interaktive
Workloads mit einem 500ms-TTFT-Ziel ist diese Unterscheidung wichtiger als
roher Durchsatz.

## Wo Grafana hineinpasst

Ich habe trotzdem ein Grafana-Dashboard ergänzt.

Es visualisiert dieselben Prometheus-Signale, die auch das Diagnose-Skript
nutzt: TTFT, End-to-end-Latenz, laufende und wartende Requests,
KV-Cache-Auslastung, Queue-Zeit und Durchsatz.

Aber Grafana ist ein Begleit-Artefakt, nicht der Kern des Produkts.

Der Kern bleibt:

```text
probe -> correlate -> verdict -> report -> exit code
```

Diese Trennung ist wichtig. In einem Incident sind Dashboards gut zur
Inspektion. In einer Deployment-Pipeline muss das System entscheiden.

## Wofür ich das nutzen würde

Ich würde diesen Workflow verwenden, bevor ein neues Modell-Deployment Traffic
bekommt:

1. Endpoint in Staging oder Canary deployen.
2. Readiness Gate gegen die OpenAI-kompatible API ausführen.
3. Wenn es fehlschlägt, Diagnose mit Prometheus laufen lassen.
4. Wenn es besteht, einen kurzen Concurrency Sweep ausführen.
5. Den generierten Markdown-Report als Release-Evidenz behalten.

Das Ergebnis ist ein kleiner, aber praktischer Workflow für LLM-Inferenzbetrieb.
Er ersetzt weder Prometheus noch Grafana noch Kubernetes Readiness Probes. Er
ergänzt den fehlenden Edge-to-edge-LLM-Check: Kann dieser Endpoint Tokens
innerhalb der SLA über den Client-Pfad streamen, den Nutzer tatsächlich treffen?

GitHub:
[github.com/Jwrede/inference-readiness-kit](https://github.com/Jwrede/inference-readiness-kit)
