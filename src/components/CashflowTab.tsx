"use client";
import type { Deal } from "@/lib/model/types";
import type { Analysis, YearRow } from "@/lib/model/calc";
import { fmtEur, fmtPct, fmtX, fmtMio, fmtNum } from "@/lib/format";
import { Card, Field, Num, Stat, Toggle, Slider } from "./ui";

type Upd = (fn: (d: Deal) => void) => void;

export function CashflowTab({ deal, a, update }: { deal: Deal; a: Analysis; update: Upd }) {
  const { cf } = a;
  const dcf = deal.dcf;
  const fin = deal.finanzierung;
  const setD = <K extends keyof Deal["dcf"]>(k: K, v: number | null) => update((d) => void (d.dcf[k] = (v ?? 0) as Deal["dcf"][K]));
  const setF = <K extends keyof Deal["finanzierung"]>(k: K, v: Deal["finanzierung"][K]) => update((d) => void (d.finanzierung[k] = v));
  const exitYield = cf.exitWert > 0 ? cf.forwardMiete / cf.exitWert : 0;

  return (
    <div className="stack">
      <div className="stats-row">
        <Stat label="IRR ungehebelt" value={fmtPct(cf.irr)} tone={cf.irr >= dcf.diskontsatz ? "pos" : "neg"} big sub={`Ziel ${fmtPct(dcf.diskontsatz)}`} />
        <Stat label="IRR Eigenkapital" value={fin.aktiv ? fmtPct(cf.irrLevered) : "–"} tone="brass" big sub={fin.aktiv ? `EK ${fmtMio(cf.t0.eigenkapital)}` : "ohne Finanzierung"} />
        <Stat label="Equity Multiple" value={fmtX(cf.equityMultiple)} sub={`Gewinn ${fmtMio(cf.gewinnLevered)}`} />
        <Stat label="Kapitalwert (NPV)" value={fmtMio(cf.npv)} tone={cf.npv >= 0 ? "pos" : "neg"} sub={`@ ${fmtPct(dcf.diskontsatz)}`} />
        <Stat label="Max. Kaufpreis (DCF)" value={fmtMio(cf.kaufpreisMaxDcf)} sub={`Faktor ${fmtX(a.s.istMieteJahr ? cf.kaufpreisMaxDcf / a.s.istMieteJahr : 0)}`} />
        <Stat label="Exit-Wert" value={fmtMio(cf.exitWert)} sub={`Exit-Rendite ${fmtPct(exitYield)}`} />
        {fin.aktiv && <Stat label="Ø Cash-on-Cash" value={fmtPct(cf.avgCoc)} sub={`min. DSCR ${fmtX(cf.minDscr)}`} tone={cf.minDscr > 0 && cf.minDscr < 1.2 ? "neg" : undefined} />}
      </div>

      <div className="grid-3">
        <Card title="Annahmen DCF" kicker="Markt & Exit">
          <div className="sliders">
            <Slider label="Haltedauer" kind="yrs" dec={0} value={dcf.haltedauer} min={1} max={20} step={1} onChange={(v) => setD("haltedauer", Math.round(v))} />
            <Slider label="Exit-Faktor (Miete Folgejahr)" kind="x" value={dcf.exitFaktor} min={8} max={40} step={0.1} onChange={(v) => setD("exitFaktor", v)} accent hint={`Einstieg: Faktor Ist ${fmtX(a.p.faktorIst)} · Potenzial ${fmtX(a.p.faktorPotenzial)}`} />
            <Slider label="Diskontierungszins" kind="pct" value={dcf.diskontsatz} min={0.02} max={0.15} step={0.0005} onChange={(v) => setD("diskontsatz", v)} />
          </div>
          <div className="form-grid two">
            <Field label="Marktmietwachstum p.a.">
              <Num value={dcf.mietwachstum} kind="pct" onChange={(v) => setD("mietwachstum", v)} />
            </Field>
            <Field label="Indexierung Bestand p.a." hint="falls je Einheit nicht anders">
              <Num value={dcf.indexierung} kind="pct" onChange={(v) => setD("indexierung", v)} />
            </Field>
            <Field label="Kostensteigerung p.a.">
              <Num value={dcf.kostensteigerung} kind="pct" onChange={(v) => setD("kostensteigerung", v)} />
            </Field>
            <Field label="Verkaufskosten">
              <Num value={dcf.verkaufskosten} kind="pct" onChange={(v) => setD("verkaufskosten", v)} />
            </Field>
            <Field label="Unbefristete Verträge im WALT" hint="angesetzte Restlaufzeit">
              <Num value={dcf.unbefristetJahre} kind="yrs" dec={1} onChange={(v) => setD("unbefristetJahre", v)} />
            </Field>
          </div>
        </Card>

        <Card title="Finanzierung" kicker={fin.aktiv ? `Darlehen ${fmtMio(cf.t0.darlehen)}` : "deaktiviert"}>
          <Toggle checked={fin.aktiv} onChange={(v) => setF("aktiv", v)} label="Fremdfinanzierung berücksichtigen" />
          <div className="sliders">
            <Slider label="LTV (auf Kaufpreis)" kind="pct" dec={1} value={fin.ltv} min={0} max={0.9} step={0.005} disabled={!fin.aktiv} onChange={(v) => setF("ltv", v)} />
            <Slider label="Zins p.a." kind="pct" value={fin.zins} min={0} max={0.09} step={0.0005} disabled={!fin.aktiv} onChange={(v) => setF("zins", v)} />
            <Slider label="Anfängliche Tilgung p.a." kind="pct" value={fin.tilgung} min={0} max={0.06} step={0.0025} disabled={!fin.aktiv} onChange={(v) => setF("tilgung", v)} />
          </div>
          <Field label="Finanzierungsgebühren" hint="% vom Darlehen">
            <Num value={fin.gebuehren} kind="pct" onChange={(v) => setF("gebuehren", v ?? 0)} disabled={!fin.aktiv} />
          </Field>
          <dl className="dl">
            <dt>Gesamtkosten t0</dt>
            <dd>{fmtEur(-cf.t0.cf)}</dd>
            <dt>− Darlehen netto</dt>
            <dd>{fmtEur(-(cf.t0.darlehen - cf.t0.gebuehren))}</dd>
            <dt className="total">Eigenkapital</dt>
            <dd className="total">{fmtEur(cf.t0.eigenkapital)}</dd>
            <dt className="muted">Annuität p.a.</dt>
            <dd className="muted">{fmtEur(cf.t0.darlehen * (fin.zins + fin.tilgung))}</dd>
          </dl>
        </Card>

        <Card title="Verlauf" kicker="NOI und Cashflow je Jahr" tone="plaster">
          <CfChart rows={cf.rows} />
        </Card>
      </div>

      <Card title="Cashflow-Rechnung" kicker={`${cf.rows.length} Jahre · Beträge in €`}>
        <div className="table-wrap">
          <CfTable a={a} deal={deal} />
        </div>
        <p className="muted small">
          Monatliche Simulation je Mieteinheit: Indexierung jährlich, Vertragsende → Anschlussvermietung zur dann gültigen Marktmiete (gewichtet mit der Verlängerungsquote), Leerstand nach Leerstandsdauer vermietet. Exit = Exit-Faktor × Mieteinnahmen des Folgejahres.
          Diskontierung zum Jahresende.
        </p>
      </Card>
    </div>
  );
}

