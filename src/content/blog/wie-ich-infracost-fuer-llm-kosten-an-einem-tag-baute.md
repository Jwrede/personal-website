---
title: "Wie ich Infracost für LLM-Kosten an einem Tag gebaut habe"
description: "tokentoll, ein Infracost-ähnliches Tool für die Kostenwirkung von LLM-API-Calls, in einem Tag gebaut. Architektur, Modellnamen-Auflösung, mehrstufige Konstantenpropagation und Validierung an zwanzig realen Codebases."
pubDate: 2026-05-03
tags: ["llm", "python", "devtools", "building"]
lang: "de"
translationKey: "infracost-llm-spend"
---

## Die Idee

Jedes Team, das LLM-APIs nutzt, hat dasselbe Problem: Kostenüberraschungen. Ein
Modellwechsel, ein neuer Endpoint, ein vergessener `max_tokens`-Parameter -
und plötzlich explodiert die Rechnung.

Infracost hat das für Terraform gelöst: Code-Diffs analysieren und die
Cloud-Kostenwirkung am Pull Request anzeigen. Ich habe etwas ähnliches für LLMs gebaut.

![tokentoll Demo](https://raw.githubusercontent.com/Jwrede/tokentoll/main/demo/demo.gif)

## Die Architektur

tokentoll hat fünf Schichten:

1. **Scanner**: läuft durch Python-Dateien, ruft die passenden Detektoren auf
2. **Detektoren**: einer pro SDK (OpenAI, Anthropic, Google, LiteLLM, LangChain),
   jeder weiß, wie API-Calls im AST gefunden werden
3. **Pricing-Engine**: Modellname -> Kosten pro Token, mit gestaffelter
   Auflösung, SDK-spezifischen Defaults für dynamische Modelle und lokalem Cache
4. **Diff-Engine**: vergleicht alte und neue Calls anhand von Datei- und
   Zeilennähe
5. **Output-Formatter**: Tabelle (CLI), Markdown (PR-Kommentar), JSON

Die zentralen Designentscheidungen:

- **Keine Runtime-Dependencies.** Alles läuft auf der stdlib: `ast` zum Parsen,
  `json` für Daten, `subprocess` für Git, `argparse` für die CLI, `urllib` für
  Preisabrufe. Die Installation ist sofort fertig und das Tool ist
  vertrauenswürdig.

- **Detektoren sind plugbar.** Ein neues SDK hinzufügen heißt: eine Datei
  schreiben, die `can_handle()` und `detect()` implementiert. Keine Änderungen
  am Scanner oder an der Pipeline.

- **Pricing wird lokal gecached.** Beim ersten Run lädt tokentoll die
  Pricing-Datenbank von LiteLLM (2.200+ Modelle) und cached sie in
  `~/.tokentoll/`. Es warnt bei einem veralteten Cache und schlägt bei zu
  altem Cache fehl.

- **SDK-spezifische Defaults.** Wenn ein Modellname dynamisch ist (zur Laufzeit
  aus Config oder Env-Variablen geladen), nimmt tokentoll das gängigste Modell
  des jeweiligen SDKs an: gpt-4o für OpenAI, claude-sonnet für Anthropic,
  gemini-flash für Google. So bekommst du auch für dynamischen Code immer eine
  Kostenschätzung.

## Der schwierigste Teil

Die Modellnamen-Auflösung. User schreiben `model="gpt-4o"` im Code, aber die
Pricing-Datenbank hat Einträge wie `gpt-4o`, `openai/gpt-4o`,
`gpt-4o-2024-08-06`, `azure/gpt-4o` und so weiter.

Die Lösung ist eine gestaffelte Auflösungskette:

1. Exakter Match
2. Case-insensitiver Match
3. SDK-Prefix anhängen und matchen (`openai/gpt-4o`)
4. Provider-Prefix aus den DB-Keys entfernen und matchen
5. Region-Prefix entfernen (`us.`, `eu.`, `apac.`)
6. Datums-Suffix entfernen (`-2024-08-06`, `-20240806`)

Das deckt 95 %+ der realen Modellnamen ab, die ich beim Scan von
Open-Source-Projekten gefunden habe.

## Mehrstufige Konstantenpropagation

Der zweitschwierigste Teil: Modellnamen sind selten String-Literale. Sie
fließen durch Variablen, Klassenattribute, Config-Objekte und `**kwargs`.

```python
DEFAULT_MODEL = os.getenv("MODEL", "gpt-4o")

class Config:
    model: str = DEFAULT_MODEL

config = Config()
kwargs = {"model": config.model, "max_tokens": 2000}
client.chat.completions.create(**kwargs)
# tokentoll löst auf: model="gpt-4o", max_tokens=2000
```

Die Engine iteriert bis zum Fixpunkt und folgt dabei: Variablenzuweisungen,
`os.getenv()`-Fallbacks, Function-Defaults, Klassenattribut-Defaults,
Konstruktor-Argumentpropagation, Dict-Inhalten und `**kwargs`-Unpacking.

## Konfiguration

Eine `.tokentoll.yml`-Datei steuert das Verhalten pro Projekt:

```yaml
calls_per_month: 5000
default_models:
  openai: gpt-4o-mini
  anthropic: claude-haiku-3-20240307
overrides:
  - path: tests/
    calls_per_month: 100
```

Pfad-Overrides nutzen Longest-Prefix-Matching, damit du für Testcode,
Agent-Pipelines und Batchjobs unterschiedliche Annahmen setzen kannst.

## Validierung

Bevor ich es als fertig betrachtet habe, habe ich tokentoll an zwanzig realen
Codebases getestet, darunter NadirClaw, PraisonAI, agentops, swarms, honcho,
atomic-agents und andere. Es hat OpenAI-, Anthropic-, Google- und LiteLLM-Calls
in allen Projekten korrekt erkannt, und die SDK-spezifischen Defaults haben
auch dort sinnvolle Kostenschätzungen produziert, wo Modellnamen erst zur
Laufzeit aus der Config geladen werden.

## Ausprobieren

```bash
pip install tokentoll
tokentoll scan .
tokentoll diff HEAD~1
```

GitHub: [github.com/Jwrede/tokentoll](https://github.com/Jwrede/tokentoll)
