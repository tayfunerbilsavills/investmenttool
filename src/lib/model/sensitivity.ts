// Sensitivitäten: frei wählbare Treiber × frei wählbare Zielgrößen.
import type { Deal } from "./types";
import { analyze, kaufpreisFrom, summarize, type Analysis } from "./calc";

export type Fmt = "eur" | "pct" | "x" | "num" | "yrs" | "eurqm" | "mon";

export interface Driver {
  key: string;
  label: string;
  fmt: Fmt;
  step: number; // Standard-Schrittweite
  get: (d: Deal) => number;
  set: (d: Deal, v: number) => void; // mutiert die Kopie
  min?: number;
}

function scaleNutzung(d: Deal, field: "marktmiete" | "umbauLeer" | "umbauNeu" | "leerstandMonate", factor: number) {
  for (const k of Object.keys(d.nutzungen)) d.nutzungen[k][field] *= factor;
  if (field === "marktmiete") for (const u of d.units) if (u.marktmiete != null) u.marktmiete *= factor;
}

// Relative Treiber arbeiten mit Faktor 1 = Basis; ihr "Wert" ist die Abweichung in %.
export const DRIVERS: Driver[] = [
  {
    key: "kaufpreis",
    label: "Kaufpreis",
    fmt: "eur",
    step: 500_000,
    get: (d) => d.pricing.kaufpreis,
    set: (d, v) => (d.pricing.kaufpreis = Math.max(0, v)),
    min: 0,
  },
  {
    key: "faktorIst",
    label: "Kaufpreisfaktor (Ist)",
    fmt: "x",
    step: 1,
    get: (d) => {
      const s = summarize(d);
      return s.istMieteJahr > 0 ? d.pricing.kaufpreis / s.istMieteJahr : 0;
    },
    set: (d, v) => {
      const kp = kaufpreisFrom(d, "faktorIst", v);
      if (kp != null) d.pricing.kaufpreis = kp;
    },
    min: 1,
  },
  { key: "exitFaktor", label: "Exit-Faktor", fmt: "x", step: 1, get: (d) => d.dcf.exitFaktor, set: (d, v) => (d.dcf.exitFaktor = v), min: 1 },
  {
    key: "marktmiete",
    label: "Marktmiete (Δ %)",
    fmt: "pct",
    step: 0.05,
    get: () => 0,
    set: (d, v) => scaleNutzung(d, "marktmiete", 1 + v),
  },
  { key: "mietwachstum", label: "Marktmietwachstum p.a.", fmt: "pct", step: 0.005, get: (d) => d.dcf.mietwachstum, set: (d, v) => (d.dcf.mietwachstum = v) },
  { key: "indexierung", label: "Indexierung p.a.", fmt: "pct", step: 0.005, get: (d) => d.dcf.indexierung, set: (d, v) => (d.dcf.indexierung = v) },
  {
    key: "leerstandMonate",
    label: "Leerstandsdauer (Δ %)",
    fmt: "pct",
    step: 0.25,
    get: () => 0,
    set: (d, v) => scaleNutzung(d, "leerstandMonate", Math.max(0, 1 + v)),
  },
  {
    key: "umbau",
    label: "Ausbaukosten (Δ %)",
    fmt: "pct",
    step: 0.2,
    get: () => 0,
    set: (d, v) => {
      scaleNutzung(d, "umbauLeer", Math.max(0, 1 + v));
      scaleNutzung(d, "umbauNeu", Math.max(0, 1 + v));
    },
  },
  {
    key: "verlaengerung",
    label: "Verlängerungsquote",
    fmt: "pct",
    step: 0.1,
    get: (d) => {
      const v = Object.values(d.nutzungen);
      return v.length ? v.reduce((a, b) => a + b.verlaengerung, 0) / v.length : 0;
    },
    set: (d, v) => {
      const keys = Object.keys(d.nutzungen);
      const avg = keys.length ? keys.reduce((a, k) => a + d.nutzungen[k].verlaengerung, 0) / keys.length : 0;
      for (const k of keys) d.nutzungen[k].verlaengerung = Math.min(1, Math.max(0, d.nutzungen[k].verlaengerung + (v - avg)));
    },
  },
  { key: "instandhaltung", label: "Instandhaltung €/m²", fmt: "eurqm", step: 3, get: (d) => d.kosten.instandhaltung, set: (d, v) => (d.kosten.instandhaltung = Math.max(0, v)) },
  { key: "zins", label: "Fremdkapitalzins", fmt: "pct", step: 0.005, get: (d) => d.finanzierung.zins, set: (d, v) => (d.finanzierung.zins = Math.max(0, v)) },
  { key: "ltv", label: "LTV", fmt: "pct", step: 0.05, get: (d) => d.finanzierung.ltv, set: (d, v) => (d.finanzierung.ltv = Math.min(0.95, Math.max(0, v))) },
  { key: "diskontsatz", label: "Diskontierungszins", fmt: "pct", step: 0.005, get: (d) => d.dcf.diskontsatz, set: (d, v) => (d.dcf.diskontsatz = v) },
  { key: "haltedauer", label: "Haltedauer (Jahre)", fmt: "yrs", step: 1, get: (d) => d.dcf.haltedauer, set: (d, v) => (d.dcf.haltedauer = Math.max(1, Math.round(v))), min: 1 },
  { key: "kostensteigerung", label: "Kostensteigerung p.a.", fmt: "pct", step: 0.005, get: (d) => d.dcf.kostensteigerung, set: (d, v) => (d.dcf.kostensteigerung = v) },
];

