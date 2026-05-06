---
title: "Ich habe 6 LLM-APIs 7 Tage lang ueberwacht. Das habe ich herausgefunden."
description: "60.000 Probes ueber GPT-4o-mini, Claude 3.5 Haiku, Gemini 2.0 Flash, Llama 3.3 70B, DeepSeek Chat und Mistral Small. Echte Latenzzahlen aus kontinuierlichem Monitoring."
pubDate: 2026-05-05
tags: ["llm", "go", "devops", "performance"]
lang: "de"
heroImage: "/blog/llmprobe/tui-thumbnail.png"
translationKey: "llmprobe-7day-benchmark"
---

## Warum

Wer Anwendungen auf LLM-APIs baut, kennt das Problem: Die Latenzzahlen in
der Provider-Dokumentation zeigen den Best Case. Die Nutzer erleben den p95.

Ich habe [llmprobe](https://github.com/Jwrede/llmprobe) gebaut, ein
Open-Source Go CLI, das LLM-Endpoints probt und Time to First Token (TTFT),
Gesamtlatenz und Generierungsdurchsatz misst. Keine SDKs, nur rohes HTTP
und SSE-Parsing.

Ich habe das Tool auf 6 Modelle ueber OpenRouter gerichtet und eine Woche
laufen lassen.

![llmprobe TUI](/blog/llmprobe/tui-thumbnail.png)

## Setup

Alle 60 Sekunden hat llmprobe einen minimalen Probe ("Hello", max 20 Tokens)
an jedes Modell geschickt. Der Prompt ist bewusst klein gehalten, um
Infrastruktur-Latenz von Modell-Rechenzeit zu trennen.

**Modelle:** GPT-4o-mini, Claude 3.5 Haiku, Gemini 2.0 Flash, Llama 3.3 70B,
DeepSeek Chat, Mistral Small.

**Gesamtprobes:** 60.480 (~10.080 pro Modell).

## Die Zahlen

| Modell | TTFT p50 | TTFT p95 | Latenz | Tok/s | Fehler |
|--------|----------|----------|--------|-------|--------|
| GPT-4o-mini | 645ms | 1.094ms | 776ms | 105,3 | 0 |
| Claude 3.5 Haiku | 731ms | 1.106ms | 1.073ms | 58,1 | 0 |
| Gemini 2.0 Flash | 556ms | 2.313ms | 853ms | 136,8 | 0 |
| Llama 3.3 70B | 761ms | 2.221ms | 1.141ms | 48,3 | 2 |
| DeepSeek Chat | 1.068ms | 3.017ms | 1.656ms | 26,0 | 4 |
| Mistral Small | 2.735ms | 10.852ms | 3.886ms | 191,6 | 3 |

## p50 vs p95 erzaehlen unterschiedliche Geschichten

![TTFT-Vergleich](/blog/llmprobe/blog_ttft_comparison.png)

Gemini 2.0 Flash hat den niedrigsten Median-TTFT (556ms), aber der p95
springt auf 2.313ms. Das ist ein 4x-Multiplikator. GPT-4o-mini und Claude
3.5 Haiku sind vorhersagbarer: Ihr p95 liegt nur bei etwa 1,7x des Medians.

Mistral Small ist der Ausreisser. p50 von 2.735ms, p95 von 10.852ms. Etwa
5% der Anfragen brauchen ueber 10 Sekunden, bis das Streaming beginnt. Das
war ueber die gesamten 7 Tage konsistent, keine temporaere Verschlechterung.

## Schnellster erster Token != schnellste Generierung

![Latenz-Aufschluesselung](/blog/llmprobe/blog_latency_breakdown.png)

Mistral Small hat den schlechtesten TTFT, aber sobald die Generierung
startet, produziert es Tokens mit 191,6 Tok/s (das schnellste im Test).
Gemini 2.0 Flash liegt mit 136,8 Tok/s an zweiter Stelle.

DeepSeek Chat ist in beiden Dimensionen langsam: 1.068ms TTFT und nur
26,0 Tok/s. Die Spanne zwischen schnellstem und langsamstem Durchsatz
betraegt fast 8x.

![Durchsatz](/blog/llmprobe/blog_throughput.png)

## Tail-Latenz ist, wo die Zuverlaessigkeit leidet

![TTFT-Verteilung](/blog/llmprobe/blog_ttft_distribution.png)

GPT-4o-mini und Claude 3.5 Haiku haben die engsten Verteilungen. Man kann
aggressive Timeouts (2s) setzen und trifft sie selten. Gemini und Llama
haben laengere Tails. Mistrals Verteilung ist so breit, dass es fuer
latenzsensitive Anwendungen praktisch unvorhersagbar ist.

## Die 7-Tage-Ansicht zeigt Muster

![TTFT-Zeitverlauf](/blog/llmprobe/blog_ttft_timeline.png)

7 Tage Monitoring zeigt, was kurze Benchmarks nicht erfassen:

- **Mistral Small** hatte periodische Latenz-Spikes ueber die gesamte
  Woche, oft ueber 5.000ms.
- **DeepSeek Chat** zeigte erhoehte Latenz in bestimmten Zeitfenstern,
  wahrscheinlich korreliert mit Spitzennutzung in asiatischen Zeitzonen.
- **GPT-4o-mini und Claude 3.5 Haiku** waren bemerkenswert stabil. Ihre
  Linien schwanken kaum ueber die gesamte Woche.

## Empfehlungen

**Latenzsensitiv** (Chatbots, Echtzeit): GPT-4o-mini oder Gemini 2.0 Flash.
GPT-4o-mini ist vorhersagbarer; Gemini ist im Median schneller, hat aber
breitere Tails.

**Durchsatzsensitiv** (Batch, Zusammenfassung): Mistral Small, wenn man den
TTFT akzeptieren kann. Sonst Gemini 2.0 Flash fuer den besten
Gesamtdurchsatz ohne Latenzstrafe.

**Zuverlaessigkeit** (SLA-gebunden): GPT-4o-mini und Claude 3.5 Haiku. Null
Fehler ueber je 10.000+ Probes. Enge Verteilungen. Keine tageszeitabhaengige
Variation.

## Einsatz als CI/CD-Gate

Die Zahlen oben zeigen, dass Provider-Performance nicht konstant ist. Ein
Modell, das gestern gut lief, kann heute degradiert sein. llmprobe kann
Deployments blockieren, wenn das passiert.

```yaml
# .github/workflows/deploy.yml
- name: LLM-Provider pruefen
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: |
    go install github.com/Jwrede/llmprobe@latest
    llmprobe probe --fail-on degraded
```

`--fail-on degraded` beendet mit Exit-Code 1, wenn ein Endpoint seine
TTFT- oder Latenz-Schwellenwerte ueberschreitet. Das Deployment stoppt.
Kein degradiertes Modell erreicht Production.

Schwellenwerte werden pro Modell in `probes.yml` konfiguriert:

```yaml
providers:
  - name: openai
    api_key: ${OPENAI_API_KEY}
    models:
      - name: gpt-4o-mini
        thresholds:
          max_ttft: 2s
          max_latency: 5s
          min_tokens_per_sec: 50
```

Basierend auf den 7-Tage-Daten waeren sinnvolle TTFT-Schwellenwerte:

| Modell | Empfohlener max_ttft | Begruendung |
|--------|----------------------|-------------|
| GPT-4o-mini | 1,5s | Deckt p95 (1.094ms) mit Puffer ab |
| Claude 3.5 Haiku | 1,5s | Deckt p95 (1.106ms) mit Puffer ab |
| Gemini 2.0 Flash | 3s | Breiter Tail, braucht Spielraum |
| Llama 3.3 70B | 3s | p95 bei 2.221ms |
| DeepSeek Chat | 5s | Natuerlich langsam, enger Schwellenwert wuerde flappen |
| Mistral Small | 15s | p95 bei 10.852ms, nur Ausfaelle gaten |

So wird aus "Ich hoffe, die API funktioniert" ein "Ich weiss, dass die
API funktioniert, die Pipeline hat es vor 30 Sekunden geprueft."

## Das Tool

llmprobe unterstuetzt OpenAI, Anthropic, Google, Azure, AWS Bedrock und
jeden OpenAI-kompatiblen Endpoint (Groq, Together, Fireworks, DeepSeek,
Mistral, OpenRouter, Ollama, vLLM). Jeder Provider ist ein duenner
HTTP-Wrapper mit SSE-Parsing. Der Bedrock-Client implementiert SigV4-Signing
und AWS Binary Event Stream Parsing von Grund auf.

```bash
go install github.com/Jwrede/llmprobe@latest
llmprobe watch --tui --interval 60s
```

GitHub: [github.com/Jwrede/llmprobe](https://github.com/Jwrede/llmprobe)

## Live-Benchmark

Seit der Veroeffentlichung dieses Artikels habe ich das Experiment zu einem
kontinuierlichen, automatisierten Benchmark ausgebaut. Er trackt jetzt 15
Frontier-Modelle von OpenAI, Anthropic, Google, DeepSeek und xAI, die
stuendlich geprobt werden. Die Modellliste aktualisiert sich taeglich
anhand der woechentlichen Popularitaets-Rankings von OpenRouter, sodass
neue Modelle automatisch aufgenommen werden.

Das Live-Dashboard ist unter
[bench.jonathanwrede.de](https://bench.jonathanwrede.de) erreichbar und
alle Rohdaten werden als JSONL unter
[github.com/Jwrede/llm-bench-data](https://github.com/Jwrede/llm-bench-data)
veroeffentlicht.

Infrastruktur-Code:
[github.com/Jwrede/llm-bench](https://github.com/Jwrede/llm-bench)
