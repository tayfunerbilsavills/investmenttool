// Führt regelbasierte Erkennung und KI-Ergebnis zu einem prüfbaren Vorschlag zusammen.
import type { Deal, Unit } from "../model/types";
import { emptyUnit, GREST } from "../model/defaults";
import type { AiExtraction } from "@/app/api/extract/route";
import { extractFacts, type Facts } from "./facts";
import { parseRentRoll, rowsFromText, type RentRollResult } from "./rentroll";
import type { Extracted } from "./extractFile";
import { normalizeNutzung, parseDate } from "./parse";

export type Source = "Tabelle" | "Text" | "KI";

export interface FieldProposal {
  key: string;
  label: string;
  value: string | number | boolean;
  source: Source;
  alt?: { value: string | number | boolean; source: Source };
  apply: boolean;
}

export interface UnitsProposal {
  source: Source;
  label: string;
  units: Unit[];
  detail: string;
}

export interface Proposal {
  fields: FieldProposal[];
  unitOptions: UnitsProposal[];
  hinweise: string[];
  stichtag?: string;
}

const LABELS: Record<string, string> = {
  name: "Objektname",
  adresse: "Adresse",
  plz: "PLZ",
  ort: "Ort",
  bundesland: "Bundesland",
  objektart: "Objektart",
  baujahr: "Baujahr",
  modernisierung: "Modernisierung",
  grundstueck: "Grundstück m²",
  bgf: "BGF m²",
  geschosse: "Geschosse",
  stellplaetze: "Stellplätze",
  eigentuemer: "Eigentümer",
  verkaeufer: "Verkäufer",
  erbbaurecht: "Erbbaurecht",
  denkmal: "Denkmalschutz",
  energieklasse: "Energieklasse",
  lage: "Lage",
  beschreibung: "Beschreibung",
  angabeFlaeche: "Mietfläche lt. Unterlagen",
  angabeJahresmiete: "Jahresmiete lt. Unterlagen",
  kaufpreis: "Kaufpreis / Preisvorstellung",
};

export function bestRentRoll(files: Extracted[]): (RentRollResult & { file: string }) | null {
  let best: (RentRollResult & { file: string }) | null = null;
  const score = (r: RentRollResult) => r.units.length * 10 + (r.units.filter((u) => u.mieteMonat > 0).length) + (r.sumRow ? 5 : 0);
  for (const f of files) {
    const candidates: { name: string; rows: RentRollResult | null }[] = [
      ...f.tables.map((t) => ({ name: t.name, rows: parseRentRoll(t.rows) })),
      { name: "Text", rows: f.text ? parseRentRoll(rowsFromText(f.text)) : null },
    ];
    for (const c of candidates) {
      if (!c.rows) continue;
      if (!best || score(c.rows) > score(best)) best = { ...c.rows, sheet: c.name, file: f.fileName };
    }
  }
  return best;
}

export function unitsFromAi(ai: AiExtraction): Unit[] {
  return ai.einheiten.map((e) => {
    const stk = e.einheit === "stk" || e.nutzung === "Stellplätze";
    const monat = e.leer ? 0 : (e.miete_monat ?? (e.miete_jahr != null ? e.miete_jahr / 12 : e.miete_qm != null ? e.miete_qm * e.flaeche : 0));
    return emptyUnit({
      nutzung: normalizeNutzung(e.nutzung, "Sonstiges") === "Sonstiges" ? e.nutzung : normalizeNutzung(e.nutzung),
      mieter: e.leer ? "Leerstand" : e.mieter,
      geschoss: e.geschoss,
      flaeche: e.flaeche,
      einheit: stk ? "stk" : "m2",
      leer: e.leer,
      mieteMonat: Math.round(monat * 100) / 100,
      mietbeginn: (e.mietbeginn && parseDate(e.mietbeginn, { endOfPeriod: false })) || "",
      mietende: e.leer ? "" : (e.mietende && parseDate(e.mietende)) || "",
      option: (e.option && parseDate(e.option)) || "",
      indexierung: e.indexierung_pa != null && e.indexierung_pa > 0 && e.indexierung_pa < 0.2 ? e.indexierung_pa : null,
      notiz: e.notiz,
    });
  });
}