function CfTable({ a, deal }: { a: Analysis; deal: Deal }) {
  const { cf } = a;
  const r = cf.rows;
  type Line = { label: string; t0?: number; get: (x: YearRow) => number; cls?: string; fmt?: (v: number) => string; hide?: boolean };
  const lines: Line[] = [
    { label: "Sollmiete (Vollvermietung)", get: (x) => x.mieteVertrag, cls: "muted" },
    { label: "./. Leerstand", get: (x) => -x.leerstandsverlust, cls: "muted" },
    { label: "./. Mietfreie Zeiten", get: (x) => -x.mietfrei, cls: "muted" },
    { label: "Mieteinnahmen", get: (x) => x.miete, cls: "strong" },
    { label: "Verwaltung", get: (x) => -x.verwaltung },
    { label: "Mietausfallwagnis", get: (x) => -x.mietausfall },
    { label: "Nicht umlagefähige Kosten", get: (x) => -x.nichtUmlagefaehig },
    { label: "Instandhaltung", get: (x) => -x.instandhaltung },
    { label: "NK Leerstand", get: (x) => -x.leerNk },
    { label: "NOI", get: (x) => x.noi, cls: "sum" },
    { label: "Kaufpreis inkl. NK", t0: -(cf.t0.kaufpreis + cf.t0.nk), get: () => 0, cls: "muted" },
    { label: "Ausbau Leerstand / Capex t0", t0: -(cf.t0.ausbauLeer + cf.t0.capexSofort), get: () => 0, cls: "muted" },
    { label: "Ausbau Neuvermietung", get: (x) => -x.ausbau },
    { label: "Makler Vermietung", get: (x) => -x.makler },
    { label: "Exit-Erlös netto", get: (x) => x.exitWert - x.verkaufskosten },
    { label: "Cashflow ungehebelt", t0: cf.t0.cf, get: (x) => x.cf, cls: "sum" },
    { label: "Darlehen netto", t0: cf.t0.darlehen - cf.t0.gebuehren, get: () => 0, hide: !deal.finanzierung.aktiv },
    { label: "Zinsen", get: (x) => -x.zinsen, hide: !deal.finanzierung.aktiv },
    { label: "Tilgung", get: (x) => -x.tilgung, hide: !deal.finanzierung.aktiv },
    { label: "Rückzahlung", get: (x) => -x.rueckzahlung, hide: !deal.finanzierung.aktiv },
    { label: "Cashflow Eigenkapital", t0: cf.t0.cfLevered, get: (x) => x.cfLevered, cls: "sum", hide: !deal.finanzierung.aktiv },
    { label: "DSCR", get: (x) => x.dscr, fmt: (v) => (v ? fmtX(v) : "–"), hide: !deal.finanzierung.aktiv },
    { label: "Cash-on-Cash", get: (x) => x.coc, fmt: (v) => fmtPct(v, 1), hide: !deal.finanzierung.aktiv },
    { label: "Leerstand Ø (Fläche)", get: (x) => x.leerstandsquote, fmt: (v) => fmtPct(v, 1), cls: "muted" },
  ];
  const num = (v: number) => (Math.abs(v) < 0.5 ? "–" : fmtNum(v, 0));
  return (
    <table className="tbl cf">
      <thead>
        <tr>
          <th />
          <th className="r">t0</th>
          {r.map((x) => (
            <th key={x.jahr} className="r">
              Jahr {x.jahr}
              <span className="th-sub">{x.bis.slice(0, 4)}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines
          .filter((l) => !l.hide)
          .map((l) => (
            <tr key={l.label} className={l.cls}>
              <td>{l.label}</td>
              <td className="r tnum">{l.t0 != null ? num(l.t0) : ""}</td>
              {r.map((x) => {
                const v = l.get(x);
                return (
                  <td key={x.jahr} className={`r tnum ${v < 0 && !l.fmt ? "neg" : ""}`}>
                    {l.fmt ? l.fmt(v) : num(v)}
                  </td>
                );
              })}
            </tr>
          ))}
      </tbody>
    </table>
  );
}

function CfChart({ rows }: { rows: YearRow[] }) {
  const W = 360;
  const H = 180;
  const pad = 26;
  const vals = rows.flatMap((r) => [r.noi, r.cfOperativ]);
  const max = Math.max(1, ...vals);
  const min = Math.min(0, ...vals);
  const bw = (W - pad) / rows.length;
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - pad - 10);
  const line = rows.map((r, i) => `${i ? "L" : "M"}${pad + i * bw + bw / 2},${y(r.cfOperativ - r.zinsen - r.tilgung)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="NOI und Cashflow">
      <line x1={pad} x2={W} y1={y(0)} y2={y(0)} className="axis" />
      {rows.map((r, i) => (
        <g key={r.jahr}>
          <rect x={pad + i * bw + bw * 0.18} width={bw * 0.64} y={Math.min(y(r.noi), y(0))} height={Math.abs(y(0) - y(r.noi))} className="bar-noi" rx={2}>
            <title>{`Jahr ${r.jahr}: NOI ${fmtEur(r.noi)}`}</title>
          </rect>
          <rect x={pad + i * bw + bw * 0.18} width={bw * 0.64} y={Math.min(y(r.cfOperativ), y(0))} height={Math.abs(y(0) - y(r.cfOperativ))} className="bar-cf" rx={2}>
            <title>{`Jahr ${r.jahr}: NOI − Capex ${fmtEur(r.cfOperativ)}`}</title>
          </rect>
          <text x={pad + i * bw + bw / 2} y={H - 8} className="tick" textAnchor="middle">
            {r.jahr}
          </text>
        </g>
      ))}
      <path d={line} className="line-cf" />
      <text x={2} y={12} className="tick">
        {fmtMio(max, 1)}
      </text>
      <g className="chart-legend" transform={`translate(${pad + 4}, 14)`}>
        <rect width="9" height="9" className="bar-noi" />
        <text x="13" y="8">NOI</text>
        <rect x="46" width="9" height="9" className="bar-cf" />
        <text x="59" y="8">NOI − Capex</text>
        <line x1="130" x2="146" y1="5" y2="5" className="line-cf" />
        <text x="150" y="8">nach Kapitaldienst</text>
      </g>
    </svg>
  );
}
