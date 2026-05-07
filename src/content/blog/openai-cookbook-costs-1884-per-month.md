---
title: "OpenAI's own cookbook costs $1,884/month to run. One model swap fixes most of it."
description: "I scanned OpenAI's cookbook for LLM API calls and estimated the monthly cost at 1,000 calls per site. Four gpt-5 call sites account for 68% of the total spend."
pubDate: 2026-05-08
tags: ["llm", "python", "devtools", "cost"]
lang: "en"
translationKey: "openai-cookbook-cost-scan"
---

## The experiment

I pointed [tokentoll](https://github.com/Jwrede/tokentoll) at
[openai-cookbook](https://github.com/openai/openai-cookbook), OpenAI's
official collection of example code, and asked it one question: if every
call site ran 1,000 times per month, what would the bill look like?

```
$ tokentoll scan openai-cookbook/

Total estimated monthly cost: $1,884.46
  1000 calls/month per call site
```

24 LLM API call sites. $1,884 per month.

## Where the money goes

| Model | Call sites | Monthly cost |
|-------|-----------|-------------|
| gpt-5 | 4 | $1,282.50 |
| gpt-4o | 13 | $508.77 |
| gpt-4.1 | 1 | $66.54 |
| gpt-4.1-mini | 2 | $26.61 |
| text-embedding-3-small | 4 | $0.04 |

Four gpt-5 call sites account for 68% of the total. Those four sites
are in the prompt optimization cookbook (baseline generation, optimized
generation, and two LLM judge calls). Each one costs $320/month at the
assumed volume.

The 13 gpt-4o sites collectively cost $508/month. Most of these are
evaluation harnesses and example apps that default to gpt-4o when no
model is specified.

The embedding calls are effectively free ($0.04/month total).

## The 24x model swap

The most impactful change in any codebase is not refactoring code. It
is swapping a model tier.

If those 4 gpt-5 calls were replaced with gpt-4.1-mini (which handles
many evaluation and generation tasks adequately), the cost drops from
$1,282 to roughly $53. That is a 24x reduction from changing one string
per call site.

This is not a hypothetical. Uber burned through their entire 2026 AI
coding budget by April. Teams report 15-60x cost differences between
model tiers. The model name is the most expensive line of code in any
LLM application.

## Why this happens silently

Most teams discover cost problems from the invoice, weeks after the
code shipped. The pattern is always the same:

1. Developer picks a model during prototyping (usually the best available)
2. Code ships to production with that model name still hardcoded
3. Call volume scales
4. Finance asks questions

There is no lint rule for "you picked an expensive model." There is no
CI check that flags a model swap from gpt-4.1-mini to gpt-5 as a
24x cost increase. The information exists in the code, but nobody
surfaces it at review time.

## Catching it in CI

tokentoll can run as a GitHub Action that comments on PRs with the cost
impact of LLM changes:

```yaml
- uses: Jwrede/tokentoll@v0
  with:
    format: github-comment
```

When someone swaps a model or adds a new LLM call, the PR comment shows
the before/after cost estimate. The reviewer sees "$42/month -> $320/month"
before clicking merge.

You can also run it locally:

```
$ tokentoll diff HEAD~1
```

This compares the current code against the previous commit and shows
which LLM call sites were added, removed, or changed, along with the
cost delta.

## The tool

[tokentoll](https://github.com/Jwrede/tokentoll) is a Python CLI that
statically analyzes code for LLM API calls, estimates their cost, and
shows the impact of every change. It supports OpenAI, Anthropic, Google,
LiteLLM, and LangChain call patterns. Zero runtime dependencies.

It also runs as an
[MCP server](https://github.com/Jwrede/tokentoll#mcp-server) for Claude
Code, so the agent can check cost impact before committing.

```bash
pip install tokentoll
tokentoll scan .
```

GitHub: [github.com/Jwrede/tokentoll](https://github.com/Jwrede/tokentoll)
