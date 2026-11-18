import type { Deal, NutzungAnnahmen, Unit, Objekt } from "./types";

export const NUTZUNGEN = [
  "Büro",
  "Einzelhandel",
  "Gastronomie",
  "Wohnen",
  "Praxis",
  "Lager/Logistik",
  "Hotel",
  "Stellplätze",
  "Sonstiges",
] as const;

export const NUTZUNG_DEFAULTS: Record<string, NutzungAnnahmen> = {
  Büro: { marktmiete: 18, umbauLeer: 500, umbauNeu: 250, leerstandMonate: 9, mietfreiMonate: 4, maklerMonate: 3, verlaengerung: 0.6, neueLaufzeit: 5, leerstandNk: 3.5 },
  Einzelhandel: { marktmiete: 15, umbauLeer: 400, umbauNeu: 150, leerstandMonate: 9, mietfreiMonate: 3, maklerMonate: 3, verlaengerung: 0.65, neueLaufzeit: 10, leerstandNk: 3 },
  Gastronomie: { marktmiete: 14, umbauLeer: 600, umbauNeu: 200, leerstandMonate: 9, mietfreiMonate: 3, maklerMonate: 3, verlaengerung: 0.5, neueLaufzeit: 10, leerstandNk: 3 },
  Wohnen: { marktmiete: 12, umbauLeer: 800, umbauNeu: 300, leerstandMonate: 3, mietfreiMonate: 0, maklerMonate: 2, verlaengerung: 0.7, neueLaufzeit: 5, leerstandNk: 2.5 },
  Praxis: { marktmiete: 16, umbauLeer: 600, umbauNeu: 250, leerstandMonate: 9, mietfreiMonate: 3, maklerMonate: 3, verlaengerung: 0.7, neueLaufzeit: 10, leerstandNk: 3.5 },
  "Lager/Logistik": { marktmiete: 6.5, umbauLeer: 100, umbauNeu: 30, leerstandMonate: 6, mietfreiMonate: 2, maklerMonate: 3, verlaengerung: 0.7, neueLaufzeit: 5, leerstandNk: 1 },
  Hotel: { marktmiete: 14, umbauLeer: 800, umbauNeu: 300, leerstandMonate: 12, mietfreiMonate: 6, maklerMonate: 3, verlaengerung: 0.7, neueLaufzeit: 20, leerstandNk: 3 },
  Stellplätze: { marktmiete: 100, umbauLeer: 0, umbauNeu: 0, leerstandMonate: 3, mietfreiMonate: 0, maklerMonate: 0, verlaengerung: 0.8, neueLaufzeit: 5, leerstandNk: 0 },
  Sonstiges: { marktmiete: 10, umbauLeer: 300, umbauNeu: 100, leerstandMonate: 9, mietfreiMonate: 2, maklerMonate: 3, verlaengerung: 0.6, neueLaufzeit: 5, leerstandNk: 2 },
};

/** Grunderwerbsteuer je Bundesland (Stand 2026). */
export const GREST: Record<string, number> = {
  "Baden-Württemberg": 0.05,
  Bayern: 0.035,
  Berlin: 0.06,
  Brandenburg: 0.065,
  Bremen: 0.055,
  Hamburg: 0.055,
  Hessen: 0.06,
  "Mecklenburg-Vorpommern": 0.06,
  Niedersachsen: 0.05,
  "Nordrhein-Westfalen": 0.065,
  "Rheinland-Pfalz": 0.05,
  Saarland: 0.065,
  Sachsen: 0.055,
  "Sachsen-Anhalt": 0.05,
  "Schleswig-Holstein": 0.065,
  Thüringen: 0.05,
};

export const OBJEKTARTEN = [
  "Büro",
  "Wohn- und Geschäftshaus",
  "Mehrfamilienhaus",
  "Einzelhandel",
  "Fachmarktzentrum",
  "Logistik",
  "Hotel",
  "Mixed Use",
  "Gesundheit",
  "Sonstiges",
];

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function emptyUnit(p: Partial<Unit> = {}): Unit {
  return {
    id: uid(),
    nutzung: "Büro",
    mieter: "",
    geschoss: "",
    flaeche: 0,
    einheit: "m2",
    leer: false,
    mieteMonat: 0,
    mietbeginn: "",
    mietende: "",
    option: "",
    indexierung: null,
    marktmiete: null,
    notiz: "",
    ...p,
  };
}

export function emptyObjekt(): Objekt {
  return {
    name: "Neues Objekt",
    adresse: "",
    plz: "",
    ort: "",
    bundesland: "Hessen",
    objektart: "Büro",
    baujahr: "",
    modernisierung: "",
    grundstueck: 0,
    bgf: 0,
    geschosse: "",
    stellplaetze: 0,
    eigentuemer: "",
    verkaeufer: "",
    erbbaurecht: false,
    denkmal: false,
    energieklasse: "",
    lage: "",
    beschreibung: "",
    angabeFlaeche: null,
    angabeJahresmiete: null,
    angabeKaufpreis: null,
  };
}

