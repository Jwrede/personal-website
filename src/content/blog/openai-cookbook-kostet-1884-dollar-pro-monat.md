---
title: "OpenAIs eigenes Cookbook kostet $1.884/Monat im Betrieb. Ein Modelltausch aendert das meiste."
description: "Ich habe OpenAIs Cookbook nach LLM-API-Aufrufen gescannt und die monatlichen Kosten bei 1.000 Aufrufen pro Stelle geschaetzt. Vier gpt-5-Stellen machen 68% der Gesamtkosten aus."
pubDate: 2026-05-08
tags: ["llm", "python", "devtools", "cost"]
lang: "de"
translationKey: "openai-cookbook-cost-scan"
---

## Das Experiment

Ich habe [tokentoll](https://github.com/Jwrede/tokentoll) auf
[openai-cookbook](https://github.com/openai/openai-cookbook) gerichtet,
OpenAIs offizielle Sammlung von Beispielcode, und eine Frage gestellt:
Wenn jede Aufrufstelle 1.000 Mal pro Monat laeuft, wie sieht die
Rechnung aus?

```
$ tokentoll scan openai-cookbook/

Total estimated monthly cost: $1,884.46
  1000 calls/month per call site
```

24 LLM-API-Aufrufstellen. $1.884 pro Monat.

## Wohin das Geld fliesst

| Modell | Aufrufstellen | Monatliche Kosten |
|--------|--------------|-------------------|
| gpt-5 | 4 | $1.282,50 |
| gpt-4o | 13 | $508,77 |
| gpt-4.1 | 1 | $66,54 |
| gpt-4.1-mini | 2 | $26,61 |
| text-embedding-3-small | 4 | $0,04 |

Vier gpt-5-Aufrufstellen machen 68% der Gesamtkosten aus. Diese vier
Stellen befinden sich im Prompt-Optimierungs-Cookbook (Baseline-Generierung,
optimierte Generierung und zwei LLM-Judge-Aufrufe). Jede einzelne kostet
$320/Monat beim angenommenen Volumen.

Die 13 gpt-4o-Stellen kosten zusammen $508/Monat. Die meisten davon sind
Evaluierungs-Harnesses und Beispiel-Apps, die auf gpt-4o zurueckfallen,
wenn kein Modell angegeben ist.

Die Embedding-Aufrufe sind praktisch kostenlos ($0,04/Monat insgesamt).

## Der 24x-Modelltausch

Die wirkungsvollste Aenderung in jeder Codebase ist kein Code-Refactoring.
Es ist der Tausch einer Modellstufe.

Wenn diese 4 gpt-5-Aufrufe durch gpt-4.1-mini ersetzt wuerden (das viele
Evaluierungs- und Generierungsaufgaben adaequat bewerkstelligt), sinken
die Kosten von $1.282 auf etwa $53. Das ist eine 24-fache Reduktion durch
die Aenderung eines Strings pro Aufrufstelle.

Das ist kein Gedankenexperiment. Uber hat sein gesamtes AI-Coding-Budget
fuer 2026 bis April aufgebraucht. Teams berichten von 15- bis 60-fachen
Kostenunterschieden zwischen Modellstufen. Der Modellname ist die teuerste
Codezeile in jeder LLM-Anwendung.

## Warum das unbemerkt passiert

Die meisten Teams entdecken Kostenprobleme erst durch die Rechnung, Wochen
nachdem der Code ausgerollt wurde. Das Muster ist immer dasselbe:

1. Ein Entwickler waehlt ein Modell waehrend des Prototypings (normalerweise das beste verfuegbare)
2. Der Code geht mit diesem Modellnamen hardcoded in Produktion
3. Das Aufrufvolumen skaliert
4. Die Finanzabteilung stellt Fragen

Es gibt keine Lint-Regel fuer "du hast ein teures Modell gewaehlt." Es
gibt keinen CI-Check, der einen Modelltausch von gpt-4.1-mini zu gpt-5
als 24-fache Kostensteigerung markiert. Die Information steckt im Code,
aber niemand macht sie beim Review sichtbar.

## Im CI abfangen

tokentoll kann als GitHub Action laufen, die PRs mit der Kostenauswirkung
von LLM-Aenderungen kommentiert:

```yaml
- uses: Jwrede/tokentoll@v0
  with:
    format: github-comment
```

Wenn jemand ein Modell tauscht oder einen neuen LLM-Aufruf hinzufuegt,
zeigt der PR-Kommentar die Vorher/Nachher-Kostenschaetzung. Der Reviewer
sieht "$42/Monat -> $320/Monat" bevor er auf Merge klickt.

Lokal laesst es sich auch ausfuehren:

```
$ tokentoll diff HEAD~1
```

Das vergleicht den aktuellen Code mit dem vorherigen Commit und zeigt,
welche LLM-Aufrufstellen hinzugefuegt, entfernt oder geaendert wurden,
zusammen mit dem Kostendelta.

## Das Tool

[tokentoll](https://github.com/Jwrede/tokentoll) ist ein Python-CLI,
das Code statisch nach LLM-API-Aufrufen analysiert, deren Kosten schaetzt
und die Auswirkung jeder Aenderung zeigt. Es unterstuetzt OpenAI,
Anthropic, Google, LiteLLM und LangChain Call-Patterns. Keine
Laufzeitabhaengigkeiten.

Es laeuft auch als
[MCP-Server](https://github.com/Jwrede/tokentoll#mcp-server) fuer Claude
Code, sodass der Agent die Kostenauswirkung vor dem Commit pruefen kann.

```bash
pip install tokentoll
tokentoll scan .
```

GitHub: [github.com/Jwrede/tokentoll](https://github.com/Jwrede/tokentoll)
