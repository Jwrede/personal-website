---
title: "TTFT varied 13x in my LLM provider benchmark snapshot"
description: "Hourly probes across 15 frontier models from OpenAI, Anthropic, Google, DeepSeek, and xAI via OpenRouter. In this snapshot, median TTFT ranged from 321ms to 4,226ms. Raw data included."
pubDate: 2026-05-08
tags: ["llm", "go", "devops", "performance", "benchmark"]
lang: "en"
translationKey: "llm-bench-ttft-13x"
---

## The claim

Every LLM provider publishes throughput numbers from ideal conditions. Nobody
publishes what your production traffic actually experiences: time to first
token (TTFT) measured continuously from a fixed location.

I set up an automated benchmark that probes 15 frontier models every hour
and publishes all raw data. After 30+ hours of data across 5 providers,
this snapshot showed a 13x spread in median TTFT.

Scope caveat: this is not a universal provider benchmark. Requests went through
OpenRouter from one deployment location, sample counts were still small for
some models, and provider routing changes over time. Treat the numbers as a
reproducible snapshot and a reason to measure your own traffic, not as a
permanent ranking.

## The setup

Every hour, a probe sends a minimal request ("Hi", max 20 tokens) to each
model via OpenRouter. The prompt is intentionally tiny to isolate
infrastructure latency from model reasoning time.

**Models tested:**

- OpenAI: GPT-5.4, GPT-5.5, GPT-OSS-120B
- Anthropic: Claude Sonnet 4.6, Claude Opus 4.6, Claude Opus 4.7
- Google: Gemini 2.5 Flash, Gemini 2.5 Flash Lite, Gemini 2.0 Flash
- DeepSeek: DeepSeek v3.2, DeepSeek v4 Flash, DeepSeek v4 Pro
- xAI: Grok 4 Fast, Grok 4.1 Fast, Grok 4.3

## The numbers

| Model | Median TTFT | Median Throughput | Median Latency | Samples |
|-------|------------|-------------------|----------------|---------|
| google/gemini-2.5-flash-lite | 321ms | 191.9 tok/s | 395ms | 17 |
| google/gemini-2.5-flash | 412ms | 235.6 tok/s | 464ms | 17 |
| google/gemini-2.0-flash-001 | 405ms | 203.2 tok/s | 468ms | 17 |
| openai/gpt-5.4 | 912ms | 44.8 tok/s | 1,147ms | 17 |
| openai/gpt-5.5 | 1,158ms | 44.0 tok/s | 1,501ms | 17 |
| openai/gpt-oss-120b | 1,491ms | 1,977.0 tok/s | 1,584ms | 2 |
| anthropic/claude-opus-4.6 | 1,709ms | 70.4 tok/s | 1,939ms | 17 |
| deepseek/deepseek-v3.2 | 1,734ms | 24.7 tok/s | 2,372ms | 17 |
| anthropic/claude-sonnet-4.6 | 2,120ms | 44.3 tok/s | 2,842ms | 17 |
| x-ai/grok-4.1-fast | 2,545ms | 2,985.4 tok/s | 2,593ms | 17 |
| anthropic/claude-opus-4.7 | 2,494ms | 94.9 tok/s | 2,599ms | 17 |
| deepseek/deepseek-v4-flash | 3,122ms | 251.6 tok/s | 3,560ms | 16 |
| deepseek/deepseek-v4-pro | 3,411ms | 108.1 tok/s | 3,816ms | 3 |
| x-ai/grok-4-fast | 3,618ms | 1,338.7 tok/s | 3,682ms | 17 |
| x-ai/grok-4.3 | 4,226ms | 1,114.8 tok/s | 4,328ms | 17 |

## What this means

**Google is the TTFT winner by a wide margin.** All three Gemini models
respond in under 500ms at the median. Gemini 2.5 Flash Lite at 321ms is
the fastest first token across all 15 models.

**OpenAI sits in the middle.** GPT-5.4 at 912ms and GPT-5.5 at 1,158ms
are solid but not exceptional.

**Anthropic has the widest spread within a single provider.** Claude Opus
4.6 at 1,709ms is reasonable. Claude Opus 4.7 at 2,494ms and Sonnet 4.6
at 2,120ms are notably slower on first token.

**xAI and DeepSeek are the slowest to start streaming.** Grok 4.3 takes
a median 4,226ms before the first token arrives. That is 13x slower than
Gemini Flash Lite.

## Fastest TTFT != fastest generation

Throughput tells a completely different story. The xAI Grok models are
the slowest to start but produce tokens at 1,000-3,000 tok/s once they
get going. Grok 4.1 Fast at 2,985 tok/s is 121x faster than DeepSeek
v3.2 at 24.7 tok/s.

If your use case is batch processing where TTFT does not matter, xAI
and DeepSeek v4 Flash are strong choices. If your use case is
interactive chat where users stare at a loading spinner, Google wins.

## Why this matters for production

If you hardcode a 3-second timeout on your LLM calls, 5 of the 15 models
in this benchmark would regularly fail. If you set it at 2 seconds, 8 of
15 would fail at the median.

Most teams set timeouts based on what felt right during development with
one provider. These numbers show that switching providers (or even models
within the same provider) can push you past your timeout without changing
any code.

## Live dashboard and raw data

This benchmark runs continuously. The live dashboard with charts is at
[bench.jonathanwrede.de](https://bench.jonathanwrede.de).

All raw data is published as JSONL and freely available at
[github.com/Jwrede/llm-bench-data](https://github.com/Jwrede/llm-bench-data).
The model list updates daily based on OpenRouter's popularity rankings.

The probing infrastructure is built with
[llmprobe](https://github.com/Jwrede/llmprobe), an open-source Go CLI
that measures TTFT, latency, and throughput using raw HTTP and SSE
parsing (no SDKs). It also works as an
[MCP server](https://github.com/Jwrede/llmprobe#mcp-server) for Claude
Code, so you can check provider health from your editor.
