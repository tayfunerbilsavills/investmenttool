// Regelbasierte Erkennung von Objektdaten in Fließtext (Exposé, E-Mail, Teaser).
import { GREST } from "../model/defaults";
import { parseNumber } from "./parse";

export interface Facts {
  name?: string;
  adresse?: string;
  plz?: string;
  ort?: string;
  bundesland?: string;
  baujahr?: string;
  modernisierung?: string;
  grundstueck?: number;
  bgf?: number;
  mietflaeche?: number;
  stellplaetze?: number;
  kaufpreis?: number;
  faktor?: number;
  jahresmiete?: number;
  walt?: number;
  leerstand?: number;
  energieklasse?: string;
  erbbaurecht?: boolean;
  denkmal?: boolean;
}

const NUM = "([\\d][\\d.,]*\\s*(?:mio\\.?|millionen|tsd\\.?|t€|teur)?)";

function find(text: string, re: RegExp, group = 1): string | undefined {
  const m = re.exec(text);
  return m?.[group];
}

function num(text: string, label: string, unit = "", window = 60): number | undefined {
  const re = new RegExp(`(?:${label})[^\\d\\n]{0,${window}}${NUM}\\s*${unit}`, "i");
  const v = find(text, re);
  const n = v != null ? parseNumber(v) : null;
  return n != null && n > 0 ? n : undefined;
}

export function extractFacts(text: string): Facts {
  const t = text.replace(/ /g, " ");
  const f: Facts = {};

  f.kaufpreis = num(t, "kaufpreis(?:vorstellung|forderung|angebot)?|angebotspreis|asking price|preisvorstellung", "(?:€|eur|euro)?");
  if (f.kaufpreis && f.kaufpreis < 10_000) f.kaufpreis = undefined;
  const fak = find(t, /(?:faktor|vervielfältiger|multiplikator|multiple)[^\d\n]{0,25}(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:-?fach|x)?/i);
  if (fak) f.faktor = parseNumber(fak) ?? undefined;
  f.jahresmiete = num(
    t,
    "jahres(?:netto)?(?:kalt)?miete|jnkm|ist-?miete(?:\\s*p\\.?\\s?a\\.?)?|mieteinnahmen(?:\\s*p\\.?\\s?a\\.?)?|nettomiete\\s*p\\.?\\s?a\\.?|gross rental income|annual rent",
    "(?:€|eur|euro)?",
  );
  if (f.jahresmiete && f.jahresmiete < 1000) f.jahresmiete = undefined;
  f.mietflaeche = num(t, "(?:gesamt)?mietfläche|vermietbare fläche|nutzfläche|gesamtfläche|lettable area|nla|mf-?g|wohn-?\\s*und\\s*nutzfläche", "(?:m²|qm|m2|sqm)");
  f.bgf = num(t, "bgf|bruttogrundfläche|bruttogeschossfläche", "(?:m²|qm|m2)");
  f.grundstueck = num(t, "grundstück(?:sfläche|sgröße)?|grundstücksgröße|plot", "(?:m²|qm|m2)");
  const st = find(t, /(\d{1,4})\s*(?:tg-?|tiefgaragen-?|pkw-?|außen-?)?stellpl/i);
  if (st) f.stellplaetze = parseInt(st, 10);
  const bj = find(t, /baujahr[^\d\n]{0,15}((?:18|19|20)\d{2})/i) ?? find(t, /(?:errichtet|erbaut|fertiggestellt)[^\d\n]{0,20}((?:18|19|20)\d{2})/i);
  if (bj) f.baujahr = bj;
  const mod = find(t, /(?:modernisiert|saniert|kernsaniert|refurbished|revitalisiert|modernisierung)[^\d\n]{0,25}((?:19|20)\d{2})/i);
  if (mod) f.modernisierung = mod;
  const walt = find(t, /walt[^\d\n]{0,20}(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:jahre|j\.|years)/i);
  if (walt) f.walt = parseNumber(walt) ?? undefined;
  const ls = find(t, /leerstand(?:squote)?[^\d\n]{0,20}(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i);
  if (ls) f.leerstand = (parseNumber(ls) ?? 0) / 100;
  const ek = find(t, /energie(?:effizienz)?klasse[^A-H\n]{0,10}\b([A-H]\+{0,2})\b/i);
  if (ek) f.energieklasse = ek.toUpperCase();
  if (/erbbaurecht|erbpacht/i.test(t)) f.erbbaurecht = true;
  if (/denkmalschutz|denkmalgeschützt|baudenkmal/i.test(t)) f.denkmal = true;

  // Adresse: Straße Hausnummer, PLZ Ort
  const addr = /([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\- ]{2,40}?(?:straße|strasse|str\.|weg|allee|platz|ring|gasse|damm|ufer|chaussee|markt|landstraße|steig|pfad))\s+(\d{1,4}\s?[a-zA-Z]?(?:\s?[-–]\s?\d{1,4}\s?[a-zA-Z]?)?)/.exec(t);
  if (addr) f.adresse = `${addr[1].trim()} ${addr[2].replace(/\s+/g, "")}`;
  const plz = /\b(\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]+(?:\s(?:am|an der|im|in|ob der|\(Oder\)|\/)\s?[A-ZÄÖÜ][A-Za-zäöüß\-]+)?)/.exec(t);
  if (plz) {
    f.plz = plz[1];
    f.ort = plz[2].trim();
  }
  for (const bl of Object.keys(GREST)) if (new RegExp(`\\b${bl}\\b`, "i").test(t)) f.bundesland = bl;
  if (!f.bundesland && f.plz) f.bundesland = bundeslandFromPlz(f.plz);
  return f;
}

/** Grobe Zuordnung PLZ → Bundesland (Leitregionen). */
export function bundeslandFromPlz(plz: string): string | undefined {
  const p = parseInt(plz, 10);
  if (!Number.isFinite(p)) return undefined;
  const r: [number, number, string][] = [
    [1000, 1999, "Sachsen"], [2000, 2999, "Sachsen"], [3000, 3999, "Brandenburg"], [4000, 4999, "Sachsen"],
    [6000, 6999, "Sachsen-Anhalt"], [7000, 7999, "Thüringen"], [8000, 9999, "Sachsen"], [10000, 14199, "Berlin"],
    [14400, 16999, "Brandenburg"], [17000, 19999, "Mecklenburg-Vorpommern"], [20000, 21999, "Hamburg"],
    [22000, 22999, "Hamburg"], [23000, 25999, "Schleswig-Holstein"], [26000, 27999, "Niedersachsen"],
    [28000, 28779, "Bremen"], [28780, 29999, "Niedersachsen"], [30000, 31999, "Niedersachsen"], [32000, 33999, "Nordrhein-Westfalen"],
    [34000, 36999, "Hessen"], [37000, 38999, "Niedersachsen"], [39000, 39999, "Sachsen-Anhalt"], [40000, 48999, "Nordrhein-Westfalen"],
    [49000, 49999, "Niedersachsen"], [50000, 53999, "Nordrhein-Westfalen"], [54000, 56999, "Rheinland-Pfalz"],
    [57000, 59999, "Nordrhein-Westfalen"], [60000, 65999, "Hessen"], [66000, 66999, "Saarland"], [67000, 67999, "Rheinland-Pfalz"],
    [68000, 69999, "Baden-Württemberg"], [70000, 79999, "Baden-Württemberg"], [80000, 87999, "Bayern"], [88000, 89999, "Baden-Württemberg"],
    [90000, 97999, "Bayern"], [98000, 99999, "Thüringen"],
  ];
  return r.find(([a, b]) => p >= a && p <= b)?.[2];
}
