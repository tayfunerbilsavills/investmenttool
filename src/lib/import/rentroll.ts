// Erkennt Mieterlisten in Tabellen (Excel/CSV) oder tabellarischem Text und
// liefert Einheiten. Arbeitet deterministisch: Zahlen werden exakt übernommen.
import type { Unit } from "../model/types";
import { emptyUnit } from "../model/defaults";
import { LEER_RE, SUMME_RE, normalizeNutzung, parseDate, parseNumber } from "./parse";

export type Cell = string | number | boolean | Date | null | undefined;
export type Row = Cell[];

type Field =
  | "mieter"
  | "nutzung"
  | "geschoss"
  | "einheitNr"
  | "flaeche"
  | "mieteMonat"
  | "mieteJahr"
  | "mieteQm"
  | "miete"
  | "mietbeginn"
  | "mietende"
  | "option"
  | "indexierung"
  | "status"
  | "marktmiete"
  | "stueck";

const RULES: { field: Field; re: RegExp; not?: RegExp }[] = [
  { field: "marktmiete", re: /markt\s*miete|erv|market\s*rent|ortsübl/i },
  { field: "mieteQm", re: /(miete|rent|nkm|nettokalt).*(\/|je|pro|per)\s*(m²|m2|qm|sqm)|(€|eur)\s*\/\s*(m²|m2|qm)/i },
  { field: "mieteJahr", re: /(miete|rent|nkm|nettokalt|ertrag|einnahme).*(p\.?\s?a\.?|jahr|jährl|annual|\bpa\b|yearly)|jahres(netto)?(kalt)?miete|jnkm/i },
  { field: "mieteMonat", re: /(miete|rent|nkm|nettokalt).*(mtl|monat|p\.?\s?m\.?\b|monthly)|monatsmiete|monatl/i },
  { field: "miete", re: /miete|rent\b|nkm|nettokalt|mietzins|ertrag/i, not: /mieter|markt|ende|beginn|laufzeit|vertrag|fläche|flaeche|index|staffel|frei/i },
  { field: "flaeche", re: /fläche|flaeche|\bm²\b|\bm2\b|\bqm\b|\bsqm\b|area|\bnfl\b|\bmf-?g\b|\bbgf\b|\bwfl\b|größe/i, not: /€|eur|miete|rent|preis/i },
  { field: "stueck", re: /anzahl|stück|stk\b|\bqty\b/i },
  { field: "mietende", re: /mietende|vertragsende|laufzeit\s*(bis|ende)?|befristet|\bende\b|expiry|lease\s*end|ablauf|fest\s*bis|\bbis\b/i, not: /option|kündigung|break/i },
  { field: "mietbeginn", re: /mietbeginn|vertragsbeginn|\bbeginn\b|start|seit|übergabe|lease\s*start/i },
  { field: "option", re: /option|sonderkünd|kündigungsrecht|break/i },
  { field: "indexierung", re: /index|wertsicher|staffel|anpassung/i },
  { field: "status", re: /status|leerstand|vermietungsstand|belegung/i },
  { field: "nutzung", re: /nutzung|nutzungsart|\bart\b|\btyp\b|\buse\b|kategorie|flächenart/i },
  { field: "geschoss", re: /geschoss|etage|ebene|floor|stockwerk|\blage\b|\bog\b|\beg\b/i },
  { field: "einheitNr", re: /einheit|\bme\b|whg|unit|^nr|lfd|objekt-?nr|mieteinheit/i },
  { field: "mieter", re: /mieter|nutzer|firma|tenant|name|bezeichnung|vertragspartner|lessee/i },
];

function cellText(c: Cell): string {
  if (c == null) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
}

export interface Mapping {
  headerRow: number;
  cols: Partial<Record<Field, number>>;
  headers: string[];
}

