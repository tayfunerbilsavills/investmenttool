import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDeal, emptyUnit, sampleDeal } from "../src/lib/model/defaults";
import { analyze, cashflow, irr, kaufpreisFrom, pricing, restlaufzeit, summarize, vermietungskostenUnit } from "../src/lib/model/calc";
import { breakEven, grid, tornado } from "../src/lib/model/sensitivity";
import type { Deal } from "../src/lib/model/types";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} != ${b}`);

function waltDeal(): Deal {
  const d = emptyDeal();
  d.stichtag = "2026-01-01";
  d.units = [
    emptyUnit({ id: "a", nutzung: "Büro", flaeche: 500, mieteMonat: 10_000, mietende: "2031-01-01" }),
    emptyUnit({ id: "b", nutzung: "Büro", flaeche: 300, mieteMonat: 5_000, mietende: "2028-01-01" }),
    emptyUnit({ id: "c", nutzung: "Einzelhandel", flaeche: 800, mieteMonat: 20_000, mietende: "2036-01-01" }),
    emptyUnit({ id: "d", nutzung: "Büro", flaeche: 400, leer: true }),
  ];
  return d;
}

test("Restlaufzeit = Tage / 365,25", () => {
  const d = waltDeal();
  close(restlaufzeit(d, d.units[0]), 1826 / 365.25);
  close(restlaufzeit(d, d.units[1]), 730 / 365.25);
  assert.equal(restlaufzeit(d, d.units[3]), 0);
});

test("WALT je Nutzung und gesamt mietgewichtet", () => {
  const d = waltDeal();
  const s = summarize(d);
  const rA = 1826 / 365.25,
    rB = 730 / 365.25,
    rC = 3652 / 365.25;
  const buero = s.byNutzung.find((x) => x.nutzung === "Büro")!;
  const eh = s.byNutzung.find((x) => x.nutzung === "Einzelhandel")!;
  close(buero.walt, (120_000 * rA + 60_000 * rB) / 180_000);
  close(eh.walt, rC);
  close(s.walt, (120_000 * rA + 60_000 * rB + 240_000 * rC) / 420_000);
  // Gesamt-WALT = mietgewichteter Durchschnitt der Nutzungs-WALTs, NICHT deren einfaches Mittel
  close(s.walt, (buero.walt * buero.istMieteJahr + eh.walt * eh.istMieteJahr) / s.istMieteJahr);
  assert.ok(Math.abs(s.walt - (buero.walt + eh.walt) / 2) > 0.1);
  // Leerstand zählt nicht in den WALT, aber in die Fläche
  assert.equal(buero.flaeche, 1200);
  assert.equal(buero.flaecheLeer, 400);
});

test("Vermietungskosten für leere Fläche", () => {
  const d = emptyDeal();
  const u = emptyUnit({ nutzung: "Büro", flaeche: 1000, leer: true });
  d.units = [u];
  const v = vermietungskostenUnit(d, u); // 18 €/m², 500 €/m², 3 Mon. Makler, 4 mietfrei, 9 leer, 3,5 NK
  close(v.umbau, 500_000);
  close(v.makler, 54_000);
  close(v.mietfrei, 72_000);
  close(v.mietverlust, 162_000);
  close(v.leerNk, 31_500);
  close(v.summe, 819_500);
  close(v.capex, 554_000);
});

test("Regler hängen zusammen: Faktor → Kaufpreis → €/m², Renditen", () => {
  const d = waltDeal();
  const s = summarize(d);
  const kp = kaufpreisFrom(d, "faktorIst", 20, s)!;
  close(kp, 20 * 420_000);
  d.pricing.kaufpreis = kp;
  let p = pricing(d);
  close(p.faktorIst, 20);
  close(p.preisQm, kp / 2000);
  close(p.bar, 0.05);

  d.pricing.kaufpreis = kaufpreisFrom(d, "preisQm", 4000)!;
  p = pricing(d);
  close(p.preisQm, 4000);
  close(p.faktorIst, 8_000_000 / 420_000);

  d.pricing.kaufpreis = kaufpreisFrom(d, "niy", 0.045)!;
  close(pricing(d).niy, 0.045);

  d.pricing.kaufpreis = kaufpreisFrom(d, "bar", 0.055)!;
  close(pricing(d).bar, 0.055);

  // Potenzialbasis: Kaufpreis = Faktor × Potenzialmiete − Vermietungskosten
  d.pricing.basis = "potenzial";
  const s2 = summarize(d);
  d.pricing.kaufpreis = kaufpreisFrom(d, "faktor", 19)!;
  close(d.pricing.kaufpreis, 19 * s2.potenzialJahr - s2.vk.summe);
  close(pricing(d).faktor, 19);
});

test("IRR", () => {
  close(irr([-100, 110]), 0.1);
  close(irr([-1000, 100, 100, 1100]), 0.1);
  assert.ok(Number.isNaN(irr([100, 100])));
});

function flatDeal(): Deal {
  const d = emptyDeal();
  d.stichtag = "2026-01-01";
  d.units = [emptyUnit({ nutzung: "Büro", flaeche: 1000, mieteMonat: 100_000 / 12, mietende: "" })];
  d.pricing = { ...d.pricing, kaufpreis: 2_000_000, grest: 0, notar: 0, makler: 0, sonstigeNk: 0 };
  d.kosten = { verwaltung: 0, mietausfall: 0, nichtUmlagefaehig: 0, instandhaltung: 0 };
  d.dcf = { ...d.dcf, haltedauer: 10, mietwachstum: 0, indexierung: 0, kostensteigerung: 0, exitFaktor: 20, verkaufskosten: 0, diskontsatz: 0.05 };
  d.finanzierung = { aktiv: true, ltv: 0.5, zins: 0.04, tilgung: 0, gebuehren: 0 };
  return d;
}

test("DCF: konstante Miete, Kauf und Exit zum Faktor 20 → IRR 5 %", () => {
  const d = flatDeal();
  const cf = cashflow(d);
  close(cf.rows[0].miete, 100_000);
  close(cf.forwardMiete, 100_000);
  close(cf.exitWert, 2_000_000);
  close(cf.irr, 0.05);
  // gehebelt: (100k − 40k Zins) / 1 Mio EK = 6 %
  close(cf.irrLevered, 0.06);
  close(cf.kaufpreisMaxDcf, 2_000_000, 1e-6);
  close(cf.npv, 0, 1e-6);
});

test("DCF: Annuität tilgt korrekt", () => {
  const d = flatDeal();
  d.finanzierung.tilgung = 0.02;
  const cf = cashflow(d);
  const r1 = cf.rows[0];
  close(r1.zinsen, 40_000);
  close(r1.tilgung, 20_000);
  close(cf.rows[1].zinsen, 980_000 * 0.04);
  const last = cf.rows[cf.rows.length - 1];
  assert.equal(last.darlehenEnde, 0);
  close(last.rueckzahlung + cf.rows.reduce((a, r) => a + r.tilgung, 0), 1_000_000);
});

test("DCF: Leerstand wird nach Leerstandsdauer zur Marktmiete vermietet", () => {
  const d = flatDeal();
  d.nutzungen["Büro"] = { ...d.nutzungen["Büro"], marktmiete: 10, leerstandMonate: 6, mietfreiMonate: 0, maklerMonate: 0, umbauLeer: 500, leerstandNk: 0 };
  d.units = [emptyUnit({ nutzung: "Büro", flaeche: 100, leer: true })];
  const cf = cashflow(d);
  close(cf.rows[0].miete, 6 * 1000);
  close(cf.rows[1].miete, 12_000);
  close(cf.t0.ausbauLeer, 50_000);
  close(cf.rows[0].leerstandsverlust, 6_000);
});

test("DCF: Auslauf mit 100 % Verlängerung geht nahtlos zur Marktmiete über", () => {
  const d = flatDeal();
  d.nutzungen["Büro"] = { ...d.nutzungen["Büro"], marktmiete: 10, verlaengerung: 1 };
  d.units = [emptyUnit({ nutzung: "Büro", flaeche: 100, mieteMonat: 800, mietende: "2026-06-30" })];
  const cf = cashflow(d);
  close(cf.rows[0].miete, 6 * 800 + 6 * 1000);
  close(cf.rows[0].capex, 0);
});

test("Sensitivitäten laufen und Break-even trifft das Ziel", () => {
  const d = sampleDeal();
  const g = grid(d, "faktorIst", [16, 18, 20], "exitFaktor", [16, 18, 20], "irr");
  assert.equal(g.values.length, 3);
  // höherer Kaufpreisfaktor → niedrigere IRR
  assert.ok(g.values[1][0] > g.values[1][2]);
  // höherer Exit-Faktor → höhere IRR
  assert.ok(g.values[2][1] > g.values[0][1]);
  const t = tornado(d, "irr", ["exitFaktor", "marktmiete", "zins"]);
  assert.equal(t.bars.length, 3);
  const be = breakEven(d, "exitFaktor", "irr", 0.06);
  assert.ok(be != null);
  const d2 = structuredClone(d);
  d2.dcf.exitFaktor = be!;
  close(analyze(d2).cf.irr, 0.06, 1e-5);
});

test("Musterobjekt: Summen konsistent", () => {
  const d = sampleDeal();
  const a = analyze(d);
  const sumRent = d.units.filter((u) => !u.leer).reduce((x, u) => x + u.mieteMonat * 12, 0);
  close(a.s.istMieteJahr, sumRent);
  close(a.s.byNutzung.reduce((x, n) => x + n.istMieteJahr, 0), sumRent);
  close(a.p.faktorIst, d.pricing.kaufpreis / sumRent);
  assert.ok(Number.isFinite(a.cf.irr));
});

test("BOV: gewichteter Wert und IRR beim Marktwert", async () => {
  const { bovResult } = await import("../src/lib/model/bov");
  const d = sampleDeal();
  const a = analyze(d);
  const b = bovResult(d, a);
  const f = b.methods.find((m) => m.key === "faktor")!;
  const c = b.methods.find((m) => m.key === "dcf")!;
  close(f.mid, a.kaufpreisFaktormethode);
  close(c.mid, a.cf.kaufpreisMaxDcf);
  close(b.wert, f.mid * 0.5 + c.mid * 0.5); // Vergleich fehlt → 40/40 normiert auf 50/50
  const d2 = structuredClone(d);
  d2.pricing.kaufpreis = b.wert;
  close(b.irrBeiWert, analyze(d2).cf.irr);
});

test("Ohne Kaufpreis keine Rendite und kein Potenzialfaktor", () => {
  const d = sampleDeal();
  d.pricing.kaufpreis = 0;
  const a = analyze(d);
  assert.ok(Number.isNaN(a.cf.irr));
  assert.ok(Number.isNaN(a.cf.irrLevered));
  assert.equal(a.p.faktorPotenzial, 0);
});
