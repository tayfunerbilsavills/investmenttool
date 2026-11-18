import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, parseNumber, normalizeNutzung } from "../src/lib/import/parse";
import { parseRentRoll, rowsFromText } from "../src/lib/import/rentroll";
import { extractFacts } from "../src/lib/import/facts";

test("Zahlen deutsch/englisch", () => {
  assert.equal(parseNumber("1.234.567,89 €"), 1234567.89);
  assert.equal(parseNumber("1,234,567.89"), 1234567.89);
  assert.equal(parseNumber("12,5"), 12.5);
  assert.equal(parseNumber("12.500"), 12500);
  assert.equal(parseNumber("0,125"), 0.125);
  assert.equal(parseNumber("18,5 Mio. €"), 18_500_000);
  assert.equal(parseNumber("820 m²"), 820);
  assert.equal(parseNumber(""), null);
});

test("Datum", () => {
  assert.equal(parseDate("31.12.2030"), "2030-12-31");
  assert.equal(parseDate("06/2029"), "2029-06-30");
  assert.equal(parseDate("2031"), "2031-12-31");
  assert.equal(parseDate(47483), "2029-12-31");
  assert.equal(parseDate("unbefristet"), null);
});

test("Nutzungsarten", () => {
  assert.equal(normalizeNutzung("Büroflächen"), "Büro");
  assert.equal(normalizeNutzung("TG-Stellplatz"), "Stellplätze");
  assert.equal(normalizeNutzung("Laden EG"), "Einzelhandel");
  assert.equal(normalizeNutzung("Whg. 3"), "Wohnen");
});

test("Mieterliste aus Excel-Zeilen (Jahresmiete, Leerstand, Summenzeile)", () => {
  const rows = [
    ["Mieterliste Objekt XY", null, null],
    [],
    ["Einheit", "Mieter", "Nutzungsart", "Geschoss", "Mietfläche m²", "Nettokaltmiete p.a. €", "Mietende", "Option"],
    ["01", "Rossmann GmbH", "Laden", "EG", "650,00", "152.100,00", "31.03.2031", ""],
    ["02", "Kanzlei Weber", "Büro", "1. OG", 820, 169248, "30.06.2028", "30.06.2027"],
    ["03", "Leerstand", "Büro", "3. OG", 820, 0, "", ""],
    ["04", "Garagenmieter", "TG-Stellplätze", "UG", 20, 26400, "", ""],
    ["Summe", "", "", "", 2310, 347748, "", ""],
  ];
  const r = parseRentRoll(rows)!;
  assert.ok(r);
  assert.equal(r.units.length, 4);
  const [a, b, c, d] = r.units;
  assert.equal(a.nutzung, "Einzelhandel");
  assert.equal(a.flaeche, 650);
  assert.equal(a.mieteMonat, 12675);
  assert.equal(a.mietende, "2031-03-31");
  assert.equal(b.option, "2027-06-30");
  assert.equal(c.leer, true);
  assert.equal(d.nutzung, "Stellplätze");
  assert.equal(d.einheit, "stk");
  assert.equal(d.mieteMonat, 2200);
  assert.deepEqual(r.sumRow, { flaeche: 2310, miete: 347748 / 12 });
});

test("Mieterliste aus PDF-Text mit unspezifizierter Mietspalte (€/m²)", () => {
  const text = `Mieter                Fläche     Miete    Laufzeit
Bäckerei Schmidt      120 m²     22,50    12/2030
Physiopraxis Lang     240 m²     15,00    31.12.2029
leer                  300 m²     -        -`;
  const r = parseRentRoll(rowsFromText(text))!;
  assert.ok(r);
  assert.equal(r.units.length, 3);
  assert.equal(r.units[0].mieteMonat, 2700);
  assert.equal(r.units[0].nutzung, "Gastronomie");
  assert.equal(r.units[1].nutzung, "Praxis");
  assert.equal(r.units[1].mieteMonat, 3600);
  assert.equal(r.units[2].leer, true);
  assert.equal(r.units[0].mietende, "2030-12-31");
});

test("Objektdaten aus Exposé-Text", () => {
  const f = extractFacts(`Exposé – Wohn- und Geschäftshaus
Kaiserstraße 12, 60311 Frankfurt am Main
Baujahr: 1965, modernisiert 2018. Grundstücksfläche ca. 820 m²
Gesamtmietfläche: 2.450 m², 12 TG-Stellplätze
Jahresnettokaltmiete: 612.500 €
Kaufpreis: 14,5 Mio. € (Faktor 23,7)
WALT 4,2 Jahre, Leerstandsquote 8,5 %`);
  assert.equal(f.adresse, "Kaiserstraße 12");
  assert.equal(f.plz, "60311");
  assert.equal(f.ort, "Frankfurt am Main");
  assert.equal(f.bundesland, "Hessen");
  assert.equal(f.baujahr, "1965");
  assert.equal(f.modernisierung, "2018");
  assert.equal(f.grundstueck, 820);
  assert.equal(f.mietflaeche, 2450);
  assert.equal(f.stellplaetze, 12);
  assert.equal(f.jahresmiete, 612500);
  assert.equal(f.kaufpreis, 14_500_000);
  assert.equal(f.faktor, 23.7);
  assert.equal(f.walt, 4.2);
  assert.equal(f.leerstand, 0.085);
});

