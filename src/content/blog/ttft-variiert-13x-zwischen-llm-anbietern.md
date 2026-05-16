---
title: "TTFT variierte 13x in meinem LLM-Provider-Benchmark-Snapshot"
description: "Stündliche Messungen an 15 Frontier-Modellen von OpenAI, Anthropic, Google, DeepSeek und xAI über OpenRouter. In diesem Snapshot reichte der Median-TTFT von 321ms bis 4.226ms. Rohdaten inklusive."
pubDate: 2026-05-08
tags: ["llm", "go", "devops", "performance", "benchmark"]
lang: "de"
translationKey: "llm-bench-ttft-13x"
---

## Die These

Jeder LLM-Anbieter veröffentlicht Durchsatzzahlen unter Idealbedingungen.
Niemand veröffentlicht, was der Produktionstraffic tatsächlich erlebt:
Time to First Token (TTFT), kontinuierlich von einem festen Standort aus
gemessen.

Ich habe einen automatisierten Benchmark aufgesetzt, der 15 Frontier-Modelle
stündlich testet und alle Rohdaten veröffentlicht. Nach über 30 Stunden
Daten über 5 Anbieter hinweg zeigte dieser Snapshot eine 13x-Spanne beim
Median-TTFT.

Einschränkung: Das ist kein universeller Provider-Benchmark. Die Requests liefen
über OpenRouter von einem Deployment-Standort, die Sample-Zahlen waren für
einige Modelle noch klein, und Provider-Routing ändert sich über die Zeit.
Die Zahlen sind ein reproduzierbarer Snapshot und ein Grund, den eigenen
Traffic zu messen, kein dauerhaftes Ranking.

## Das Setup

Jede Stunde sendet ein Probe eine minimale Anfrage ("Hi", max 20 Tokens)
an jedes Modell über OpenRouter. Der Prompt ist absichtlich winzig, um
die Infrastrukturlatenz von der Modell-Rechenzeit zu isolieren.

**Getestete Modelle:**

- OpenAI: GPT-5.4, GPT-5.5, GPT-OSS-120B
- Anthropic: Claude Sonnet 4.6, Claude Opus 4.6, Claude Opus 4.7
- Google: Gemini 2.5 Flash, Gemini 2.5 Flash Lite, Gemini 2.0 Flash
- DeepSeek: DeepSeek v3.2, DeepSeek v4 Flash, DeepSeek v4 Pro
- xAI: Grok 4 Fast, Grok 4.1 Fast, Grok 4.3

## Die Zahlen

| Modell | Median TTFT | Median Durchsatz | Median Latenz | Messungen |
|--------|------------|------------------|---------------|-----------|
| google/gemini-2.5-flash-lite | 321ms | 191,9 Tok/s | 395ms | 17 |
| google/gemini-2.5-flash | 412ms | 235,6 Tok/s | 464ms | 17 |
| google/gemini-2.0-flash-001 | 405ms | 203,2 Tok/s | 468ms | 17 |
| openai/gpt-5.4 | 912ms | 44,8 Tok/s | 1.147ms | 17 |
| openai/gpt-5.5 | 1.158ms | 44,0 Tok/s | 1.501ms | 17 |
| openai/gpt-oss-120b | 1.491ms | 1.977,0 Tok/s | 1.584ms | 2 |
| anthropic/claude-opus-4.6 | 1.709ms | 70,4 Tok/s | 1.939ms | 17 |
| deepseek/deepseek-v3.2 | 1.734ms | 24,7 Tok/s | 2.372ms | 17 |
| anthropic/claude-sonnet-4.6 | 2.120ms | 44,3 Tok/s | 2.842ms | 17 |
| x-ai/grok-4.1-fast | 2.545ms | 2.985,4 Tok/s | 2.593ms | 17 |
| anthropic/claude-opus-4.7 | 2.494ms | 94,9 Tok/s | 2.599ms | 17 |
| deepseek/deepseek-v4-flash | 3.122ms | 251,6 Tok/s | 3.560ms | 16 |
| deepseek/deepseek-v4-pro | 3.411ms | 108,1 Tok/s | 3.816ms | 3 |
| x-ai/grok-4-fast | 3.618ms | 1.338,7 Tok/s | 3.682ms | 17 |
| x-ai/grok-4.3 | 4.226ms | 1.114,8 Tok/s | 4.328ms | 17 |

## Was das bedeutet

**Google gewinnt beim TTFT mit großem Abstand.** Alle drei Gemini-Modelle
antworten im Median in unter 500ms. Gemini 2.5 Flash Lite mit 321ms liefert
das schnellste erste Token über alle 15 Modelle.

**OpenAI liegt im Mittelfeld.** GPT-5.4 mit 912ms und GPT-5.5 mit 1.158ms
sind solide, aber nicht herausragend.

**Anthropic hat die größte Streuung innerhalb eines Anbieters.** Claude
Opus 4.6 mit 1.709ms ist akzeptabel. Claude Opus 4.7 mit 2.494ms und
Sonnet 4.6 mit 2.120ms sind beim ersten Token deutlich langsamer.

**xAI und DeepSeek sind am langsamsten beim Streaming-Start.** Grok 4.3
braucht im Median 4.226ms bis zum ersten Token. Das ist 13x langsamer als
Gemini Flash Lite.

## Schnellstes erstes Token != schnellste Generierung

Der Durchsatz erzählt eine völlig andere Geschichte. Die xAI-Grok-Modelle
sind am langsamsten beim Start, produzieren aber 1.000 bis 3.000 Tok/s,
sobald sie loslegen. Grok 4.1 Fast mit 2.985 Tok/s ist 121x schneller als
DeepSeek v3.2 mit 24,7 Tok/s.

Wenn Batch-Verarbeitung der Anwendungsfall ist und TTFT keine Rolle spielt,
sind xAI und DeepSeek v4 Flash starke Optionen. Wenn der Anwendungsfall
interaktiver Chat ist, bei dem Nutzer auf einen Ladebalken starren, gewinnt
Google.

## Warum das für die Produktion wichtig ist

Wer einen 3-Sekunden-Timeout für LLM-Aufrufe fest einstellt, würde bei 5
der 15 Modelle in diesem Benchmark regelmäßig scheitern. Bei 2 Sekunden
wären es 8 von 15 im Median.

Die meisten Teams setzen Timeouts basierend auf dem, was sich während der
Entwicklung mit einem Anbieter richtig anfühlte. Diese Zahlen zeigen, dass
ein Anbieterwechsel (oder sogar ein Modellwechsel beim selben Anbieter) das
Timeout überschreiten kann, ohne dass sich am Code etwas ändert.

## Live-Dashboard und Rohdaten

Dieser Benchmark läuft kontinuierlich. Das Live-Dashboard mit Diagrammen
ist unter [bench.jonathanwrede.de](https://bench.jonathanwrede.de) erreichbar.

Alle Rohdaten werden als JSONL veröffentlicht und sind frei verfügbar unter
[github.com/Jwrede/llm-bench-data](https://github.com/Jwrede/llm-bench-data).
Die Modellliste aktualisiert sich täglich basierend auf OpenRouters
Popularitätsrankings.

Die Probing-Infrastruktur ist mit
[llmprobe](https://github.com/Jwrede/llmprobe) gebaut, einem
Open-Source-Go-CLI, das TTFT, Latenz und Durchsatz per HTTP und SSE-Parsing
misst (keine SDKs). Es funktioniert auch als
[MCP-Server](https://github.com/Jwrede/llmprobe#mcp-server) für Claude
Code, sodass man die Anbieter-Gesundheit direkt aus dem Editor prüfen kann.