export interface Output {
  key: string;
  label: string;
  fmt: Fmt;
  higherIsBetter: boolean;
  get: (a: Analysis) => number;
}

export const OUTPUTS: Output[] = [
  { key: "irr", label: "IRR ungehebelt", fmt: "pct", higherIsBetter: true, get: (a) => a.cf.irr },
  { key: "irrLev", label: "IRR gehebelt (EK)", fmt: "pct", higherIsBetter: true, get: (a) => a.cf.irrLevered },
  { key: "npv", label: "Kapitalwert (NPV)", fmt: "eur", higherIsBetter: true, get: (a) => a.cf.npv },
  { key: "em", label: "Equity Multiple", fmt: "x", higherIsBetter: true, get: (a) => a.cf.equityMultiple },
  { key: "kpMaxDcf", label: "Max. Kaufpreis (DCF)", fmt: "eur", higherIsBetter: true, get: (a) => a.cf.kaufpreisMaxDcf },
  { key: "niy", label: "Nettoanfangsrendite", fmt: "pct", higherIsBetter: true, get: (a) => a.p.niy },
  { key: "faktor", label: "Faktor (Ist)", fmt: "x", higherIsBetter: false, get: (a) => a.p.faktorIst },
  { key: "coc", label: "Ø Cash-on-Cash", fmt: "pct", higherIsBetter: true, get: (a) => a.cf.avgCoc },
  { key: "dscr", label: "Min. DSCR", fmt: "x", higherIsBetter: true, get: (a) => a.cf.minDscr },
  { key: "gewinn", label: "Gewinn gehebelt", fmt: "eur", higherIsBetter: true, get: (a) => a.cf.gewinnLevered },
];

export function driver(key: string): Driver {
  return DRIVERS.find((d) => d.key === key) ?? DRIVERS[0];
}
export function output(key: string): Output {
  return OUTPUTS.find((o) => o.key === key) ?? OUTPUTS[0];
}

function clone(d: Deal): Deal {
  return structuredClone(d);
}

/** Achse um den Basiswert: steps Werte links/rechts. */
export function axis(base: number, step: number, steps: number, min?: number): number[] {
  const out: number[] = [];
  for (let i = -steps; i <= steps; i++) {
    const v = base + i * step;
    if (min != null && v < min) continue;
    out.push(round(v));
  }
  return out;
}

function round(v: number) {
  return Math.round(v * 1e9) / 1e9;
}

export function evalWith(deal: Deal, changes: { key: string; value: number }[]): Analysis {
  const d = clone(deal);
  // Kaufpreis-Treiber zuletzt, damit Faktor auf der veränderten Miete aufsetzt
  const sorted = [...changes].sort((a, b) => (a.key === "faktorIst" ? 1 : 0) - (b.key === "faktorIst" ? 1 : 0));
  for (const c of sorted) driver(c.key).set(d, c.value);
  return analyze(d);
}

