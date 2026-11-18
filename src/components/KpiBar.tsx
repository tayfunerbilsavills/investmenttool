"use client";
import type { Analysis } from "@/lib/model/calc";
import type { Deal } from "@/lib/model/types";
import { fmtMio, fmtPct, fmtX, fmtYrs, fmtEur } from "@/lib/format";

export function KpiBar({ a, deal }: { a: Analysis; deal: Deal }) {
  const items: [string, string, string?][] = [
    ["Kaufpreis", fmtMio(a.p.kaufpreis), `${fmtEur(a.p.preisQm)}/m²`],
    ["Faktor Ist", fmtX(a.p.faktorIst), `Potenzial ${fmtX(a.p.faktorPotenzial)}`],
    ["BAR / NIY", fmtPct(a.p.bar), `NIY ${fmtPct(a.p.niy)}`],
    ["Ist-Miete p.a.", fmtMio(a.s.istMieteJahr), `Potenzial ${fmtMio(a.s.potenzialJahr)}`],
    ["WALT", fmtYrs(a.s.walt), `WALB ${fmtYrs(a.s.walb)}`],
    ["Leerstand", fmtPct(a.s.leerstandsquoteFlaeche, 1), `${Math.round(a.s.flaecheLeerM2).toLocaleString("de-DE")} m²`],
    ["IRR", fmtPct(a.cf.irr), deal.finanzierung.aktiv ? `EK ${fmtPct(a.cf.irrLevered)}` : "ungehebelt"],
  ];
  return (
    <div className="kpibar">
      {items.map(([l, v, s]) => (
        <div key={l} className="kpi">
          <span className="kpi-l">{l}</span>
          <span className="kpi-v">{v}</span>
          {s && <span className="kpi-s">{s}</span>}
        </div>
      ))}
    </div>
  );
}
