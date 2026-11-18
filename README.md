# Investment Tool v3

Schnelle Ankaufsprüfung für Bestandsimmobilien: Mieterliste → Pricing → DCF-light → Sensitivitäten → BOV → Excel.

## Start

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # Rechenkern + Import (20 Tests)
npm run verify:excel # Excel-Export mit LibreOffice nachrechnen und mit dem Tool vergleichen
```

Optional `.env.local` mit `ANTHROPIC_API_KEY` für die KI-gestützte Erkennung beim Import
(ohne Schlüssel läuft die regelbasierte Erkennung für Excel, CSV, PDF, Word und Text).

## Rechenregeln (src/lib/model/calc.ts)

| Größe | Definition |
|---|---|
| Restlaufzeit | (Mietende − Stichtag) in Tagen / 365,25, min. 0; unbefristet = einstellbarer Wert (Standard 0) |
| WALT je Nutzung | Σ (Jahresmiete × Restlaufzeit) / Σ Jahresmiete der Nutzung |
| WALT gesamt | Σ aller (Jahresmiete × Restlaufzeit) / gesamte Jahresmiete (mietgewichtet, nicht Ø der Nutzungen) |
| WALB | wie WALT, aber bis zum frühesten Sonderkündigungsrecht |
| Kaufpreis | einzige gespeicherte Preisgröße; Faktor, €/m², BAR, NIY werden daraus abgeleitet und beim Verstellen in den Kaufpreis zurückgerechnet |
| Faktor (Potenzial) | (Kaufpreis + Vermietungskosten) / Potenzialmiete |
| Vermietungskosten Leerstand | Ausbau €/m² × leere Fläche + (Makler + mietfrei + Leerstandsmonate) × Marktmiete + NK im Leerstand |
| Kaufpreis Faktormethode | Zielfaktor × Potenzialmiete − Vermietungskosten |
| NIY | (Ist-Miete × (1 − Verwaltung − MAW − nicht uml.) − Instandhaltung − NK Leerstand) / (Kaufpreis × (1 + NK)) |
| Cashflow | monatlich je Einheit simuliert, jährlich aggregiert; Indexierung jährlich; bei Vertragsende Anschlussvermietung zur Marktmiete, gewichtet mit Verlängerungsquote |
| Exit | Exit-Faktor × Mieteinnahmen des Folgejahres − Verkaufskosten |
| Max. Kaufpreis DCF | Kaufpreis, bei dem NPV zum Diskontierungszins = 0 |

Der Excel-Export bildet dieselben Regeln als Formeln ab; `npm run verify:excel` prüft 199 Werte centgenau.

## Struktur

- `src/lib/model` – Rechenkern, Sensitivitäten, BOV (rein, getestet)
- `src/lib/import` – Zahlen/Datum, Mieterlisten-Erkennung, PDF-Zeilen, Text-Heuristiken, Zusammenführung
- `src/app/api/extract` – KI-Extraktion (Claude, strukturierte Ausgabe)
- `src/lib/export/excel.ts` – Excel mit 8 Reitern, benannten Zellen, Formeln
- `src/components` – Oberfläche