function cloneNutzungen(): Record<string, NutzungAnnahmen> {
  return JSON.parse(JSON.stringify(NUTZUNG_DEFAULTS));
}

export function emptyDeal(): Deal {
  const now = new Date().toISOString();
  return {
    id: uid(),
    version: 3,
    created: now,
    updated: now,
    stichtag: today(),
    objekt: emptyObjekt(),
    units: [],
    nutzungen: cloneNutzungen(),
    pricing: { kaufpreis: 0, basis: "ist", grest: 0.06, notar: 0.015, makler: 0, sonstigeNk: 0, capexSofort: 0 },
    kosten: { verwaltung: 0.02, mietausfall: 0.02, nichtUmlagefaehig: 0.03, instandhaltung: 12 },
    dcf: {
      haltedauer: 10,
      mietwachstum: 0.015,
      indexierung: 0.02,
      kostensteigerung: 0.02,
      exitFaktor: 18,
      verkaufskosten: 0.015,
      diskontsatz: 0.065,
      unbefristetJahre: 0,
    },
    finanzierung: { aktiv: true, ltv: 0.55, zins: 0.04, tilgung: 0.02, gebuehren: 0.005 },
    bov: {
      vergleiche: [],
      gewichtFaktor: 0.4,
      gewichtDcf: 0.4,
      gewichtVergleich: 0.2,
      spanne: 0.05,
      faktorSpanne: 1,
      zielfaktor: 20,
      staerken: "",
      schwaechen: "",
      chancen: "",
      risiken: "",
      zielgruppe: "",
      strategie: "",
      verfasser: "",
    },
  };
}

/** Musterobjekt, damit das Tool beim ersten Öffnen etwas zeigt. */
export function sampleDeal(): Deal {
  const d = emptyDeal();
  d.stichtag = "2026-12-31";
  d.objekt = {
    ...d.objekt,
    name: "Musterobjekt Mainzer Landstraße",
    adresse: "Mainzer Landstraße 100",
    plz: "60327",
    ort: "Frankfurt am Main",
    bundesland: "Hessen",
    objektart: "Wohn- und Geschäftshaus",
    baujahr: "1994",
    modernisierung: "2016",
    grundstueck: 1450,
    bgf: 6200,
    geschosse: "EG + 5 OG",
    stellplaetze: 24,
    lage: "Innenstadtnahe Bürolage, 5 Gehminuten zum Hauptbahnhof",
    beschreibung: "Gemischt genutztes Büro- und Geschäftshaus mit Einzelhandel im EG und Tiefgarage.",
    angabeFlaeche: 4900,
    angabeJahresmiete: null,
  };
  d.units = [
    emptyUnit({ nutzung: "Einzelhandel", mieter: "Drogeriemarkt GmbH", geschoss: "EG", flaeche: 650, mieteMonat: 650 * 19.5, mietbeginn: "2019-04-01", mietende: "2031-03-31", indexierung: 0.02 }),
    emptyUnit({ nutzung: "Gastronomie", mieter: "Café am Ring", geschoss: "EG", flaeche: 180, mieteMonat: 180 * 16, mietbeginn: "2021-01-01", mietende: "2028-12-31" }),
    emptyUnit({ nutzung: "Büro", mieter: "Steuerkanzlei Weber & Partner", geschoss: "1. OG", flaeche: 820, mieteMonat: 820 * 17.2, mietbeginn: "2018-07-01", mietende: "2028-06-30", option: "2027-06-30" }),
    emptyUnit({ nutzung: "Büro", mieter: "IT Consult AG", geschoss: "2. OG", flaeche: 820, mieteMonat: 820 * 18.5, mietbeginn: "2022-01-01", mietende: "2032-12-31" }),
    emptyUnit({ nutzung: "Büro", mieter: "Leerstand", geschoss: "3. OG", flaeche: 820, leer: true, mieteMonat: 0 }),
    emptyUnit({ nutzung: "Büro", mieter: "Versicherungsagentur Nord", geschoss: "4. OG", flaeche: 410, mieteMonat: 410 * 16.8, mietbeginn: "2020-10-01", mietende: "2027-09-30" }),
    emptyUnit({ nutzung: "Büro", mieter: "Leerstand", geschoss: "4. OG", flaeche: 410, leer: true, mieteMonat: 0 }),
    emptyUnit({ nutzung: "Wohnen", mieter: "Wohnungen (6 WE)", geschoss: "5. OG", flaeche: 590, mieteMonat: 590 * 13.4, mietende: "" }),
    emptyUnit({ nutzung: "Stellplätze", mieter: "TG-Stellplätze", geschoss: "UG", flaeche: 24, einheit: "stk", mieteMonat: 20 * 110, mietende: "" , notiz: "20 von 24 vermietet" }),
  ];
  d.pricing.kaufpreis = 19_500_000;
  return d;
}
