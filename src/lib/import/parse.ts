// Robustes Parsen deutscher/englischer Zahlen und Datumsangaben.

export function parseNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  let mult = 1;
  if (/\b(mio|millionen|mill\.?)\b/i.test(s)) mult = 1e6;
  else if (/\b(tsd|tausend|t€|teur)\b/i.test(s)) mult = 1e3;
  else if (/\b(mrd|milliarden)\b/i.test(s)) mult = 1e9;
  const neg = /^\s*-|\(\s*[\d.,]+\s*\)/.test(s);
  // nur den ersten Zahlenblock nehmen (z. B. "18,5 Mio. €" → "18,5")
  const block = /\d[\d.,\s]*\d|\d/.exec(s.replace(/(\d)\s+(?=\d{3}\b)/g, "$1"));
  s = block ? block[0].replace(/\s/g, "") : "";
  s = s.replace(/[^\d.,]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // beide vorhanden: der hintere ist der Dezimaltrenner
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    // "1,234,567" (englische Tausender) vs. "12,5" (deutsches Dezimal)
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0] !== "0" && parts[0] !== "")) s = s.replace(/,/g, "");
    else s = s.replace(",", ".");
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    // "1.234.567" oder "12.500" → Tausendertrenner; "12.5" → Dezimal
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0] !== "0" && parts[0] !== "")) s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return (neg ? -n : n) * mult;
}

/** Datum → ISO yyyy-mm-dd. Akzeptiert 31.12.2030, 2030-12-31, 12/2030, 12.2030, 2030, Excel-Seriennummer. */
export function parseDate(v: unknown, { endOfPeriod = true } = {}): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) {
      // Excel-Serienzahl (1900-System)
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    if (v >= 1990 && v <= 2100) return endOfPeriod ? iso(v, 12, 31) : iso(v, 1, 1);
    return null;
  }
  const s = String(v).trim();
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /(\d{1,2})[./](\d{1,2})[./](\d{2,4})/.exec(s);
  if (m) {
    let y = +m[3];
    if (y < 100) y += y > 60 ? 1900 : 2000;
    return iso(y, +m[2], +m[1]);
  }
  m = /(\d{1,2})[./](\d{4})/.exec(s);
  if (m) {
    const y = +m[2];
    const mo = +m[1];
    return endOfPeriod ? iso(y, mo, lastDay(y, mo)) : iso(y, mo, 1);
  }
  m = /\b(19\d{2}|20\d{2}|21\d{2})\b/.exec(s);
  if (m) return endOfPeriod ? iso(+m[1], 12, 31) : iso(+m[1], 1, 1);
  return null;
}

function lastDay(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function iso(y: number, m: number, d: number): string | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1800 && y < 2200)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function normalizeNutzung(raw: string, fallback = "Büro"): string {
  const s = (raw || "").toLowerCase();
  if (!s.trim()) return fallback;
  if (/^\s*sonstig/.test(s)) return "Sonstiges";
  if (/stellpl|tiefgarage|\btg\b|garage|parking|carport|pkw|außenstell|duplex/.test(s)) return "Stellplätze";
  if (/gastro|restaurant|caf[eé]|\bbar\b|imbiss|bistro|kantine|bäcker/.test(s)) return "Gastronomie";
  if (/wohn|whg|apartment|residential|\bwe\b|appartement/.test(s)) return "Wohnen";
  if (/praxis|arzt|ärzt|medizin|physio|klinik|zahn|therap|pflege/.test(s)) return "Praxis";
  if (/hotel|boarding/.test(s)) return "Hotel";
  if (/lager|logistik|halle|storage|warehouse|produktion|werkstatt|archiv/.test(s)) return "Lager/Logistik";
  if (/laden|einzelhandel|retail|shop|verkauf|handel|markt|filiale|apotheke|store|bank/.test(s)) return "Einzelhandel";
  if (/büro|buero|office|verwaltung|kanzlei|agentur/.test(s)) return "Büro";
  return "Sonstiges";
}

export const LEER_RE = /\b(leer|leerstand|leerstehend|vacant|vacancy|frei|verfügbar|unvermietet|n\.?\s?v\.?|nicht vermietet)\b/i;
export const SUMME_RE = /^\s*(summe|gesamt|total|zwischensumme|subtotal|σ|insgesamt)\b/i;