export function detectHeader(rows: Row[]): Mapping | null {
  let best: Mapping | null = null;
  let bestScore = 0;
  const limit = Math.min(rows.length, 40);
  for (let r = 0; r < limit; r++) {
    const headers = (rows[r] || []).map(cellText);
    const cols: Partial<Record<Field, number>> = {};
    let score = 0;
    headers.forEach((h, i) => {
      if (!h || h.length > 80) return;
      for (const rule of RULES) {
        if (cols[rule.field] != null) continue;
        if (rule.re.test(h) && !(rule.not && rule.not.test(h))) {
          cols[rule.field] = i;
          score += 1;
          break;
        }
      }
    });
    const hasArea = cols.flaeche != null;
    const hasRent = cols.miete != null || cols.mieteMonat != null || cols.mieteJahr != null || cols.mieteQm != null;
    if (!(hasArea || hasRent) || score < 2) continue;
    // Datenzeilen darunter müssen Zahlen enthalten
    const numeric = rows.slice(r + 1, r + 6).filter((row) => (row || []).some((c) => parseNumber(c) != null)).length;
    const total = score * 2 + (hasArea ? 2 : 0) + (hasRent ? 2 : 0) + numeric;
    if (total > bestScore) {
      bestScore = total;
      best = { headerRow: r, cols, headers };
    }
  }
  return best;
}

export interface RentRollResult {
  units: Unit[];
  mapping: Mapping;
  mieteInterpretation: string;
  skipped: number;
  sumRow: { flaeche: number | null; miete: number | null } | null;
  sheet?: string;
}

