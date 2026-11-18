// Datenmodell des Investment Tools.
// Alle Geldbeträge in EUR, Mieten als Monatswerte (netto kalt), Flächen in m²
// (bei Stellplätzen: Stück). Prozentwerte als Dezimalzahl (0,05 = 5 %).

export type Einheit = "m2" | "stk";

export interface Unit {
  id: string;
  nutzung: string;
  mieter: string;
  geschoss: string;
  flaeche: number; // m² bzw. Stück
  einheit: Einheit;
  leer: boolean;
  mieteMonat: number; // Ist-Nettokaltmiete EUR / Monat für die gesamte Einheit
  mietbeginn: string; // ISO yyyy-mm-dd oder ""
  mietende: string; // ISO yyyy-mm-dd oder "" (= unbefristet)
  option: string; // Sonderkündigungsrecht / Break, ISO oder ""
  indexierung: number | null; // p.a., null = Vorgabe der Annahmen
  marktmiete: number | null; // EUR/m²/Monat (bzw. EUR/Stk), null = Vorgabe der Nutzungsart
  notiz: string;
}

export interface NutzungAnnahmen {
  marktmiete: number; // EUR/m²/Monat bzw. EUR/Stk/Monat
  umbauLeer: number; // EUR/m² Ausbau für heute leere Flächen (einmalig, t0)
  umbauNeu: number; // EUR/m² Ausbau bei Neuvermietung nach Auslauf
  leerstandMonate: number; // Monate bis zur Vermietung
  mietfreiMonate: number; // Incentive bei Neuvermietung
  maklerMonate: number; // Courtage in Monatsmieten
  verlaengerung: number; // Wahrscheinlichkeit Verlängerung bei Auslauf (0..1)
  neueLaufzeit: number; // Jahre für Neu-/Anschlussvermietung
  leerstandNk: number; // nicht umlegbare Betriebskosten EUR/m²/Monat während Leerstand
}

export interface Objekt {
  name: string;
  adresse: string;
  plz: string;
  ort: string;
  bundesland: string;
  objektart: string;
  baujahr: string;
  modernisierung: string;
  grundstueck: number;
  bgf: number;
  geschosse: string;
  stellplaetze: number;
  eigentuemer: string;
  verkaeufer: string;
  erbbaurecht: boolean;
  denkmal: boolean;
  energieklasse: string;
  lage: string;
  beschreibung: string;
  // Angaben aus Unterlagen (zum Abgleich mit der Mieterliste)
  angabeFlaeche: number | null;
  angabeJahresmiete: number | null;
  angabeKaufpreis: number | null;
}

export type Bewertungsbasis = "ist" | "potenzial";

export interface Pricing {
  kaufpreis: number; // netto, ohne Nebenkosten — die einzige gespeicherte Preisgröße
  basis: Bewertungsbasis; // worauf sich "Faktor" bezieht
  grest: number;
  notar: number;
  makler: number;
  sonstigeNk: number;
  capexSofort: number; // sonstige Sofortinvestitionen (EUR)
}

export interface Kosten {
  verwaltung: number; // % der Mieteinnahmen
  mietausfall: number; // % der Mieteinnahmen
  nichtUmlagefaehig: number; // % der Mieteinnahmen
  instandhaltung: number; // EUR/m²/Jahr
}

export interface Dcf {
  haltedauer: number; // Jahre
  mietwachstum: number; // Marktmietwachstum p.a.
  indexierung: number; // Vorgabe Indexierung Bestandsmieten p.a.
  kostensteigerung: number; // p.a.
  exitFaktor: number; // auf Jahresnettokaltmiete des Folgejahres
  verkaufskosten: number; // % vom Exit-Wert
  diskontsatz: number;
  unbefristetJahre: number; // Restlaufzeit für unbefristete Verträge im WALT
}

export interface Finanzierung {
  aktiv: boolean;
  ltv: number; // auf Kaufpreis netto
  zins: number;
  tilgung: number; // anfängliche Tilgung p.a.
  gebuehren: number; // % vom Darlehen
}

export interface Vergleich {
  id: string;
  name: string;
  ort: string;
  datum: string;
  flaeche: number;
  preisQm: number;
  faktor: number;
  quelle: string;
}

export interface Bov {
  vergleiche: Vergleich[];
  gewichtFaktor: number;
  gewichtDcf: number;
  gewichtVergleich: number;
  spanne: number; // ± um den Mittelwert
  faktorSpanne: number; // ± Faktor für Faktormethode
  zielfaktor: number; // Markt-Faktor auf Potenzialmiete
  staerken: string;
  schwaechen: string;
  chancen: string;
  risiken: string;
  zielgruppe: string;
  strategie: string;
  verfasser: string;
}

export interface Deal {
  id: string;
  version: 3;
  created: string;
  updated: string;
  stichtag: string;
  objekt: Objekt;
  units: Unit[];
  nutzungen: Record<string, NutzungAnnahmen>;
  pricing: Pricing;
  kosten: Kosten;
  dcf: Dcf;
  finanzierung: Finanzierung;
  bov: Bov;
}
