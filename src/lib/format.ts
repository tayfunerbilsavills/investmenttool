const nf = new Map<string, Intl.NumberFormat>();
function n(min: number, max = min): Intl.NumberFormat {
  const k = `${min}-${max}`;
  let f = nf.get(k);
  if (!f) {
    f = new Intl.NumberFormat("de-DE", { minimumFractionDigits: min, maximumFractionDigits: max });
    nf.set(k, f);
  }
  return f;
}

const bad = (v: number) => v == null || !Number.isFinite(v);

export const fmtNum = (v: number, d = 0) => (bad(v) ? "–" : n(d).format(v));
export const fmtEur = (v: number, d = 0) => (bad(v) ? "–" : `${n(d).format(v)} €`);
export const fmtPct = (v: number, d = 2) => (bad(v) ? "–" : `${n(d).format(v * 100)} %`);
export const fmtX = (v: number, d = 2) => (bad(v) ? "–" : `${n(d).format(v)}x`);
export const fmtYrs = (v: number, d = 2) => (bad(v) ? "–" : `${n(d).format(v)} J.`);
export const fmtM2 = (v: number, d = 0) => (bad(v) ? "–" : `${n(d).format(v)} m²`);

export function fmtMio(v: number, d = 2) {
  if (bad(v)) return "–";
  if (Math.abs(v) >= 1e6) return `${n(d).format(v / 1e6)} Mio. €`;
  if (Math.abs(v) >= 1e3) return `${n(0).format(v / 1e3)} T€`;
  return fmtEur(v);
}

export function fmtDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export type FmtKind = "eur" | "pct" | "x" | "num" | "yrs" | "eurqm" | "mon" | "m2";

export function fmtBy(kind: FmtKind, v: number): string {
  switch (kind) {
    case "eur":
      return fmtEur(v);
    case "pct":
      return fmtPct(v);
    case "x":
      return fmtX(v);
    case "yrs":
      return fmtYrs(v, 0);
    case "eurqm":
      return fmtEur(v, 2);
    case "mon":
      return `${fmtNum(v, 1)} Mon.`;
    case "m2":
      return fmtM2(v);
    default:
      return fmtNum(v, 2);
  }
}