test("PDF-Exposé: Tabelle mit enger Kopfzeile wird spaltengenau erkannt", async () => {
  const { readFileSync } = await import("node:fs");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { pdfItemsToLines } = await import("../src/lib/import/pdfLines");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("tests/fixtures/expose.pdf")) }).promise;
  const page = await doc.getPage(1);
  const lines = pdfItemsToLines((await page.getTextContent()).items as never);
  const r = parseRentRoll(rowsFromText(lines.join("\n")))!;
  assert.equal(r.units.length, 5);
  const [bank, kanzlei, beratung, leer, tg] = r.units;
  assert.equal(bank.mieteMonat, 22400);
  assert.equal(bank.mietende, "2031-12-31");
  assert.equal(kanzlei.flaeche, 1400);
  assert.equal(kanzlei.mieteMonat, 39200);
  assert.equal(beratung.mietende, "2027-12-31");
  assert.equal(leer.leer, true);
  assert.equal(tg.nutzung, "Stellplätze");
  assert.equal(tg.flaeche, 28);
  assert.equal(tg.mieteMonat, 3360);
  assert.equal(tg.mietende, "");
});

test("Excel-Datei mit Deckblatt: Mieterliste im zweiten Reiter wird gefunden", async () => {
  const { readFileSync } = await import("node:fs");
  const XLSX = await import("xlsx");
  const { bestRentRoll } = await import("../src/lib/import/merge");
  const wb = XLSX.read(readFileSync("tests/fixtures/mieterliste.xlsx"), { type: "buffer", cellDates: true });
  const tables = wb.SheetNames.map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) as never[] }));
  const best = bestRentRoll([{ fileName: "mieterliste.xlsx", kind: "excel", text: "", tables }])!;
  assert.equal(best.sheet, "Mieterliste");
  assert.equal(best.units.length, 7);
  assert.equal(best.units.reduce((x, u) => x + (u.leer ? 0 : u.mieteMonat), 0), 70785);
  assert.equal(best.units[2].option, "2028-06-30");
});

test("ERP-Export (SAP/PM, 50+ Spalten): richtige Miet-, Mieter- und Leerstandsspalten", () => {
  // Spaltenstruktur eines realen PM-Exports, Werte erfunden
  const H = ["Buchungskreis", "Wirtschaftseinheit", "Ort WE", "Mieteinheit - Straße, Hausnummer", "ME-Nr.", "Mieteinheitsnummer PM", "Vertrags-Nr.", "Vertrags-Nr. (PM)", "ME-Nutzungsart", "ME-Bezeichnung", "Bezeichnung Nutzungsart", "Mietfläche / Anzahl", "Einheit", "Leerstand [Y/N]", "Firmenname", "Mietvertrags- bzw. Leerstandsbeginn", "Mietvertragsende bzw. Ende Leerstand", "Kündigung [Y/N]", "Kündigungsdatum", "Verlängerungsoption [Y/N]", "Art 1. Option", "1. Option Verlängerung in Monaten", "Beginndatum - Netto Kaltmiete", "Netto-Miete Soll (pro Monat)", "Netto NK/HK-VZ - Soll (monatlich)", "Umlagefähige Netto Verwaltungskosten Soll", "Ust-Netto-Miete in %", "Bruttomiete - Soll", "Indexvereinbarung Miete [Y/N]", "Index", "Weitergabe in Prozent (Umlagequote)", "Staffelmiete Y/N", "Netto Kaltmiete - Staffel 1", "1.Kaution-Soll"];
  const row = (nr: string, pm: string, code: string, bez: string, art: string, fl: number, einh: string, leer: string, firma: string, ende: string, miete: number, nk: number, brutto: number, idx: string) =>
    ["XX00", "XX001", "Berlin", "Musterstraße 1", nr, pm, "", "", code, bez, art, fl, einh, leer, firma, "2021-01-01", ende, "N", null, "J", "2", 60, "2026-01-01", miete, nk, 0, 19, brutto, idx, idx === "J" ? "VPI 2020" : "", idx === "J" ? 80 : 0, "N", 0, 30000];
  const rows = [
    H,
    row("XX001.1000", "00010000", "2002", "Handel EG", "Einzelhandel", 500, "M2", "N", "Handelskette GmbH", "2030-12-31", 9000, 1500, 12500, "J"),
    row("XX001.1001", "00020000", "2008", "Büro 1.OG", "Büro", 400, "M2", "N", "Beratung AG", "2028-06-30", 8000, 1200, 10900, "N"),
    row("XX001.1002", "00020001", "2008", "Büro 2.OG", "Büro", 300, "M2", "J", "", "9999-12-31", 0, 0, 0, ""),
    row("XX001.1003", "00040002", "2100", "Lager 2 UG", "Archiv/Lager/Keller Gewerbe", 25, "M2", "J", "", "9999-12-31", 0, 0, 0, ""),
    row("XX001.1004", "00050000", "3000", "TG-Stellplätze", "Stellplatz Tiefgarage", 12, "ST", "N", "Handelskette GmbH", "2030-12-31", 1200, 0, 1428, "N"),
  ];
  const r = parseRentRoll(rows as never)!;
  assert.equal(r.units.length, 5);
  const [a, b, c, d, e] = r.units;
  assert.equal(a.mieteMonat, 9000); // nicht 10000 aus "Mieteinheitsnummer PM", nicht Brutto
  assert.equal(a.mieter, "Handelskette GmbH");
  assert.equal(a.nutzung, "Einzelhandel");
  assert.equal(a.geschoss, "EG");
  assert.equal(a.mietende, "2030-12-31");
  assert.match(a.notiz, /VPI 2020 \(80 % Weitergabe\)/);
  assert.equal(b.mieteMonat, 8000);
  assert.equal(b.geschoss, "1.OG");
  assert.equal(c.leer, true);
  assert.equal(c.mietende, "");
  assert.equal(d.leer, true);
  assert.equal(d.nutzung, "Lager/Logistik");
  assert.equal(d.geschoss, "UG");
  assert.equal(e.einheit, "stk");
  assert.equal(e.flaeche, 12);
  assert.equal(e.mieteMonat, 1200);
  assert.deepEqual(r.warnings, []);
});