function differs(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) > Math.max(1, Math.abs(b) * 0.01);
  return String(a).trim().toLowerCase() !== String(b).trim().toLowerCase();
}

export function buildProposal(files: Extracted[], ai: AiExtraction | null): Proposal {
  const allText = files.map((f) => f.text).join("\n\n");
  const facts: Facts = extractFacts(allText);
  const fields: FieldProposal[] = [];
  const push = (key: string, aiVal: unknown, ruleVal: unknown, ruleSource: Source = "Text") => {
    const hasAi = aiVal != null && aiVal !== "";
    const hasRule = ruleVal != null && ruleVal !== "";
    if (!hasAi && !hasRule) return;
    const value = (hasAi ? aiVal : ruleVal) as string | number | boolean;
    const fp: FieldProposal = { key, label: LABELS[key] ?? key, value, source: hasAi ? "KI" : ruleSource, apply: true };
    if (hasAi && hasRule && differs(aiVal, ruleVal)) fp.alt = { value: ruleVal as string | number | boolean, source: ruleSource };
    fields.push(fp);
  };
  const o = ai?.objekt;
  const g = ai?.angaben;
  push("name", o?.name, undefined);
  push("adresse", o?.adresse, facts.adresse);
  push("plz", o?.plz, facts.plz);
  push("ort", o?.ort, facts.ort);
  push("bundesland", o?.bundesland, facts.bundesland);
  push("objektart", o?.objektart, undefined);
  push("baujahr", o?.baujahr, facts.baujahr);
  push("modernisierung", o?.modernisierung, facts.modernisierung);
  push("grundstueck", o?.grundstueck_m2, facts.grundstueck);
  push("bgf", o?.bgf_m2, facts.bgf);
  push("geschosse", o?.geschosse, undefined);
  push("stellplaetze", o?.stellplaetze, facts.stellplaetze);
  push("eigentuemer", o?.eigentuemer, undefined);
  push("verkaeufer", o?.verkaeufer, undefined);
  push("erbbaurecht", o?.erbbaurecht, facts.erbbaurecht);
  push("denkmal", o?.denkmal, facts.denkmal);
  push("energieklasse", o?.energieklasse, facts.energieklasse);
  push("lage", o?.lage, undefined);
  push("beschreibung", o?.beschreibung, undefined);
  push("angabeFlaeche", g?.mietflaeche_gesamt_m2, facts.mietflaeche);
  push("angabeJahresmiete", g?.jahresnettokaltmiete_gesamt, facts.jahresmiete);
  push("kaufpreis", g?.kaufpreis, facts.kaufpreis);

  const unitOptions: UnitsProposal[] = [];
  const rr = bestRentRoll(files);
  if (rr && rr.units.length) {
    unitOptions.push({
      source: "Tabelle",
      label: `Tabelle „${rr.sheet}" in ${rr.file}`,
      units: rr.units,
      detail: `${rr.units.length} Einheiten · ${rr.mieteInterpretation}${rr.skipped ? ` · ${rr.skipped} Zeilen übersprungen` : ""}${
        rr.sumRow?.flaeche ? ` · Summenzeile ${Math.round(rr.sumRow.flaeche).toLocaleString("de-DE")} m²` : ""
      }`,
    });
  }
  if (ai && ai.einheiten.length) {
    const u = unitsFromAi(ai);
    unitOptions.push({ source: "KI", label: "KI-Auswertung", units: u, detail: `${u.length} Einheiten aus dem Dokument gelesen` });
  }
  // Bei Tabelle mit Summenzeile: Summe als Abgleichswert übernehmen, falls nichts anderes da ist
  if (rr?.sumRow?.flaeche && !fields.some((f) => f.key === "angabeFlaeche"))
    fields.push({ key: "angabeFlaeche", label: LABELS.angabeFlaeche, value: rr.sumRow.flaeche, source: "Tabelle", apply: true });
  if (rr?.sumRow?.miete && !fields.some((f) => f.key === "angabeJahresmiete"))
    fields.push({ key: "angabeJahresmiete", label: LABELS.angabeJahresmiete, value: Math.round(rr.sumRow.miete * 12 * 100) / 100, source: "Tabelle", apply: true });

  // Tabelle zuerst, wenn sie mindestens so viele Einheiten hat wie die KI (exakte Zahlen)
  unitOptions.sort((a, b) => (a.source === "Tabelle" && a.units.length >= (b.units.length || 0) * 0.8 ? -1 : 1));

  const hinweise = [...(rr?.warnings ?? []).map((w) => `Tabelle: ${w}`), ...(ai?.hinweise ?? [])];
  const tab = unitOptions.find((o) => o.source === "Tabelle");
  const kiOpt = unitOptions.find((o) => o.source === "KI");
  if (tab && kiOpt) {
    const sumOf = (u: Unit[]) => u.filter((x) => !x.leer).reduce((a, x) => a + x.mieteMonat * 12, 0);
    const a = sumOf(tab.units);
    const b = sumOf(kiOpt.units);
    if (a > 0 && b > 0 && Math.abs(a / b - 1) > 0.05)
      hinweise.push(`Tabelle und KI weichen bei der Jahresmiete ab: ${Math.round(a).toLocaleString("de-DE")} € vs. ${Math.round(b).toLocaleString("de-DE")} € – bitte Quelle prüfen`);
  }
  if (facts.faktor) hinweise.push(`Faktor lt. Unterlagen: ${facts.faktor.toLocaleString("de-DE")}`);
  if (facts.walt) hinweise.push(`WALT lt. Unterlagen: ${facts.walt.toLocaleString("de-DE")} Jahre (wird im Tool selbst berechnet)`);
  if (g?.walt_jahre && !facts.walt) hinweise.push(`WALT lt. Unterlagen: ${g.walt_jahre.toLocaleString("de-DE")} Jahre (wird im Tool selbst berechnet)`);

  if (g?.stichtag_mieterliste) hinweise.push(`Stichtag der Mieterliste: ${g.stichtag_mieterliste.split("-").reverse().join(".")} — Bewertungsstichtag ggf. anpassen`);
  return { fields, unitOptions, hinweise, stichtag: g?.stichtag_mieterliste ?? undefined };
}