export function parseRentRoll(rows: Row[], fallbackNutzung = "Büro"): RentRollResult | null {
  const mapping = detectHeader(rows);
  if (!mapping) return null;
  const { cols } = mapping;
  const get = (row: Row, f: Field) => (cols[f] != null ? row[cols[f]!] : undefined);

  // Wie ist eine unspezifizierte Mietspalte gemeint? Am Median von Miete/Fläche entscheiden.
  let mieteMode: "monat" | "jahr" | "qm" = "monat";
  let interpretation = "";
  const dataRows = rows.slice(mapping.headerRow + 1);
  if (cols.miete != null && cols.mieteMonat == null && cols.mieteJahr == null && cols.mieteQm == null) {
    const ratios: number[] = [];
    const values: number[] = [];
    for (const row of dataRows) {
      const m = parseNumber(get(row, "miete"));
      const f = parseNumber(get(row, "flaeche"));
      if (m && m > 0) values.push(m);
      if (m && f && m > 0 && f > 0) ratios.push(m / f);
    }
    const med = median(ratios);
    const medV = median(values);
    if (ratios.length && med > 60) {
      mieteMode = "jahr";
      interpretation = `Mietspalte als Jahresmiete gelesen (Ø ${med.toFixed(0)} €/m² wäre als Monatswert unplausibel)`;
    } else if ((ratios.length && med < 0.8) || (!ratios.length && medV < 80)) {
      mieteMode = "qm";
      interpretation = "Mietspalte als €/m² gelesen";
    } else {
      interpretation = "Mietspalte als Monatsmiete gelesen";
    }
  } else if (cols.mieteMonat != null) interpretation = "Monatsmiete aus eigener Spalte";
  else if (cols.mieteJahr != null) interpretation = "Jahresmiete ÷ 12";
  else if (cols.mieteQm != null) interpretation = "€/m² × Fläche";

  const units: Unit[] = [];
  let skipped = 0;
  let empties = 0;
  let sumRow: RentRollResult["sumRow"] = null;
  let lastNutzung = "";
  for (const row of dataRows) {
    const texts = (row || []).map(cellText);
    if (texts.every((t) => !t)) {
      if (++empties >= 3 && units.length) break;
      continue;
    }
    empties = 0;
    const joined = texts.join(" ");
    const mieterRaw = cellText(get(row, "mieter"));
    const firstText = texts.find((t) => t) || "";
    if (SUMME_RE.test(mieterRaw) || SUMME_RE.test(firstText)) {
      sumRow = { flaeche: parseNumber(get(row, "flaeche")), miete: rowRentMonthly(row) };
      continue;
    }
    let flaeche = parseNumber(get(row, "flaeche"));
    const stk = parseNumber(get(row, "stueck"));
    const nutzungRaw = cellText(get(row, "nutzung"));
    // Zwischenüberschriften wie "Büro" ohne Zahlen übernehmen als Nutzung für folgende Zeilen
    if (!flaeche && rowRentMonthly(row) == null && texts.filter((t) => t).length <= 2) {
      const n = normalizeNutzung(firstText, "");
      if (n && n !== "Sonstiges") lastNutzung = n;
      skipped++;
      continue;
    }
    let nutzung = normalizeNutzung(nutzungRaw || "", "") || "";
    if (!nutzung || nutzung === "Sonstiges") {
      const fromName = normalizeNutzung(`${mieterRaw} ${joined}`, "");
      nutzung = nutzungRaw ? nutzung || fromName : lastNutzung || (fromName !== "Sonstiges" ? fromName : "") || fallbackNutzung;
    }
    const isStk = nutzung === "Stellplätze";
    if (isStk && (!flaeche || flaeche > 2000) && stk) flaeche = stk;
    if (isStk && !flaeche) flaeche = stk ?? 1;
    if (!flaeche || flaeche <= 0) {
      skipped++;
      continue;
    }
    const miete = rowRentMonthly(row, flaeche) ?? 0;
    const statusTxt = cellText(get(row, "status"));
    const leer =
      LEER_RE.test(mieterRaw) ||
      LEER_RE.test(statusTxt) ||
      (!mieterRaw && miete === 0) ||
      (/^\s*-+\s*$/.test(mieterRaw) && miete === 0);
    const idxRaw = get(row, "indexierung");
    let indexierung: number | null = null;
    const idxN = parseNumber(idxRaw);
    if (idxN != null && idxN > 0 && idxN < 20) indexierung = idxN > 0.2 ? idxN / 100 : idxN;
    const marktN = parseNumber(get(row, "marktmiete"));
    const notizParts = [cellText(get(row, "einheitNr")), cellText(idxRaw) && indexierung == null ? `Index: ${cellText(idxRaw)}` : ""].filter(Boolean);
    units.push(
      emptyUnit({
        nutzung,
        mieter: leer ? (mieterRaw && !LEER_RE.test(mieterRaw) ? mieterRaw : "Leerstand") : mieterRaw,
        geschoss: cellText(get(row, "geschoss")),
        flaeche,
        einheit: isStk ? "stk" : "m2",
        leer,
        mieteMonat: leer ? 0 : round2(miete),
        mietbeginn: parseDate(get(row, "mietbeginn"), { endOfPeriod: false }) ?? "",
        mietende: leer ? "" : (parseDate(get(row, "mietende")) ?? ""),
        option: parseDate(get(row, "option")) ?? "",
        indexierung,
        marktmiete: marktN && marktN > 0 && marktN < 500 ? marktN : null,
        notiz: notizParts.join(" · "),
      }),
    );
  }

  function rowRentMonthly(row: Row, flaeche?: number | null): number | null {
    const mon = parseNumber(get(row, "mieteMonat"));
    if (mon != null) return mon;
    const jahr = parseNumber(get(row, "mieteJahr"));
    if (jahr != null) return jahr / 12;
    const qm = parseNumber(get(row, "mieteQm"));
    if (qm != null && flaeche) return qm * flaeche;
    const m = parseNumber(get(row, "miete"));
    if (m == null) return null;
    if (mieteMode === "jahr") return m / 12;
    if (mieteMode === "qm") return flaeche ? m * flaeche : null;
    return m;
  }

  if (!units.length) return null;
  return { units, mapping, mieteInterpretation: interpretation, skipped, sumRow };
}

/** Text (aus PDF, Word, E-Mail) in Tabellenzeilen zerlegen. */
export function rowsFromText(text: string): Row[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (line.includes("\t")) return line.split("\t");
      if (line.includes(";") && line.split(";").length >= 3) return line.split(";");
      if (line.includes("|") && line.split("|").length >= 3) return line.split("|").filter((x, i, a) => !(i === 0 && !x.trim()) && !(i === a.length - 1 && !x.trim()));
      return line.split(/\s{2,}/);
    })
    .map((cells) => cells.map((c) => c.trim()));
}

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
