---
title: "OpenAIs eigenes Cookbook kostet $1.884/Monat im Betrieb. Ein Modelltausch ändert das meiste."
description: "Ich habe OpenAIs Cookbook nach LLM-API-Aufrufen gescannt und die monatlichen Kosten bei 1.000 Aufrufen pro Aufrufstelle geschätzt. Vier gpt-5-Stellen machen 68% der Gesamtkosten aus."
pubDate: 2026-05-08
tags: ["llm", "python", "devtools", "cost"]
lang: "de"
translationKey: "openai-cookbook-cost-scan"
---

## Das Experiment

Ich habe [tokentoll](https://github.com/Jwrede/tokentoll) auf
[openai-cookbook](https://github.com/openai/openai-cookbook) gerichtet,
die offizielle Beispielcode-Sammlung von OpenAI, und eine Frage gestellt:
Wenn jede Aufrufstelle 1.000 Mal pro Monat läuft, wie sieht die
Rechnung aus?

Scope-Caveat: Das ist ein statischer Code-Scan, nicht OpenAIs echte Rechnung.
Er nutzt tokentolls Preisdatenbank zum Scan-Zeitpunkt, nimmt 1.000 Aufrufe pro
Aufrufstelle und Monat an und schätzt Kosten aus erkannten Modellnamen und
Token-Parametern. Das nützliche Signal ist die relative Kostenkonzentration,
nicht der exakte Dollarbetrag.

```
$ tokentoll scan openai-cookbook/

Total estimated monthly cost: $1,884.46
  1000 calls/month per call site
```

24 LLM-API-Aufrufstellen. $1.884 pro Monat.

## Wohin das Geld fließt

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
Evaluierungs-Harnesses und Beispiel-Apps, die auf gpt-4o zurückfallen,
wenn kein Modell angegeben ist.

Die Embedding-Aufrufe sind praktisch kostenlos ($0,04/Monat insgesamt).

## Der 24x-Modelltausch

Die wirkungsvollste Änderung in jeder Codebase ist kein Code-Refactoring.
Es ist der Tausch einer Modellstufe.

Wenn diese 4 gpt-5-Aufrufe durch gpt-4.1-mini ersetzt würden (das viele
Evaluierungs- und Generierungsaufgaben ausreichend gut erledigt), sinken
die Kosten von $1.282 auf etwa $53. Das ist eine 24-fache Reduktion durch
die Änderung eines Strings pro Aufrufstelle.

Das Muster ist kein Gedankenexperiment. Teams sehen regelmäßig
Größenordnungen Unterschied zwischen Modellstufen. Der Modellname ist oft
die teuerste Codezeile in einer LLM-Anwendung.

## Warum das unbemerkt passiert

Die meisten Teams entdecken Kostenprobleme erst durch die Rechnung, Wochen
nachdem der Code ausgerollt wurde. Das Muster ist immer dasselbe:

1. Ein Entwickler wählt während des Prototypings ein Modell (normalerweise das beste verfügbare)
2. Der Code geht mit diesem Modellnamen fest codiert in Produktion
3. Das Aufrufvolumen skaliert
4. Die Finanzabteilung stellt Fragen

Es gibt keine Lint-Regel für "du hast ein teures Modell gewählt." Es
gibt keinen CI-Check, der einen Modelltausch von gpt-4.1-mini zu gpt-5
als 24-fache Kostensteigerung markiert. Die Information steckt im Code,
aber niemand macht sie beim Review sichtbar.

## Im CI abfangen

tokentoll kann als GitHub Action laufen, die PRs mit der Kostenauswirkung
von LLM-Änderungen kommentiert:

```yaml
- uses: Jwrede/tokentoll@v0
  with:
    format: github-comment
```

Wenn jemand ein Modell tauscht oder einen neuen LLM-Aufruf hinzufügt,
zeigt der PR-Kommentar die Vorher/Nachher-Kostenschätzung. Der Reviewer
sieht "$42/Monat -> $320/Monat" bevor er auf Merge klickt.

Lokal lässt es sich auch ausführen:

```
$ tokentoll diff HEAD~1
```

Das vergleicht den aktuellen Code mit dem vorherigen Commit und zeigt,
welche LLM-Aufrufstellen hinzugefügt, entfernt oder geändert wurden,
zusammen mit dem Kostendelta.

## Das Tool

[tokentoll](https://github.com/Jwrede/tokentoll) ist ein Python-CLI,
das Code statisch nach LLM-API-Aufrufen analysiert, deren Kosten schätzt
und die Auswirkung jeder Änderung zeigt. Es unterstützt OpenAI,
Anthropic, Google, LiteLLM und LangChain Call-Patterns. Keine
Laufzeitabhängigkeiten.

Es läuft auch als
[MCP-Server](https://github.com/Jwrede/tokentoll#mcp-server) für Claude
Code, sodass der Agent die Kostenauswirkung vor dem Commit prüfen kann.

```bash
pip install tokentoll
tokentoll scan .
```

GitHub: [github.com/Jwrede/tokentoll](https://github.com/Jwrede/tokentoll)