export function applyProposal(deal: Deal, p: Proposal, unitChoice: number | null, mode: "replace" | "append"): Deal {
  const d = structuredClone(deal);
  for (const f of p.fields) {
    if (!f.apply) continue;
    if (f.key === "kaufpreis") {
      if (typeof f.value === "number" && f.value > 0) {
        d.pricing.kaufpreis = f.value;
        d.objekt.angabeKaufpreis = f.value;
      }
      continue;
    }
    (d.objekt as unknown as Record<string, unknown>)[f.key] = f.value;
  }
  if (d.objekt.bundesland && GREST[d.objekt.bundesland] != null) d.pricing.grest = GREST[d.objekt.bundesland];
  if (unitChoice != null && p.unitOptions[unitChoice]) {
    const units = p.unitOptions[unitChoice].units.map((u) => ({ ...u }));
    d.units = mode === "replace" ? units : [...d.units, ...units];
    // neue Nutzungsarten mit Standardannahmen versorgen
    for (const u of units) if (!d.nutzungen[u.nutzung]) d.nutzungen[u.nutzung] = { ...d.nutzungen["Sonstiges"] };
  }
  if (d.objekt.name === "Neues Objekt" && d.objekt.adresse) d.objekt.name = [d.objekt.adresse, d.objekt.ort].filter(Boolean).join(", ");
  d.updated = new Date().toISOString();
  return d;
}
