// Erkennt Mieterlisten in Tabellen (Excel/CSV) oder tabellarischem Text und
// liefert Einheiten. Arbeitet deterministisch: Zahlen werden exakt übernommen.
//
// Spaltenzuordnung per Punktesystem statt "erster Treffer gewinnt":
//   Punkte = Überschrift (positive Muster − Ausschlüsse) × Passung des Inhalts
//   (Zahl / Datum / Text / Ja-Nein). Danach gierige Zuordnung, jede Spalte
//   höchstens einmal. Die Mietspalte muss zusätzlich plausible €/m² ergeben.
//   So werden ERP-Exporte (SAP, PM-Systeme) mit 50+ Spalten sauber gelesen:
//   "Mieteinheitsnummer PM" ist keine Monatsmiete, "Netto NK-VZ" keine Kaltmiete.
import type { Unit } from "../model/types";
import { emptyUnit } from "../model/defaults";
import { LEER_RE, SUMME_RE, normalizeNutzung, parseDate, parseNumber } from "./parse";

export type Cell = string | number | boolean | Date | null | undefined;
export type Row = Cell[];

type Kind = "num" | "date" | "text" | "flag";

type Field =
  | "mieter"
  | "label"
  | "nutzung"
  | "geschoss"
  | "einheitNr"
  | "flaeche"
  | "einheitTyp"
  | "stueck"
  | "leer"
  | "mieteMonat"
  | "mieteJahr"
  | "mieteQm"
  | "miete"
  | "mietbeginn"
  | "mietende"
  | "option"
  | "kuendigung"
  | "indexierung"
  | "indexName"
  | "indexQuote"
  | "staffel"
  | "optionMonate"
  | "marktmiete";

interface Rule {
  field: Field;
  kind: Kind;
  pos: [RegExp, number][];
  neg?: RegExp[];
}

// Begriffe, die eine Spalte als Kaltmiete ausschließen
const NOT_RENT =
  /brutto|gross|\bnk\b|nk[\/-]|nebenkost|betriebskost|heiz|\bhk\b|\bvz\b|vorauszahl|umlag|verwaltungskost|\bust\b|ust-|mwst|steuer|kaution|sicherheit|staffel|index|markt|\berv\b|beginn|datum|termin|nummer|\bnr\b|nr\.|stra(ß|ss)e|einheit(?!.*miete)|umsatz|fläche|flaeche|vorsteuer|option|ende|laufzeit|mieter\b|mietername/i;
const RENT_BASE: [RegExp, number] = [/netto.?(kalt)?.?miete|nettokalt|\bnkm\b|kaltmiete|grundmiete|miete netto|mietzins|base rent|net rent|nettomiete|\bmiete\b|^miete|ist-?miete|soll-?miete/i, 5];
const PER_MONTH = /monat|monatl|\bmtl\b|mtl\.|p\.\s?m\.|\bp\.?m\b(?!\s*[a-z])|monthly/i;
const PER_YEAR = /jahr|jährl|p\.\s?a\.?|\bp\.?a\b|annual|yearly/i;
const PER_QM = /(\/|je|pro|per)\s*(m²|m2|qm|sqm)|€\s*\/\s*(m²|m2|qm)|eur\s*\/\s*(m²|m2|qm)/i;