export interface Grid {
  xs: number[];
  ys: number[];
  values: number[][]; // [y][x]
}

export function grid(deal: Deal, xKey: string, xs: number[], yKey: string, ys: number[], outKey: string): Grid {
  const o = output(outKey);
  const values = ys.map((y) =>
    xs.map((x) =>
      o.get(
        evalWith(deal, [
          { key: yKey, value: y },
          { key: xKey, value: x },
        ]),
      ),
    ),
  );
  return { xs, ys, values };
}

export interface TornadoBar {
  key: string;
  label: string;
  lowValue: number;
  highValue: number;
  low: number;
  high: number;
  spread: number;
}

export function tornado(deal: Deal, outKey: string, keys: string[], stepMult = 1): { base: number; bars: TornadoBar[] } {
  const o = output(outKey);
  const base = o.get(analyze(deal));
  const bars = keys.map((k) => {
    const dr = driver(k);
    const b = dr.get(deal);
    const lowValue = Math.max(dr.min ?? -Infinity, b - dr.step * stepMult);
    const highValue = b + dr.step * stepMult;
    const low = o.get(evalWith(deal, [{ key: k, value: lowValue }]));
    const high = o.get(evalWith(deal, [{ key: k, value: highValue }]));
    return { key: k, label: dr.label, lowValue, highValue, low, high, spread: Math.abs(high - low) };
  });
  bars.sort((a, b) => (Number.isFinite(b.spread) ? b.spread : -1) - (Number.isFinite(a.spread) ? a.spread : -1));
  return { base, bars };
}

/** Sucht den Treiberwert, bei dem die Zielgröße `target` erreicht (Bisektion). */
export function breakEven(deal: Deal, dKey: string, outKey: string, target: number): number | null {
  const dr = driver(dKey);
  const o = output(outKey);
  const base = dr.get(deal);
  const f = (v: number) => o.get(evalWith(deal, [{ key: dKey, value: v }])) - target;
  // Suchbereich schrittweise erweitern
  const span = Math.max(Math.abs(dr.step) * 2, Math.abs(base) * 0.25, 1e-3);
  let lo = Math.max(dr.min ?? -Infinity, base - span);
  let hi = base + span;
  let flo = f(lo);
  let fhi = f(hi);
  for (let i = 0; i < 12 && (!(Number.isFinite(flo) && Number.isFinite(fhi)) || Math.sign(flo) === Math.sign(fhi)); i++) {
    const w = (hi - lo) * 1.5;
    lo = Math.max(dr.min ?? -Infinity, lo - w);
    hi = hi + w;
    flo = f(lo);
    fhi = f(hi);
  }
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || Math.sign(flo) === Math.sign(fhi)) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (!Number.isFinite(fm)) return null;
    if (Math.abs(fm) < 1e-9 || hi - lo < Math.abs(dr.step) * 1e-6) return mid;
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface Scenario {
  id: string;
  name: string;
  changes: { key: string; value: number }[]; // absolute Werte (bei Δ%-Treibern die Abweichung)
}

export function defaultScenarios(deal: Deal): Scenario[] {
  const ef = deal.dcf.exitFaktor;
  return [
    {
      id: "bear",
      name: "Bear",
      changes: [
        { key: "marktmiete", value: -0.1 },
        { key: "leerstandMonate", value: 0.5 },
        { key: "exitFaktor", value: ef - 2 },
        { key: "mietwachstum", value: Math.max(0, deal.dcf.mietwachstum - 0.01) },
        { key: "zins", value: deal.finanzierung.zins + 0.01 },
      ],
    },
    { id: "base", name: "Base", changes: [] },
    {
      id: "bull",
      name: "Bull",
      changes: [
        { key: "marktmiete", value: 0.1 },
        { key: "leerstandMonate", value: -0.33 },
        { key: "exitFaktor", value: ef + 1.5 },
        { key: "mietwachstum", value: deal.dcf.mietwachstum + 0.01 },
      ],
    },
  ];
}
