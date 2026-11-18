// Rechenkern. Reine Funktionen ohne Seiteneffekte — jede Zahl im Tool und im
// Excel-Export kommt von hier. Konventionen:
//   * Restlaufzeit in Jahren = (Mietende − Stichtag) in Tagen / 365,25, min. 0
//   * WALT = Σ(Jahresmiete × Restlaufzeit) / Σ Jahresmiete, nur vermietete Einheiten
//   * Cashflow monatlich simuliert, jährlich aggregiert, Diskontierung zum Jahresende
//   * Kaufpreis netto ist die einzige gespeicherte Preisgröße; Faktor, EUR/m²,
//     Renditen werden daraus abgeleitet und beim Ändern zurückgerechnet.

import type { Deal, NutzungAnnahmen, Unit } from "./types";
import { NUTZUNG_DEFAULTS } from "./defaults";

export const DAYS_PER_YEAR = 365.25;

// ---------------------------------------------------------------- Datum

export function parseIso(s: string): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isFinite(t) ? t : null;
}

export function daysBetween(a: string, b: string): number | null {
  const ta = parseIso(a);
  const tb = parseIso(b);
  if (ta == null || tb == null) return null;
  return Math.round((tb - ta) / 86_400_000);
}

/** Datum + n Monate (Monatsanfang des Stichtags-Tages). */
export function addMonths(iso: string, n: number): string {
  const t = parseIso(iso);
  if (t == null) return iso;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- Einheiten

export function nutzungFor(deal: Deal, n: string): NutzungAnnahmen {
  return deal.nutzungen[n] ?? NUTZUNG_DEFAULTS[n] ?? NUTZUNG_DEFAULTS["Sonstiges"];
}

export function isM2(u: Unit): boolean {
  return u.einheit !== "stk";
}

/** Marktmiete der Einheit in EUR/Monat gesamt. */
export function marktmieteMonat(deal: Deal, u: Unit): number {
  const qm = u.marktmiete ?? nutzungFor(deal, u.nutzung).marktmiete;
  return qm * u.flaeche;
}

export function marktmieteQm(deal: Deal, u: Unit): number {
  return u.marktmiete ?? nutzungFor(deal, u.nutzung).marktmiete;
}

export function istMieteQm(u: Unit): number {
  return u.flaeche > 0 ? u.mieteMonat / u.flaeche : 0;
}

/** Restlaufzeit in Jahren bis Mietende (oder bis Break, wenn `bisOption`). */
export function restlaufzeit(deal: Deal, u: Unit, bisOption = false): number {
  if (u.leer) return 0;
  let end = u.mietende;
  if (bisOption && u.option && (!end || u.option < end)) end = u.option;
  if (!end) return deal.dcf.unbefristetJahre;
  const d = daysBetween(deal.stichtag, end);
  if (d == null) return deal.dcf.unbefristetJahre;
  return Math.max(0, d / DAYS_PER_YEAR);
}

export interface NutzungSummary {
  nutzung: string;
  einheit: "m2" | "stk";
  anzahl: number;
  flaeche: number;
  flaecheVermietet: number;
  flaecheLeer: number;
  istMieteJahr: number;
  marktmieteJahr: number; // alle Flächen zur Marktmiete
  potenzialJahr: number; // Ist + Leerstand zur Marktmiete
  mieteXRlz: number; // Σ Jahresmiete × Restlaufzeit
  mieteXRlzBreak: number;
  walt: number;
  walb: number;
  istQm: number; // Ø Ist-Miete EUR/m²/Monat der vermieteten Fläche
  marktQm: number;
  leerstandsquote: number;
  vermietungskosten: number;
}

export interface Vermietungskosten {
  umbau: number;
  makler: number;
  mietfrei: number;
  mietverlust: number;
  leerNk: number;
  summe: number;
  capex: number; // nur echte Auszahlungen (Umbau + Makler)
}

export function vermietungskostenUnit(deal: Deal, u: Unit): Vermietungskosten {
  const zero = { umbau: 0, makler: 0, mietfrei: 0, mietverlust: 0, leerNk: 0, summe: 0, capex: 0 };
  if (!u.leer) return zero;
  const a = nutzungFor(deal, u.nutzung);
  const mm = marktmieteMonat(deal, u);
  const flaecheM2 = isM2(u) ? u.flaeche : 0;
  const umbau = a.umbauLeer * flaecheM2;
  const makler = a.maklerMonate * mm;
  const mietfrei = a.mietfreiMonate * mm;
  const mietverlust = a.leerstandMonate * mm;
  const leerNk = a.leerstandMonate * a.leerstandNk * flaecheM2;
  const summe = umbau + makler + mietfrei + mietverlust + leerNk;
  return { umbau, makler, mietfrei, mietverlust, leerNk, summe, capex: umbau + makler };
}

export interface RentRollSummary {
  byNutzung: NutzungSummary[];
  flaecheM2: number;
  flaecheVermietetM2: number;
  flaecheLeerM2: number;
  stellplaetze: number;
  stellplaetzeLeer: number;
  istMieteJahr: number;
  marktmieteJahr: number;
  potenzialJahr: number;
  mieteXRlz: number;
  walt: number;
  walb: number;
  leerstandsquoteFlaeche: number; // m²-Flächen
  leerstandsquoteMiete: number; // Leerstand zu Marktmiete / Potenzial
  overRent: number; // Ist / Markt der vermieteten Flächen − 1
  vk: Vermietungskosten;
  anzahlMieter: number;
}

export function summarize(deal: Deal): RentRollSummary {
  const map = new Map<string, NutzungSummary>();
  const vk: Vermietungskosten = { umbau: 0, makler: 0, mietfrei: 0, mietverlust: 0, leerNk: 0, summe: 0, capex: 0 };
  let marktVermietet = 0;
  let istVermietet = 0;
  const mieter = new Set<string>();

  for (const u of deal.units) {
    const key = u.nutzung || "Sonstiges";
    let s = map.get(key);
    if (!s) {
      s = {
        nutzung: key,
        einheit: isM2(u) ? "m2" : "stk",
        anzahl: 0,
        flaeche: 0,
        flaecheVermietet: 0,
        flaecheLeer: 0,
        istMieteJahr: 0,
        marktmieteJahr: 0,
        potenzialJahr: 0,
        mieteXRlz: 0,
        mieteXRlzBreak: 0,
        walt: 0,
        walb: 0,
        istQm: 0,
        marktQm: 0,
        leerstandsquote: 0,
        vermietungskosten: 0,
      };
      map.set(key, s);
    }
    const jm = u.leer ? 0 : u.mieteMonat * 12;
    const mj = marktmieteMonat(deal, u) * 12;
    s.anzahl += 1;
    s.flaeche += u.flaeche;
    if (u.leer) s.flaecheLeer += u.flaeche;
    else s.flaecheVermietet += u.flaeche;
    s.istMieteJahr += jm;
    s.marktmieteJahr += mj;
    s.potenzialJahr += u.leer ? mj : jm;
    s.mieteXRlz += jm * restlaufzeit(deal, u);
    s.mieteXRlzBreak += jm * restlaufzeit(deal, u, true);
    const v = vermietungskostenUnit(deal, u);
    s.vermietungskosten += v.summe;
    vk.umbau += v.umbau;
    vk.makler += v.makler;
    vk.mietfrei += v.mietfrei;
    vk.mietverlust += v.mietverlust;
    vk.leerNk += v.leerNk;
    vk.summe += v.summe;
    vk.capex += v.capex;
    if (!u.leer) {
      marktVermietet += mj;
      istVermietet += jm;
      const name = u.mieter.trim().toLowerCase();
      if (name) mieter.add(name);
    }
  }

  const byNutzung = [...map.values()];
  for (const s of byNutzung) {
    s.walt = s.istMieteJahr > 0 ? s.mieteXRlz / s.istMieteJahr : 0;
    s.walb = s.istMieteJahr > 0 ? s.mieteXRlzBreak / s.istMieteJahr : 0;
    s.istQm = s.flaecheVermietet > 0 ? s.istMieteJahr / 12 / s.flaecheVermietet : 0;
    s.marktQm = s.flaeche > 0 ? s.marktmieteJahr / 12 / s.flaeche : 0;
    s.leerstandsquote = s.flaeche > 0 ? s.flaecheLeer / s.flaeche : 0;
  }

  // Flächen direkt aus den Einheiten (eine Nutzungsart kann m² und Stück mischen)
  const m2Units = deal.units.filter(isM2);
  const stkUnits = deal.units.filter((u) => !isM2(u));
  const flaecheM2 = sum(m2Units.map((u) => u.flaeche));
  const flaecheLeerM2 = sum(m2Units.filter((u) => u.leer).map((u) => u.flaeche));
  const istMieteJahr = sum(byNutzung.map((s) => s.istMieteJahr));
  const potenzialJahr = sum(byNutzung.map((s) => s.potenzialJahr));
  const mieteXRlz = sum(byNutzung.map((s) => s.mieteXRlz));
  const mieteXRlzBreak = sum(byNutzung.map((s) => s.mieteXRlzBreak));

  return {
    byNutzung,
    flaecheM2,
    flaecheVermietetM2: flaecheM2 - flaecheLeerM2,
    flaecheLeerM2,
    stellplaetze: sum(stkUnits.map((u) => u.flaeche)),
    stellplaetzeLeer: sum(stkUnits.filter((u) => u.leer).map((u) => u.flaeche)),
    istMieteJahr,
    marktmieteJahr: sum(byNutzung.map((s) => s.marktmieteJahr)),
    potenzialJahr,
    mieteXRlz,
    walt: istMieteJahr > 0 ? mieteXRlz / istMieteJahr : 0,
    walb: istMieteJahr > 0 ? mieteXRlzBreak / istMieteJahr : 0,
    leerstandsquoteFlaeche: flaecheM2 > 0 ? flaecheLeerM2 / flaecheM2 : 0,
    leerstandsquoteMiete: potenzialJahr > 0 ? (potenzialJahr - istMieteJahr) / potenzialJahr : 0,
    overRent: marktVermietet > 0 ? istVermietet / marktVermietet - 1 : 0,
    vk,
    anzahlMieter: mieter.size,
  };
}

export function sum(a: number[]): number {
  let s = 0;
  for (const x of a) s += x;
  return s;
}

// ---------------------------------------------------------------- Pricing

export interface PricingResult {
  kaufpreis: number;
  nkQuote: number;
  nk: number;
  grest: number;
  notar: number;
  makler: number;
  sonstigeNk: number;
  gesamtkosten: number; // KP + NK
  gesamtinvest: number; // KP + NK + Ausbau Leerstand + Sofort-Capex (= Auszahlung t0)
  faktorIst: number;
  faktorPotenzial: number; // (KP + VK) / Potenzialmiete
  faktor: number; // gemäß Bewertungsbasis
  preisQm: number;
  bar: number; // Bruttoanfangsrendite auf Ist
  barPotenzial: number;
  noiIst: number;
  niy: number; // Nettoanfangsrendite auf KP inkl. NK
  vkAbzug: number; // Vermietungskosten, die vom Wert abgezogen werden
}

export function nkQuote(deal: Deal): number {
  const p = deal.pricing;
  return p.grest + p.notar + p.makler + p.sonstigeNk;
}

/** Nettomietertrag im Ist-Zustand (12 Monate), Basis für die Nettoanfangsrendite. */
export function noiIst(deal: Deal, s: RentRollSummary = summarize(deal)): number {
  const k = deal.kosten;
  const pct = k.verwaltung + k.mietausfall + k.nichtUmlagefaehig;
  let leerNk = 0;
  for (const u of deal.units) if (u.leer && isM2(u)) leerNk += nutzungFor(deal, u.nutzung).leerstandNk * u.flaeche * 12;
  return s.istMieteJahr * (1 - pct) - k.instandhaltung * s.flaecheM2 - leerNk;
}

export function pricing(deal: Deal, s: RentRollSummary = summarize(deal)): PricingResult {
  const kp = deal.pricing.kaufpreis;
  const q = nkQuote(deal);
  const noi = noiIst(deal, s);
  const faktorIst = s.istMieteJahr > 0 ? kp / s.istMieteJahr : 0;
  const faktorPotenzial = s.potenzialJahr > 0 ? (kp + s.vk.summe) / s.potenzialJahr : 0;
  return {
    kaufpreis: kp,
    nkQuote: q,
    nk: kp * q,
    grest: kp * deal.pricing.grest,
    notar: kp * deal.pricing.notar,
    makler: kp * deal.pricing.makler,
    sonstigeNk: kp * deal.pricing.sonstigeNk,
    gesamtkosten: kp * (1 + q),
    gesamtinvest: kp * (1 + q) + s.vk.umbau + deal.pricing.capexSofort,
    faktorIst,
    faktorPotenzial,
    faktor: deal.pricing.basis === "potenzial" ? faktorPotenzial : faktorIst,
    preisQm: s.flaecheM2 > 0 ? kp / s.flaecheM2 : 0,
    bar: kp > 0 ? s.istMieteJahr / kp : 0,
    barPotenzial: kp > 0 ? s.potenzialJahr / kp : 0,
    noiIst: noi,
    niy: kp > 0 ? noi / (kp * (1 + q)) : 0,
    vkAbzug: deal.pricing.basis === "potenzial" ? s.vk.summe : 0,
  };
}

export type PriceDriver = "kaufpreis" | "faktor" | "faktorIst" | "faktorPotenzial" | "preisQm" | "bar" | "niy";

/**
 * Rechnet eine geänderte Kennzahl in den Kaufpreis zurück. Alle anderen
 * Kennzahlen folgen danach automatisch aus `pricing()` — so hängen alle
 * Regler zusammen. Liefert null, wenn die Kennzahl ohne Basis nicht
 * umkehrbar ist (z. B. Faktor bei Ist-Miete 0).
 */
export function kaufpreisFrom(deal: Deal, driver: PriceDriver, value: number, s: RentRollSummary = summarize(deal)): number | null {
  if (!Number.isFinite(value)) return null;
  const q = nkQuote(deal);
  switch (driver) {
    case "kaufpreis":
      return Math.max(0, value);
    case "faktor":
      return kaufpreisFrom(deal, deal.pricing.basis === "potenzial" ? "faktorPotenzial" : "faktorIst", value, s);
    case "faktorIst":
      return s.istMieteJahr > 0 ? Math.max(0, value * s.istMieteJahr) : null;
    case "faktorPotenzial":
      return s.potenzialJahr > 0 ? Math.max(0, value * s.potenzialJahr - s.vk.summe) : null;
    case "preisQm":
      return s.flaecheM2 > 0 ? Math.max(0, value * s.flaecheM2) : null;
    case "bar":
      return value > 0 && s.istMieteJahr > 0 ? s.istMieteJahr / value : null;
    case "niy": {
      const noi = noiIst(deal, s);
      return value > 0 && noi > 0 ? noi / (value * (1 + q)) : null;
    }
  }
}

// ---------------------------------------------------------------- Cashflow

export interface YearRow {
  jahr: number;
  bis: string; // Periodenende
  mieteVertrag: number; // Bruttomiete bei Vollvermietung laut Verträgen/Markt
  leerstandsverlust: number;
  mietfrei: number;
  miete: number; // vereinnahmte Nettokaltmiete
  verwaltung: number;
  mietausfall: number;
  nichtUmlagefaehig: number;
  instandhaltung: number;
  leerNk: number;
  noi: number;
  ausbau: number;
  makler: number;
  capex: number;
  cfOperativ: number; // NOI − Capex
  exitWert: number;
  verkaufskosten: number;
  cf: number; // ungehebelt inkl. Exit
  // Finanzierung
  darlehenAnfang: number;
  zinsen: number;
  tilgung: number;
  rueckzahlung: number;
  darlehenEnde: number;
  cfLevered: number;
  dscr: number;
  coc: number;
  leerstandsquote: number; // flächengewichtet, Jahresdurchschnitt
}

export interface CashflowResult {
  rows: YearRow[];
  forwardMiete: number; // Miete im Jahr N+1 (Exit-Basis)
  t0: {
    kaufpreis: number;
    nk: number;
    ausbauLeer: number;
    capexSofort: number;
    darlehen: number;
    gebuehren: number;
    cf: number;
    cfLevered: number;
    eigenkapital: number;
  };
  irr: number;
  irrLevered: number;
  npv: number;
  dcfWert: number; // Barwert der Rückflüsse
  kaufpreisMaxDcf: number; // Kaufpreis netto, bei dem NPV = 0 zum Diskontsatz
  equityMultiple: number;
  gewinn: number;
  gewinnLevered: number;
  exitWert: number;
  exitNetto: number;
  avgCoc: number;
  minDscr: number;
}

/**
 * Monatliche Simulation je Einheit. Gibt für jeden Monat Miete, Leerstand etc. zurück.
 * Monat m beginnt am Stichtag + m Monate.
 */
interface UnitMonth {
  miete: number;
  vertrag: number; // Miete, die bei Vollvermietung anfiele
  leerFlaeche: number;
  mietfrei: number;
  ausbau: number;
  makler: number;
}

function simulateUnit(deal: Deal, u: Unit, monthStarts: number[]): UnitMonth[] {
  const months = monthStarts.length;
  const a = nutzungFor(deal, u.nutzung);
  const g = deal.dcf.mietwachstum;
  const idx = u.indexierung ?? deal.dcf.indexierung;
  const flM2 = isM2(u) ? u.flaeche : 0;
  const mmQm = marktmieteQm(deal, u);
  const growth = (m: number) => Math.pow(1 + g, m / 12);
  const out: UnitMonth[] = Array.from({ length: months }, () => ({ miete: 0, vertrag: 0, leerFlaeche: 0, mietfrei: 0, ausbau: 0, makler: 0 }));

  // Phase 1: laufender Vertrag
  let m0 = 0; // erster Monat nach Vertragsende
  if (!u.leer) {
    let endMonth: number; // letzter Monat mit Miete (inklusive)
    if (!u.mietende) endMonth = months - 1;
    else {
      const t = parseIso(u.mietende);
      endMonth = months - 1;
      if (t != null) {
        // Monat m zahlt, solange sein Beginn ≤ Mietende
        endMonth = -1;
        for (let m = 0; m < months; m++) {
          if (monthStarts[m] <= t) endMonth = m;
          else break;
        }
      }
    }
    for (let m = 0; m <= endMonth && m < months; m++) {
      const rent = u.mieteMonat * Math.pow(1 + idx, Math.floor(m / 12));
      out[m].miete = rent;
      out[m].vertrag = rent;
    }
    m0 = endMonth + 1;
    if (m0 >= months) return out;
  }

  // Phase 2: (Neu-)Vermietungszyklen
  let first = true;
  let start = m0;
  while (start < months) {
    const p = u.leer && first ? 0 : a.verlaengerung;
    const leerM = (1 - p) * a.leerstandMonate;
    const freiM = (1 - p) * a.mietfreiMonate;
    const neueMiete = mmQm * u.flaeche * growth(start + leerM);
    // Kosten
    if (u.leer && first) {
      // Ausbau heute leerer Flächen fällt in t0 an (siehe cashflow()), nicht hier
    } else {
      out[start].ausbau += (1 - p) * a.umbauNeu * flM2;
    }
    const maklerMonth = Math.min(months - 1, start + Math.floor(leerM));
    out[maklerMonth].makler += (1 - p) * a.maklerMonate * neueMiete;

    const laufzeitM = Math.max(12, Math.round(a.neueLaufzeit * 12));
    const end = start + Math.ceil(leerM) + laufzeitM; // exklusiv
    for (let m = start; m < Math.min(end, months); m++) {
      const k = m - start; // Monate seit Zyklusbeginn
      const leerAnteil = clamp(leerM - k, 0, 1);
      const zahlAnteil = clamp(k + 1 - (leerM + freiM), 0, 1);
      const freiAnteil = 1 - leerAnteil - zahlAnteil;
      const jahreSeitBeginn = Math.floor(Math.max(0, k - leerM) / 12);
      const rent = neueMiete * Math.pow(1 + idx, jahreSeitBeginn);
      out[m].vertrag += rent;
      out[m].miete += rent * zahlAnteil;
      out[m].mietfrei += rent * Math.max(0, freiAnteil);
      out[m].leerFlaeche += flM2 * leerAnteil;
    }
    first = false;
    start = end;
  }
  return out;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

export function cashflow(deal: Deal, s: RentRollSummary = summarize(deal)): CashflowResult {
  const N = Math.max(1, Math.min(30, Math.round(deal.dcf.haltedauer)));
  const months = (N + 1) * 12;
  const k = deal.kosten;
  const kg = deal.dcf.kostensteigerung;
  const yearsArr = Array.from({ length: N + 1 }, (_, i) => ({
    vertrag: 0,
    miete: 0,
    mietfrei: 0,
    leerFlaecheMonate: 0,
    ausbau: 0,
    makler: 0,
    leerNk: 0,
  }));

  const monthStarts = Array.from({ length: months }, (_, m) => parseIso(addMonths(deal.stichtag, m)) ?? 0);
  for (const u of deal.units) {
    const sim = simulateUnit(deal, u, monthStarts);
    const a = nutzungFor(deal, u.nutzung);
    for (let m = 0; m < months; m++) {
      const y = Math.floor(m / 12);
      const r = sim[m];
      const Y = yearsArr[y];
      Y.vertrag += r.vertrag;
      Y.miete += r.miete;
      Y.mietfrei += r.mietfrei;
      Y.leerFlaecheMonate += r.leerFlaeche;
      Y.ausbau += r.ausbau;
      Y.makler += r.makler;
      Y.leerNk += r.leerFlaeche * a.leerstandNk * Math.pow(1 + kg, y);
    }
  }

  const kp = deal.pricing.kaufpreis;
  const q = nkQuote(deal);
  const ausbauLeer = s.vk.umbau;
  const fin = deal.finanzierung;
  const darlehen = fin.aktiv ? fin.ltv * kp : 0;
  const gebuehren = darlehen * (fin.aktiv ? fin.gebuehren : 0);
  const t0cf = -(kp * (1 + q) + ausbauLeer + deal.pricing.capexSofort);
  const t0lev = t0cf + darlehen - gebuehren;
  const eigenkapital = -t0lev;
  const annuitaet = darlehen * (fin.zins + fin.tilgung);

  const rows: YearRow[] = [];
  let saldo = darlehen;
  const forwardMiete = yearsArr[N].miete;
  const exitWert = deal.dcf.exitFaktor * forwardMiete;
  const verkaufskosten = exitWert * deal.dcf.verkaufskosten;

  for (let y = 0; y < N; y++) {
    const Y = yearsArr[y];
    const miete = Y.miete;
    const verwaltung = miete * k.verwaltung;
    const mietausfall = miete * k.mietausfall;
    const nichtUmlagefaehig = miete * k.nichtUmlagefaehig;
    const instandhaltung = k.instandhaltung * s.flaecheM2 * Math.pow(1 + kg, y);
    const noi = miete - verwaltung - mietausfall - nichtUmlagefaehig - instandhaltung - Y.leerNk;
    const capex = Y.ausbau + Y.makler;
    const isExit = y === N - 1;
    const cfOperativ = noi - capex;
    const cf = cfOperativ + (isExit ? exitWert - verkaufskosten : 0);

    const darlehenAnfang = saldo;
    const zinsen = saldo * fin.zins;
    const tilgung = Math.min(saldo, Math.max(0, annuitaet - zinsen));
    saldo -= tilgung;
    const rueckzahlung = isExit ? saldo : 0;
    const darlehenEnde = saldo - rueckzahlung;
    const debtService = zinsen + tilgung;
    const cfLevered = cf - zinsen - tilgung - rueckzahlung;
    if (isExit) saldo = 0;

    rows.push({
      jahr: y + 1,
      bis: addMonths(deal.stichtag, (y + 1) * 12),
      mieteVertrag: Y.vertrag,
      leerstandsverlust: 0,
      mietfrei: Y.mietfrei,
      miete,
      verwaltung,
      mietausfall,
      nichtUmlagefaehig,
      instandhaltung,
      leerNk: Y.leerNk,
      noi,
      ausbau: Y.ausbau,
      makler: Y.makler,
      capex,
      cfOperativ,
      exitWert: isExit ? exitWert : 0,
      verkaufskosten: isExit ? verkaufskosten : 0,
      cf,
      darlehenAnfang,
      zinsen,
      tilgung,
      rueckzahlung,
      darlehenEnde,
      cfLevered,
      dscr: debtService > 0 ? noi / debtService : 0,
      coc: eigenkapital > 0 ? (cfOperativ - zinsen - tilgung) / eigenkapital : 0,
      leerstandsquote: s.flaecheM2 > 0 ? Y.leerFlaecheMonate / 12 / s.flaecheM2 : 0,
    });
  }
  // Leerstandsverlust = Vertragsmiete bei Vollvermietung zur Marktmiete − tatsächliche Miete − Mietfreiheit
  for (let y = 0; y < N; y++) {
    const r = rows[y];
    r.leerstandsverlust = Math.max(0, r.mieteVertrag - r.miete - r.mietfrei);
  }

  const cfs = [t0cf, ...rows.map((r) => r.cf)];
  const cfsLev = [t0lev, ...rows.map((r) => r.cfLevered)];
  const r = deal.dcf.diskontsatz;
  let pv = 0;
  rows.forEach((row, i) => (pv += row.cf / Math.pow(1 + r, i + 1)));
  const npv = t0cf + pv;
  const kaufpreisMaxDcf = (pv - ausbauLeer - deal.pricing.capexSofort) / (1 + q);
  const posLev = sum(cfsLev.slice(1).filter((x) => x > 0));
  const negLev = -sum(cfsLev.filter((x) => x < 0));
  const cocs = rows.map((x) => x.coc);
  const dscrs = rows.map((x) => x.dscr).filter((x) => x > 0);

  return {
    rows,
    forwardMiete,
    t0: { kaufpreis: kp, nk: kp * q, ausbauLeer, capexSofort: deal.pricing.capexSofort, darlehen, gebuehren, cf: t0cf, cfLevered: t0lev, eigenkapital },
    irr: irr(cfs),
    irrLevered: fin.aktiv ? irr(cfsLev) : irr(cfs),
    npv,
    dcfWert: pv,
    kaufpreisMaxDcf,
    equityMultiple: negLev > 0 ? posLev / negLev : 0,
    gewinn: sum(cfs),
    gewinnLevered: sum(cfsLev),
    exitWert,
    exitNetto: exitWert - verkaufskosten,
    avgCoc: cocs.length ? sum(cocs) / cocs.length : 0,
    minDscr: dscrs.length ? Math.min(...dscrs) : 0,
  };
}

// ---------------------------------------------------------------- IRR

export function npvAt(cfs: number[], rate: number): number {
  let v = 0;
  for (let i = 0; i < cfs.length; i++) v += cfs[i] / Math.pow(1 + rate, i);
  return v;
}

/** Interner Zinsfuß. Newton mit Bisektions-Rückfall; NaN, wenn keiner existiert. */
export function irr(cfs: number[]): number {
  const hasPos = cfs.some((x) => x > 0);
  const hasNeg = cfs.some((x) => x < 0);
  if (!hasPos || !hasNeg) return NaN;
  // Bisektion auf [-0.99, 10] ist robust; vorher Newton versuchen
  let x = 0.08;
  for (let i = 0; i < 50; i++) {
    let f = 0;
    let d = 0;
    for (let t = 0; t < cfs.length; t++) {
      const p = Math.pow(1 + x, t);
      f += cfs[t] / p;
      d -= (t * cfs[t]) / (p * (1 + x));
    }
    if (Math.abs(f) < 1e-7) return x;
    if (d === 0) break;
    const nx = x - f / d;
    if (!Number.isFinite(nx) || nx <= -0.99) break;
    if (Math.abs(nx - x) < 1e-10) return nx;
    x = nx;
  }
  let lo = -0.99;
  let hi = 10;
  let flo = npvAt(cfs, lo);
  const fhi = npvAt(cfs, hi);
  if (Math.sign(flo) === Math.sign(fhi)) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npvAt(cfs, mid);
    if (Math.abs(fm) < 1e-7 || hi - lo < 1e-10) return mid;
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- Gesamtauswertung

export interface Analysis {
  s: RentRollSummary;
  p: PricingResult;
  cf: CashflowResult;
  kaufpreisFaktormethode: number; // Zielfaktor × Potenzial − Vermietungskosten
}

export function analyze(deal: Deal): Analysis {
  const s = summarize(deal);
  const p = pricing(deal, s);
  const cf = cashflow(deal, s);
  return {
    s,
    p,
    cf,
    kaufpreisFaktormethode: Math.max(0, deal.bov.zielfaktor * s.potenzialJahr - s.vk.summe),
  };
}

// ---------------------------------------------------------------- Plausibilität

export interface Check {
  level: "ok" | "warn" | "error";
  text: string;
  unitId?: string;
}

export function checks(deal: Deal, s: RentRollSummary = summarize(deal)): Check[] {
  const out: Check[] = [];
  const seen = new Map<string, string>();
  for (const u of deal.units) {
    const label = `${u.mieter || "(ohne Mieter)"} ${u.geschoss ? "· " + u.geschoss : ""}`.trim();
    if (u.flaeche <= 0) out.push({ level: "error", text: `${label}: Fläche fehlt`, unitId: u.id });
    if (!u.leer && u.mieteMonat <= 0) out.push({ level: "warn", text: `${label}: vermietet, aber Miete 0`, unitId: u.id });
    if (u.leer && u.mieteMonat > 0) out.push({ level: "warn", text: `${label}: als leer markiert, hat aber Miete — wird nicht gezählt`, unitId: u.id });
    if (!u.leer && u.mietende && deal.stichtag && u.mietende < deal.stichtag)
      out.push({ level: "warn", text: `${label}: Mietende ${fmtDate(u.mietende)} liegt vor dem Stichtag`, unitId: u.id });
    if (!u.leer && !u.mietende && u.nutzung !== "Wohnen" && u.nutzung !== "Stellplätze")
      out.push({ level: "warn", text: `${label}: kein Mietende — zählt im WALT mit ${deal.dcf.unbefristetJahre} Jahren`, unitId: u.id });
    if (!u.leer && u.flaeche > 0 && u.mieteMonat > 0) {
      const ist = istMieteQm(u);
      const markt = marktmieteQm(deal, u);
      if (markt > 0 && (ist > markt * 1.6 || ist < markt * 0.4))
        out.push({ level: "warn", text: `${label}: Ist-Miete ${ist.toFixed(2)} €/${isM2(u) ? "m²" : "Stk"} weicht stark von Marktmiete ${markt.toFixed(2)} ab`, unitId: u.id });
    }
    const key = `${u.mieter.trim().toLowerCase()}|${u.geschoss.trim().toLowerCase()}|${u.flaeche}|${u.mieteMonat}`;
    if (u.mieter && seen.has(key)) out.push({ level: "warn", text: `${label}: möglicherweise doppelt erfasst`, unitId: u.id });
    seen.set(key, u.id);
  }
  const o = deal.objekt;
  if (o.angabeFlaeche && s.flaecheM2 > 0) {
    const d = s.flaecheM2 / o.angabeFlaeche - 1;
    out.push({
      level: Math.abs(d) > 0.02 ? "warn" : "ok",
      text: `Summe Mietfläche ${fmtInt(s.flaecheM2)} m² vs. Angabe ${fmtInt(o.angabeFlaeche)} m² (${(d * 100).toFixed(1)} %)`,
    });
  }
  if (o.angabeJahresmiete && s.istMieteJahr > 0) {
    const d = s.istMieteJahr / o.angabeJahresmiete - 1;
    out.push({
      level: Math.abs(d) > 0.02 ? "warn" : "ok",
      text: `Summe Jahresmiete ${fmtInt(s.istMieteJahr)} € vs. Angabe ${fmtInt(o.angabeJahresmiete)} € (${(d * 100).toFixed(1)} %)`,
    });
  }
  if (deal.units.length === 0) out.push({ level: "error", text: "Keine Mieteinheiten erfasst" });
  if (deal.pricing.kaufpreis <= 0) out.push({ level: "warn", text: "Kein Kaufpreis gesetzt" });
  return out;
}

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("de-DE");
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