const RULES: Rule[] = [
  { field: "marktmiete", kind: "num", pos: [[/markt\s*-?\s*miete|\berv\b|market\s*rent|ortsübl/i, 8]] },
  { field: "mieteQm", kind: "num", pos: [RENT_BASE, [PER_QM, 6]], neg: [NOT_RENT] },
  { field: "mieteJahr", kind: "num", pos: [RENT_BASE, [PER_YEAR, 4], [/jahres(netto)?(kalt)?miete|\bjnkm\b/i, 6]], neg: [NOT_RENT, PER_MONTH, PER_QM] },
  { field: "mieteMonat", kind: "num", pos: [RENT_BASE, [PER_MONTH, 4], [/monatsmiete/i, 6]], neg: [NOT_RENT, PER_YEAR, PER_QM] },
  { field: "miete", kind: "num", pos: [RENT_BASE], neg: [NOT_RENT, PER_MONTH, PER_YEAR, PER_QM] },
  { field: "flaeche", kind: "num", pos: [[/mietfläche|nutzfläche|wohnfläche|fläche|flaeche|\bm²|\bm2\b|\bqm\b|\bsqm\b|\barea\b|\bnfl\b|\bmf-?g\b|\bbgf\b|\bwfl\b|größe/i, 7]], neg: [/€|eur|miete(?!r)|preis|kosten|grundstück/i] },
  { field: "stueck", kind: "num", pos: [[/anzahl|stück|\bstk\b|\bqty\b/i, 3]], neg: [/fläche|flaeche/i] },
  { field: "einheitTyp", kind: "text", pos: [[/^\s*einheit\s*$|maßeinheit|mengeneinheit|^\s*unit\s*$|^\s*me\s*$/i, 6]] },
  { field: "leer", kind: "flag", pos: [[/leerstand|vermietungsstand|belegung|vacan|^\s*status\s*$|vermietet\s*\[/i, 7]], neg: [/beginn|ende|datum|seit|bis/i] },
  { field: "mieter", kind: "text", pos: [[/firmenname|mietername|^\s*mieter\s*$|mieter\b(?!.*(nr|nummer|fläche))|\btenant\b|vertragspartner|lessee|^\s*nutzer\s*$/i, 7], [/firma|\bname\b/i, 4]], neg: [/\bnr\b|nr\.|nummer|nutzungsart|einheit|stra(ß|ss)e|\bort\b|typ|kategorie/i] },
  { field: "label", kind: "text", pos: [[/me-?bezeichnung|einheit\w*\s*-?\s*bezeichnung|bezeichnung\s*(der\s*)?(me|einheit)|lage im objekt|beschreibung|^\s*bezeichnung\s*$/i, 6]], neg: [/nutzungsart|kautionsart/i] },
  { field: "nutzung", kind: "text", pos: [[/bezeichnung\s*nutzungsart|nutzungsart|^\s*nutzung|flächenart|art der fläche|\buse\b|kategorie|objektart|^\s*art\s*$|^\s*typ\s*$/i, 6], [/bezeichnung nutzung/i, 3]], neg: [/kaution|option|index/i] },
  { field: "geschoss", kind: "text", pos: [[/geschoss|etage|ebene|\bfloor\b|stockwerk|^\s*lage\s*$/i, 7]] },
  { field: "einheitNr", kind: "text", pos: [[/me-?nr|einheitsnr|mieteinheit\w*\s*-?\s*nr|unit\s*id|^\s*nr\.?\s*$|\blfd\b|^\s*einheit\s*nr|^\s*whg/i, 4], [/^\s*einheit\s*$/i, 3]], neg: [/vertrag/i] },
  { field: "mietbeginn", kind: "date", pos: [[/mietbeginn|vertragsbeginn|mietvertrag\w*.*beginn|^\s*beginn|lease\s*start|übergabe|\bseit\b|\bab\b|\bvon\b/i, 6], [/beginn|start/i, 3]], neg: [/kaltmiete|nettomiete|netto.?miete|index|staffel|erhöhung/i] },
  { field: "mietende", kind: "date", pos: [[/mietende|vertragsende|mietvertrag\w*.*ende|laufzeit|befristet|expiry|lease\s*end|ablauf|fest\s*bis|^\s*ende|\bbis\b/i, 6], [/ende/i, 3]], neg: [/option|kündigung|break|index|staffel|leerstandsbeginn$/i] },
  { field: "option", kind: "date", pos: [[/sonderkünd|\bbreak\b|kündigungsdatum|kündigungsrecht|frühest\w* kündig|option\s*(zum|datum|bis)|^\s*option(en)?\s*$/i, 7]], neg: [/\[\s*[yj]\s*\/\s*n\s*\]|monat/i] },
  { field: "kuendigung", kind: "flag", pos: [[/^\s*kündigung\s*(\[.*\])?\s*$|gekündigt/i, 5]] },
  { field: "indexierung", kind: "text", pos: [[/indexvereinbarung|wertsicher|indexmiete|indexierung|^\s*index\s*\[|anpassung/i, 5]], neg: [/datum|stand|rhythmus|weitergabe|nächste/i] },
  { field: "indexName", kind: "text", pos: [[/^\s*index\s*$|indexart|verbraucherpreisindex/i, 4]] },
  { field: "indexQuote", kind: "num", pos: [[/weitergabe|umlagequote|anpassungsquote/i, 4]] },
  { field: "staffel", kind: "flag", pos: [[/staffelmiete/i, 4]], neg: [/termin|kaltmiete/i] },
  { field: "optionMonate", kind: "num", pos: [[/1\.\s*option.*monat|option.*verlängerung.*monat|verlängerung.*monat/i, 4]] },
];

function cellText(c: Cell): string {
  if (c == null) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
}

const UNIT_TYP = /^(m2|m²|qm|sqm|st|stk|stück|stueck|anzahl|pcs|pc|ea|lfm|m)\.?$/i;
const FLAG_YES = /^(j|y|ja|yes|x|1|true|wahr|leer|leerstand|vacant)$/i;
const FLAG_NO = /^(n|nein|no|0|false|falsch|vermietet|let|-)$/i;

interface Profile {
  num: number;
  date: number;
  text: number;
  flag: number;
  n: number;
}

/** Ist der Wert eine echte Zahl (keine Kennung wie "00010000" oder "DX028.2000")? */
function isNumeric(c: Cell): boolean {
  if (typeof c === "number") return Number.isFinite(c);
  if (typeof c !== "string") return false;
  const s = c.trim();
  const core = s.replace(/(eur|€|m²|m2|qm|mio\.?|tsd\.?|stk\.?|%)/gi, "").trim();
  if (!core || /^0\d/.test(core) || /[a-z]/i.test(core)) return false;
  return /^[-+]?[\d.,\s]+$/.test(core) && parseNumber(core) != null;
}

function isDateLike(c: Cell): boolean {
  if (c instanceof Date) return true;
  if (typeof c === "number") return c > 20000 && c < 80000;
  if (typeof c !== "string") return false;
  return /\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2}|^\d{1,2}[./]\d{4}$/.test(c.trim()) || /unbefristet|unbegrenzt/i.test(c);
}

function profile(rows: Row[], col: number): Profile {
  let num = 0,
    date = 0,
    text = 0,
    flag = 0,
    n = 0;
  for (const r of rows) {
    const c = r?.[col];
    const t = cellText(c);
    if (!t) continue;
    n++;
    if (isDateLike(c)) date++;
    else if (isNumeric(c)) num++;
    else text++;
    if (FLAG_YES.test(t) || FLAG_NO.test(t)) flag++;
  }
  const d = n || 1;
  return { num: num / d, date: date / d, text: text / d, flag: flag / d, n };
}

function fit(p: Profile, kind: Kind): number {
  if (p.n === 0) return 0.3; // leere Spalte (z. B. alles leer bei Optionen): neutral-schwach
  switch (kind) {
    case "num":
      return p.num >= 0.6 ? 1 : p.num >= 0.3 ? 0.5 : 0.05;
    case "date":
      return p.date >= 0.5 ? 1 : p.date >= 0.2 ? 0.5 : 0.05;
    case "text":
      return p.text >= 0.5 ? 1 : p.num > 0.7 ? 0.1 : 0.5;
    case "flag":
      return p.flag >= 0.7 ? 1 : p.text >= 0.5 ? 0.6 : 0.1;
  }
}

function headerScore(h: string, rule: Rule): number {
  if (!h || h.length > 90) return 0;
  let s = 0;
  for (const [re, w] of rule.pos) if (re.test(h)) s += w;
  if (s === 0) return 0;
  if (rule.neg?.some((re) => re.test(h))) return 0;
  return s;
}

export interface Mapping {
  headerRow: number;
  cols: Partial<Record<Field, number>>;
  headers: string[];
  candidates: Partial<Record<Field, number[]>>;
}

function isDataRow(r: Row): boolean {
  const t = (r || []).map(cellText);
  return t.some((x) => x) && !SUMME_RE.test(t.find((x) => x) ?? "");
}

function assign(rows: Row[], r: number): { m: Mapping; score: number } {
  const headers = (rows[r] || []).map(cellText);
  const data = rows.slice(r + 1, r + 201).filter(isDataRow);
  const profiles = headers.map((_, i) => profile(data, i));
  const scored: { field: Field; col: number; score: number }[] = [];
  headers.forEach((h, col) => {
    for (const rule of RULES) {
      const hs = headerScore(h, rule);
      if (hs <= 0) continue;
      let f = fit(profiles[col], rule.kind);
      // "Einheit" ist nur dann Maßeinheit, wenn dort m², Stk o. Ä. steht
      if (rule.field === "einheitTyp") {
        const vals = data.map((r) => cellText(r?.[col]).toLowerCase()).filter(Boolean);
        const share = vals.length ? vals.filter((v) => UNIT_TYP.test(v)).length / vals.length : 0;
        f = share >= 0.6 ? 1 : 0;
      }
      scored.push({ field: rule.field, col, score: hs * f });
    }
  });
  scored.sort((a, b) => b.score - a.score || a.col - b.col);
  const cols: Partial<Record<Field, number>> = {};
  const candidates: Partial<Record<Field, number[]>> = {};
  const used = new Set<number>();
  for (const s of scored) {
    if (s.score < 1.5) continue;
    (candidates[s.field] ??= []).push(s.col);
    if (cols[s.field] != null || used.has(s.col)) continue;
    cols[s.field] = s.col;
    used.add(s.col);
  }
  const total = Object.entries(cols).reduce((x, [f, c]) => x + (scored.find((s) => s.field === f && s.col === c)?.score ?? 0), 0);
  return { m: { headerRow: r, cols, headers, candidates }, score: total };
}

export function detectHeader(rows: Row[]): Mapping | null {
  let best: Mapping | null = null;
  let bestScore = 0;
  const limit = Math.min(rows.length, 40);
  for (let r = 0; r < limit; r++) {
    const nonEmpty = (rows[r] || []).filter((c) => cellText(c)).length;
    if (nonEmpty < 2) continue;
    const { m, score } = assign(rows, r);
    const c = m.cols;
    const hasArea = c.flaeche != null || c.stueck != null;
    const hasRent = c.miete != null || c.mieteMonat != null || c.mieteJahr != null || c.mieteQm != null;
    if (!(hasArea || hasRent) || Object.keys(c).length < 2) continue;
    const numericBelow = rows.slice(r + 1, r + 6).filter((row) => (row || []).some((x) => isNumeric(x))).length;
    const total = score + (hasArea ? 4 : 0) + (hasRent ? 4 : 0) + numericBelow;
    if (total > bestScore) {
      bestScore = total;
      best = m;
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
  warnings: string[];
}

const GESCHOSS_RE = /\b(\d{1,2}\.\s?(?:OG|UG|Obergeschoss|Untergeschoss)|\d{1,2}(?:OG|UG)|EG|UG|DG|KG|TG|SG|Erdgeschoss|Dachgeschoss|Souterrain|Hochparterre|Mezzanin)\b/i;

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function parseRentRoll(rows: Row[], fallbackNutzung = "Büro"): RentRollResult | null {
  const mapping = detectHeader(rows);
  if (!mapping) return null;
  const { cols } = mapping;
  const warnings: string[] = [];
  const get = (row: Row, f: Field) => (cols[f] != null ? row[cols[f]!] : undefined);
  const dataRows = rows.slice(mapping.headerRow + 1);

  // Flächen je Zeile für Plausibilitätsprüfungen
  const areaOf = (row: Row) => parseNumber(get(row, "flaeche")) ?? parseNumber(get(row, "stueck"));

  // Plausible Mietspalte wählen: Median €/m²/Monat muss realistisch sein
  type RentField = "mieteMonat" | "mieteJahr" | "mieteQm" | "miete";
  const perQm = (field: RentField, col: number, mode: "monat" | "jahr" | "qm"): number => {
    const ratios: number[] = [];
    for (const row of dataRows) {
      const v = parseNumber(row?.[col]);
      const a = areaOf(row);
      if (v && a && v > 0 && a > 0) ratios.push(mode === "qm" ? v : mode === "jahr" ? v / 12 / a : v / a);
    }
    void field;
    return median(ratios);
  };
  const plausible = (x: number) => x >= 0.8 && x <= 250;
  for (const [field, mode] of [
    ["mieteMonat", "monat"],
    ["mieteJahr", "jahr"],
    ["mieteQm", "qm"],
  ] as [RentField, "monat" | "jahr" | "qm"][]) {
    const c = cols[field];
    if (c == null) continue;
    const q = perQm(field, c, mode);
    if (q > 0 && !plausible(q)) {
      warnings.push(`Spalte „${mapping.headers[c]}" ergibt Ø ${q.toFixed(2)} €/m² – nicht als Miete verwendet`);
      delete cols[field];
      // nächste Kandidatenspalte versuchen
      const alt = (mapping.candidates[field] ?? []).find((x) => x !== c && !Object.values(cols).includes(x) && plausible(perQm(field, x, mode)));
      if (alt != null) cols[field] = alt;
    }
  }

  // Wie ist eine unspezifizierte Mietspalte gemeint? Am Median von Miete/Fläche entscheiden.
  let mieteMode: "monat" | "jahr" | "qm" = "monat";
  let interpretation = "";
  if (cols.miete != null && cols.mieteMonat == null && cols.mieteJahr == null && cols.mieteQm == null) {
    const ratios: number[] = [];
    const values: number[] = [];
    for (const row of dataRows) {
      const m = parseNumber(get(row, "miete"));
      const f = areaOf(row);
      if (m && m > 0) values.push(m);
      if (m && f && m > 0 && f > 0) ratios.push(m / f);
    }
    const med = median(ratios);
    const medV = median(values);
    if (ratios.length && med > 60) {
      mieteMode = "jahr";
      interpretation = `„${mapping.headers[cols.miete]}" als Jahresmiete gelesen (Ø ${med.toFixed(0)} €/m² wäre als Monatswert unplausibel)`;
    } else if ((ratios.length && med < 0.8) || (!ratios.length && medV < 80)) {
      mieteMode = "qm";
      interpretation = `„${mapping.headers[cols.miete]}" als €/m² gelesen`;
    } else interpretation = `„${mapping.headers[cols.miete]}" als Monatsmiete gelesen`;
  } else if (cols.mieteMonat != null) interpretation = `Monatsmiete aus „${mapping.headers[cols.mieteMonat]}"`;
  else if (cols.mieteJahr != null) interpretation = `Jahresmiete ÷ 12 aus „${mapping.headers[cols.mieteJahr]}"`;
  else if (cols.mieteQm != null) interpretation = `€/m² × Fläche aus „${mapping.headers[cols.mieteQm]}"`;
  else warnings.push("Keine Mietspalte erkannt");

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
    const labelRaw = cellText(get(row, "label"));
    const firstText = texts.find((t) => t) || "";
    if (SUMME_RE.test(mieterRaw) || SUMME_RE.test(firstText) || SUMME_RE.test(labelRaw)) {
      sumRow = { flaeche: parseNumber(get(row, "flaeche")), miete: rowRentMonthly(row) };
      continue;
    }
    let flaeche = parseNumber(get(row, "flaeche"));
    const stk = parseNumber(get(row, "stueck"));
    const nutzungRaw = cellText(get(row, "nutzung"));
    // Zwischenüberschriften wie "Büro" ohne Zahlen: Nutzung für folgende Zeilen
    if (!flaeche && !stk && rowRentMonthly(row) == null && texts.filter((t) => t).length <= 2) {
      const n = normalizeNutzung(firstText, "");
      if (n && n !== "Sonstiges") lastNutzung = n;
      skipped++;
      continue;
    }
    // Nutzung: Spalte (Text, kein Code) → Bezeichnung → Mieter → Zwischenüberschrift → Vorgabe
    let nutzung = "";
    if (nutzungRaw && !/^\d+$/.test(nutzungRaw)) nutzung = normalizeNutzung(nutzungRaw, "");
    if (!nutzung || nutzung === "Sonstiges") {
      const fromLabel = normalizeNutzung(`${labelRaw} ${mieterRaw}`, "");
      if (fromLabel && fromLabel !== "Sonstiges") nutzung = fromLabel;
      else if (!nutzung) nutzung = lastNutzung || normalizeNutzung(joined, "") || fallbackNutzung;
      if (nutzung === "Sonstiges" && !nutzungRaw && lastNutzung) nutzung = lastNutzung;
    }
    const typ = cellText(get(row, "einheitTyp")).toLowerCase();
    const isStk = nutzung === "Stellplätze" || /^(st|stk|stück|stueck|anzahl|pcs|pc|ea)\.?$/.test(typ);
    if (isStk && (!flaeche || flaeche > 2000) && stk) flaeche = stk;
    if (isStk && !flaeche) flaeche = stk ?? 1;
    if (!flaeche || flaeche <= 0) {
      skipped++;
      continue;
    }
    const miete = rowRentMonthly(row, flaeche) ?? 0;
    const leerTxt = cellText(get(row, "leer"));
    const leerHeader = cols.leer != null ? mapping.headers[cols.leer] : "";
    // "Leerstand [Y/N]": J/Y = leer. "Status" / "Vermietungsstand": Text auswerten.
    const flagSaysLeer = cols.leer != null && (/leer|vacan/i.test(leerHeader) ? FLAG_YES.test(leerTxt) || LEER_RE.test(leerTxt) : LEER_RE.test(leerTxt));
    const flagSaysLet = cols.leer != null && /leer|vacan/i.test(leerHeader) && FLAG_NO.test(leerTxt);
    const leer = flagSaysLeer || (!flagSaysLet && (LEER_RE.test(mieterRaw) || (!mieterRaw && miete === 0) || (/^\s*-+\s*$/.test(mieterRaw) && miete === 0)));

    // Geschoss: Spalte, sonst aus Bezeichnung ("Büro 4.OG")
    let geschoss = cellText(get(row, "geschoss"));
    if (!geschoss) geschoss = (GESCHOSS_RE.exec(labelRaw) ?? GESCHOSS_RE.exec(mieterRaw))?.[1]?.replace(/\s+/g, "") ?? "";

    // Indexierung: echte Rate übernehmen, Ja/Nein-Kennzeichen als Notiz
    const idxRaw = get(row, "indexierung");
    const idxTxt = cellText(idxRaw);
    let indexierung: number | null = null;
    const idxN = isNumeric(idxRaw) ? parseNumber(idxRaw) : null;
    if (idxN != null && idxN > 0 && idxN < 20) indexierung = idxN > 0.2 ? idxN / 100 : idxN;
    const notes: string[] = [];
    const nr = cellText(get(row, "einheitNr"));
    if (nr) notes.push(nr);
    if (labelRaw && labelRaw !== mieterRaw) notes.push(labelRaw);
    if (!leer) {
      if (idxTxt && indexierung == null && !FLAG_NO.test(idxTxt)) {
        const name = cellText(get(row, "indexName"));
        const quote = parseNumber(get(row, "indexQuote"));
        notes.push(`Index${name ? " " + name : FLAG_YES.test(idxTxt) ? "" : " " + idxTxt}${quote ? ` (${quote} % Weitergabe)` : ""}`);
      }
      if (FLAG_YES.test(cellText(get(row, "staffel")))) notes.push("Staffelmiete");
      const om = parseNumber(get(row, "optionMonate"));
      if (om && om > 0) notes.push(`Verlängerungsoption ${om} Mon.`);
      if (FLAG_YES.test(cellText(get(row, "kuendigung")))) notes.push("gekündigt");
    }
    const marktN = parseNumber(get(row, "marktmiete"));
    const mieterName = leer ? "Leerstand" : mieterRaw || labelRaw || "";
    units.push(
      emptyUnit({
        nutzung,
        mieter: mieterName,
        geschoss,
        flaeche,
        einheit: isStk ? "stk" : "m2",
        leer,
        mieteMonat: leer ? 0 : round2(miete),
        mietbeginn: leer ? "" : (parseDate(get(row, "mietbeginn"), { endOfPeriod: false }) ?? ""),
        mietende: leer ? "" : (parseDate(get(row, "mietende")) ?? ""),
        option: leer ? "" : (parseDate(get(row, "option")) ?? ""),
        indexierung,
        marktmiete: marktN && marktN > 0 && marktN < 500 ? marktN : null,
        notiz: notes.join(" · "),
      }),
    );
  }

  if (!units.length) return null;
  // Letzte Plausibilitätsprüfung je Einheit
  for (const u of units) {
    if (!u.leer && u.einheit === "m2" && u.flaeche > 0 && u.mieteMonat / u.flaeche > 250)
      warnings.push(`${u.mieter || u.notiz}: ${(u.mieteMonat / u.flaeche).toFixed(0)} €/m² mtl. – bitte prüfen`);
  }
  return { units, mapping, mieteInterpretation: interpretation, skipped, sumRow, warnings };
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
