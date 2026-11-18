// Broker Opinion of Value: drei Methoden, gewichtet, mit Spanne.
import type { Deal } from "./types";
import type { Analysis } from "./calc";
import { evalWith } from "./sensitivity";

export interface BovMethod {
  key: "faktor" | "dcf" | "vergleich";
  label: string;
  low: number;
  mid: number;
  high: number;
  weight: number; // normiert auf Summe 1 der verfügbaren Methoden
  note: string;
}

export interface BovResult {
  methods: BovMethod[];
  wert: number;
  low: number;
  high: number;
  faktorIst: number;
  preisQm: number;
  bar: number;
  abweichungKaufpreis: number;
  irrBeiWert: number; // IRR, wenn zum Marktwert gekauft wird
}

export function bovResult(deal: Deal, a: Analysis): BovResult {
  const b = deal.bov;
  const s = a.s;
  const raw: (BovMethod & { available: boolean; w: number })[] = [];

  // 1) Faktormethode auf Potenzialmiete abzgl. Vermietungskosten
  const fm = (f: number) => Math.max(0, f * s.potenzialJahr - s.vk.summe);
  raw.push({
    key: "faktor",
    label: "Faktormethode (Potenzial − Vermietungskosten)",
    low: fm(b.zielfaktor - b.faktorSpanne),
    mid: fm(b.zielfaktor),
    high: fm(b.zielfaktor + b.faktorSpanne),
    weight: 0,
    w: b.gewichtFaktor,
    available: s.potenzialJahr > 0,
    note: `Faktor ${fmt(b.zielfaktor - b.faktorSpanne)}–${fmt(b.zielfaktor + b.faktorSpanne)}x auf ${eur(s.potenzialJahr)} abzgl. ${eur(s.vk.summe)}`,
  });

  // 2) DCF: Kaufpreis, bei dem der Kapitalwert zum Diskontierungszins null ist (± 50 bp)
  const r = deal.dcf.diskontsatz;
  const dcfAt = (rate: number) => evalWith(deal, [{ key: "diskontsatz", value: rate }]).cf.kaufpreisMaxDcf;
  raw.push({
    key: "dcf",
    label: "DCF (Kapitalwert = 0)",
    low: Math.max(0, dcfAt(r + 0.005)),
    mid: Math.max(0, a.cf.kaufpreisMaxDcf),
    high: Math.max(0, dcfAt(r - 0.005)),
    weight: 0,
    w: b.gewichtDcf,
    available: Number.isFinite(a.cf.kaufpreisMaxDcf),
    note: `Diskontierungszins ${pct(r - 0.005)}–${pct(r + 0.005)}, Exit-Faktor ${fmt(deal.dcf.exitFaktor)}x`,
  });

  // 3) Vergleichswert über €/m² der Vergleichstransaktionen
  const qms = b.vergleiche.map((v) => v.preisQm).filter((x) => x > 0);
  const avg = qms.length ? qms.reduce((x, y) => x + y, 0) / qms.length : 0;
  raw.push({
    key: "vergleich",
    label: "Vergleichswert (€/m²)",
    low: qms.length ? Math.min(...qms) * s.flaecheM2 : 0,
    mid: avg * s.flaecheM2,
    high: qms.length ? Math.max(...qms) * s.flaecheM2 : 0,
    weight: 0,
    w: b.gewichtVergleich,
    available: qms.length > 0 && s.flaecheM2 > 0,
    note: qms.length ? `${qms.length} Vergleiche, Ø ${eur(avg)}/m²` : "keine Vergleichstransaktionen erfasst",
  });

  const avail = raw.filter((m) => m.available && m.w > 0);
  const wsum = avail.reduce((x, m) => x + m.w, 0);
  const methods: BovMethod[] = raw.map(({ available, w, ...m }) => ({ ...m, weight: available && wsum > 0 ? w / wsum : 0 }));
  const wert = wsum > 0 ? methods.reduce((x, m) => x + m.mid * m.weight, 0) : 0;
  return {
    methods,
    wert,
    low: wert * (1 - b.spanne),
    high: wert * (1 + b.spanne),
    faktorIst: s.istMieteJahr > 0 ? wert / s.istMieteJahr : 0,
    preisQm: s.flaecheM2 > 0 ? wert / s.flaecheM2 : 0,
    bar: wert > 0 ? s.istMieteJahr / wert : 0,
    abweichungKaufpreis: wert > 0 ? deal.pricing.kaufpreis / wert - 1 : 0,
    irrBeiWert: wert > 0 ? evalWith(deal, [{ key: "kaufpreis", value: wert }]).cf.irr : NaN,
  };
}

function fmt(n: number) {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}
function eur(n: number) {
  return Math.round(n).toLocaleString("de-DE") + " €";
}
function pct(n: number) {
  return (n * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " %";
}
