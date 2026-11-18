"use client";
import { useMemo, useState } from "react";
import type { Deal, Unit } from "@/lib/model/types";
import { type Analysis, type Check, istMieteQm, marktmieteQm, restlaufzeit, isM2 } from "@/lib/model/calc";
import { NUTZUNGEN, NUTZUNG_DEFAULTS, emptyUnit } from "@/lib/model/defaults";
import { fmtEur, fmtNum, fmtPct, fmtYrs, fmtM2 } from "@/lib/format";
import { Card, DateIn, Icon, Num, Select, Stat, Text, Badge } from "./ui";
import { useMobile } from "@/lib/useMobile";
import { UnitCards, NutzungCards } from "./MobileCards";

type Upd = (fn: (d: Deal) => void) => void;

export function MieterTab({ deal, a, update, warn, onImport }: { deal: Deal; a: Analysis; update: Upd; warn: Check[]; onImport: () => void }) {
  const [filter, setFilter] = useState("");
  const setU = (id: string, fn: (u: Unit) => void) =>
    update((d) => {
      const u = d.units.find((x) => x.id === id);
      if (u) fn(u);
    });
  const nutzOptions = useMemo(() => [...new Set([...NUTZUNGEN, ...Object.keys(deal.nutzungen), ...deal.units.map((u) => u.nutzung)])], [deal]);
  const units = deal.units.filter((u) => !filter || `${u.mieter} ${u.nutzung} ${u.geschoss}`.toLowerCase().includes(filter.toLowerCase()));
  const warnBy = new Map<string, string[]>();
  for (const w of warn) if (w.unitId) warnBy.set(w.unitId, [...(warnBy.get(w.unitId) ?? []), w.text]);
  const s = a.s;
  const mobile = useMobile();

  return (
    <div className="stack">
      <div className="stats-row">
        <Stat label="Mietfläche" value={fmtM2(s.flaecheM2)} sub={s.stellplaetze ? `+ ${fmtNum(s.stellplaetze)} Stellplätze` : undefined} />
        <Stat label="Vermietet" value={fmtM2(s.flaecheVermietetM2)} sub={`${s.anzahlMieter} Mieter`} />
        <Stat label="Leerstand" value={fmtPct(s.leerstandsquoteFlaeche, 1)} sub={`${fmtM2(s.flaecheLeerM2)} · ${fmtPct(s.leerstandsquoteMiete, 1)} der Potenzialmiete`} tone={s.leerstandsquoteFlaeche > 0.1 ? "neg" : undefined} />
        <Stat label="Ist-Miete p.a." value={fmtEur(s.istMieteJahr)} sub={`Potenzial ${fmtEur(s.potenzialJahr)}`} />
        <Stat label="WALT" value={fmtYrs(s.walt)} sub={`bis Break (WALB) ${fmtYrs(s.walb)}`} tone="brass" />
        <Stat label="Over-/Underrent" value={fmtPct(s.overRent, 1)} sub="Ist vs. Marktmiete (vermietet)" tone={s.overRent > 0.05 ? "neg" : s.overRent < -0.05 ? "pos" : undefined} />
      </div>

      <Card
        title="Mieterliste"
        kicker={`${deal.units.length} Einheiten · Stichtag ${deal.stichtag.split("-").reverse().join(".")}`}
        actions={
          <>
            <input className="txt search" placeholder="Filtern…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className="btn btn-small" onClick={onImport}>
              <Icon name="upload" size={15} /> Import
            </button>
            <button className="btn btn-small btn-brass" onClick={() => update((d) => void d.units.push(emptyUnit({ nutzung: d.units.at(-1)?.nutzung ?? "Büro" })))}>
              <Icon name="plus" size={15} /> Einheit
            </button>
          </>
        }
      >
        {mobile ? (
          <UnitCards deal={deal} units={units} nutzOptions={nutzOptions} update={update} setU={setU} warnBy={warnBy} />
        ) : (
        <div className="table-wrap">
          <table className="tbl rentroll">
            <thead>
              <tr>
                <th>Nutzung</th>
                <th>Mieter</th>
                <th>Geschoss</th>
                <th className="r">Fläche</th>
                <th>Status</th>
                <th className="r">Miete mtl.</th>
                <th className="r">€/m² mtl.</th>
                <th className="r">Miete p.a.</th>
                <th>Mietende</th>
                <th>Option/Break</th>
                <th className="r">RLZ</th>
                <th className="r" title="leer = Vorgabe der Nutzungsart">Marktmiete €/m²</th>
                <th className="r">Ist/Markt</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const rlz = restlaufzeit(deal, u);
                const markt = marktmieteQm(deal, u);
                const ratio = !u.leer && markt > 0 ? istMieteQm(u) / markt - 1 : null;
                const w = warnBy.get(u.id);
                return (
                  <tr key={u.id} className={u.leer ? "is-leer" : ""}>
                    <td>
                      <Select
                        value={u.nutzung}
                        options={nutzOptions}
                        onChange={(v) =>
                          update((d) => {
                            const x = d.units.find((y) => y.id === u.id)!;
                            x.nutzung = v;
                            if (v === "Stellplätze") x.einheit = "stk";
                            else if (x.einheit === "stk") x.einheit = "m2";
                            if (!d.nutzungen[v]) d.nutzungen[v] = { ...(NUTZUNG_DEFAULTS[v] ?? NUTZUNG_DEFAULTS["Sonstiges"]) };
                          })
                        }
                      />
                    </td>
                    <td className="mieter">
                      <Text value={u.mieter} onChange={(v) => setU(u.id, (x) => (x.mieter = v))} placeholder={u.leer ? "Leerstand" : "Mieter"} />
                      {w && (
                        <span className="row-warn" title={w.join("\n")}>
                          <Icon name="alert" size={13} />
                        </span>
                      )}
                    </td>
                    <td>
                      <Text value={u.geschoss} onChange={(v) => setU(u.id, (x) => (x.geschoss = v))} className="short" />
                    </td>
                    <td className="r">
                      <Num value={u.flaeche} kind="num" dec={isM2(u) ? 2 : 0} suffix={isM2(u) ? "m²" : "Stk"} onChange={(v) => setU(u.id, (x) => (x.flaeche = v ?? 0))} />
                    </td>
                    <td>
                      <button className={`chip ${u.leer ? "chip-leer" : "chip-ok"}`} onClick={() => setU(u.id, (x) => (x.leer = !x.leer))}>
                        {u.leer ? "leer" : "vermietet"}
                      </button>
                    </td>
                    <td className="r">
                      <Num value={u.leer ? null : u.mieteMonat} kind="eur" dec={2} disabled={u.leer} onChange={(v) => setU(u.id, (x) => (x.mieteMonat = v ?? 0))} />
                    </td>
                    <td className="r">
                      <Num value={u.leer ? null : istMieteQm(u)} kind="num" dec={2} suffix="" disabled={u.leer} onChange={(v) => setU(u.id, (x) => (x.mieteMonat = (v ?? 0) * x.flaeche))} />
                    </td>
                    <td className="r">
                      <Num value={u.leer ? null : u.mieteMonat * 12} kind="eur" disabled={u.leer} onChange={(v) => setU(u.id, (x) => (x.mieteMonat = (v ?? 0) / 12))} />
                    </td>
                    <td>{u.leer ? <span className="muted">–</span> : <DateIn value={u.mietende} onChange={(v) => setU(u.id, (x) => (x.mietende = v))} />}</td>
                    <td>{u.leer ? <span className="muted">–</span> : <DateIn value={u.option} onChange={(v) => setU(u.id, (x) => (x.option = v))} />}</td>
                    <td className="r tnum">{u.leer ? "–" : u.mietende ? fmtNum(rlz, 2) : <span title="unbefristet">unbef.</span>}</td>
                    <td className="r">
                      <Num value={u.marktmiete} kind="num" dec={2} suffix="" nullable placeholder={fmtNum(markt, 2)} onChange={(v) => setU(u.id, (x) => (x.marktmiete = v))} />
                    </td>
                    <td className={`r tnum ${ratio != null && ratio > 0.1 ? "neg" : ratio != null && ratio < -0.1 ? "pos" : ""}`}>{ratio == null ? "–" : fmtPct(ratio, 0)}</td>
                    <td>
                      <button className="icon-btn" title="Entfernen" onClick={() => update((d) => void (d.units = d.units.filter((x) => x.id !== u.id)))}>
                        <Icon name="trash" size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {units.length === 0 && (
                <tr>
                  <td colSpan={14} className="empty">
                    Noch keine Einheiten. Mieterliste importieren oder Einheit hinzufügen.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Summe</td>
                <td className="r tnum">{fmtM2(s.flaecheM2)}</td>
                <td />
                <td className="r tnum">{fmtEur(s.istMieteJahr / 12)}</td>
                <td className="r tnum">{fmtNum(s.flaecheVermietetM2 > 0 ? s.byNutzung.filter((n) => n.einheit === "m2").reduce((x, n) => x + n.istMieteJahr, 0) / 12 / s.flaecheVermietetM2 : 0, 2)}</td>
                <td className="r tnum">{fmtEur(s.istMieteJahr)}</td>
                <td colSpan={2} className="r">
                  WALT
                </td>
                <td className="r tnum strong">{fmtNum(s.walt, 2)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
        )}
        <p className="muted small">
          Restlaufzeit = (Mietende − Stichtag) / 365,25 Tage. Unbefristete Verträge zählen mit {fmtNum(deal.dcf.unbefristetJahre, 1)} Jahren (Einstellung unter Cashflow). Leere Einheiten gehen nicht in den WALT ein.
        </p>
      </Card>

      <div className="grid-2">
        <Card title="WALT und Kennzahlen je Nutzungsart" kicker="Auswertung" className="span-2-md">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nutzung</th>
                  <th className="r">Fläche</th>
                  <th className="r">Leer</th>
                  <th className="r">Ist-Miete p.a.</th>
                  <th className="r">Ø €/m²</th>
                  <th className="r">Markt €/m²</th>
                  <th className="r">Σ Miete × RLZ</th>
                  <th className="r">WALT</th>
                  <th className="r">WALB</th>
                  <th className="r">Anteil Miete</th>
                </tr>
              </thead>
              <tbody>
                {s.byNutzung.map((n) => (
                  <tr key={n.nutzung}>
                    <td className="strong">{n.nutzung}</td>
                    <td className="r tnum">{n.einheit === "m2" ? fmtM2(n.flaeche) : `${fmtNum(n.flaeche)} Stk`}</td>
                    <td className="r tnum">{fmtPct(n.leerstandsquote, 1)}</td>
                    <td className="r tnum">{fmtEur(n.istMieteJahr)}</td>
                    <td className="r tnum">{fmtNum(n.istQm, 2)}</td>
                    <td className="r tnum">{fmtNum(n.marktQm, 2)}</td>
                    <td className="r tnum muted">{fmtEur(n.mieteXRlz)}</td>
                    <td className="r tnum strong">{fmtYrs(n.walt)}</td>
                    <td className="r tnum">{fmtYrs(n.walb)}</td>
                    <td className="r tnum">{fmtPct(s.istMieteJahr ? n.istMieteJahr / s.istMieteJahr : 0, 1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Gesamt</td>
                  <td className="r tnum">{fmtM2(s.flaecheM2)}</td>
                  <td className="r tnum">{fmtPct(s.leerstandsquoteFlaeche, 1)}</td>
                  <td className="r tnum">{fmtEur(s.istMieteJahr)}</td>
                  <td />
                  <td />
                  <td className="r tnum">{fmtEur(s.mieteXRlz)}</td>
                  <td className="r tnum strong">{fmtYrs(s.walt)}</td>
                  <td className="r tnum">{fmtYrs(s.walb)}</td>
                  <td className="r tnum">100 %</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="formula">
            <strong>So wird gerechnet:</strong> WALT je Nutzung = Σ (Jahresmiete × Restlaufzeit) ÷ Σ Jahresmiete der Nutzung. WALT gesamt = Σ aller (Jahresmiete × Restlaufzeit) ÷ gesamte Jahresmiete ={" "}
            {fmtEur(s.mieteXRlz)} ÷ {fmtEur(s.istMieteJahr)} = <strong>{fmtNum(s.walt, 2)} Jahre</strong>. Der Gesamt-WALT ist damit der mietgewichtete — nicht der einfache — Durchschnitt der Nutzungs-WALTs.
          </div>
        </Card>
        <ExpiryChart deal={deal} />
        <Card title="Vermietungskosten Leerstand" kicker="wird vom Wert abgezogen" tone="plaster">
          <dl className="dl">
            <dt>Ausbau leere Flächen</dt>
            <dd>{fmtEur(s.vk.umbau)}</dd>
            <dt>Makler Erstvermietung</dt>
            <dd>{fmtEur(s.vk.makler)}</dd>
            <dt>Mietfreie Zeit (Incentive)</dt>
            <dd>{fmtEur(s.vk.mietfrei)}</dd>
            <dt>Mietausfall bis Vermietung</dt>
            <dd>{fmtEur(s.vk.mietverlust)}</dd>
            <dt>Nicht umlegbare NK im Leerstand</dt>
            <dd>{fmtEur(s.vk.leerNk)}</dd>
            <dt className="total">Summe</dt>
            <dd className="total">{fmtEur(s.vk.summe)}</dd>
            <dt className="muted">je m² Leerstand</dt>
            <dd className="muted">{fmtEur(s.flaecheLeerM2 ? s.vk.summe / s.flaecheLeerM2 : 0)}</dd>
          </dl>
        </Card>
      </div>

      <Card title="Annahmen je Nutzungsart" kicker="Marktmiete, Ausbau, Leerstand, Anschlussvermietung">
        {mobile ? (
          <NutzungCards deal={deal} nutzungen={s.byNutzung.map((n) => n.nutzung)} update={update} />
        ) : (
        <div className="table-wrap">
          <table className="tbl assumptions">
            <thead>
              <tr>
                <th>Nutzung</th>
                <th className="r">Marktmiete €/m² mtl.</th>
                <th className="r">Ausbau Leerstand €/m²</th>
                <th className="r">Ausbau Neuverm. €/m²</th>
                <th className="r">Leerstand bis Vermietung</th>
                <th className="r">Mietfrei</th>
                <th className="r">Makler (Monatsmieten)</th>
                <th className="r">Verlängerungsquote</th>
                <th className="r">Neue Laufzeit</th>
                <th className="r">NK im Leerstand €/m² mtl.</th>
              </tr>
            </thead>
            <tbody>
              {s.byNutzung.map(({ nutzung }) => {
                const n = deal.nutzungen[nutzung] ?? NUTZUNG_DEFAULTS["Sonstiges"];
                const setN = (k: keyof typeof n, v: number | null) =>
                  update((d) => {
                    d.nutzungen[nutzung] = { ...(d.nutzungen[nutzung] ?? NUTZUNG_DEFAULTS["Sonstiges"]), [k]: v ?? 0 };
                  });
                return (
                  <tr key={nutzung}>
                    <td className="strong">{nutzung}</td>
                    <td className="r">
                      <Num value={n.marktmiete} dec={2} suffix={nutzung === "Stellplätze" ? "€/Stk" : "€"} onChange={(v) => setN("marktmiete", v)} />
                    </td>
                    <td className="r">
                      <Num value={n.umbauLeer} kind="eur" onChange={(v) => setN("umbauLeer", v)} />
                    </td>
                    <td className="r">
                      <Num value={n.umbauNeu} kind="eur" onChange={(v) => setN("umbauNeu", v)} />
                    </td>
                    <td className="r">
                      <Num value={n.leerstandMonate} kind="mon" dec={1} onChange={(v) => setN("leerstandMonate", v)} />
                    </td>
                    <td className="r">
                      <Num value={n.mietfreiMonate} kind="mon" dec={1} onChange={(v) => setN("mietfreiMonate", v)} />
                    </td>
                    <td className="r">
                      <Num value={n.maklerMonate} dec={1} suffix="MM" onChange={(v) => setN("maklerMonate", v)} />
                    </td>
                    <td className="r">
                      <Num value={n.verlaengerung} kind="pct" dec={0} onChange={(v) => setN("verlaengerung", Math.min(1, Math.max(0, v ?? 0)))} />
                    </td>
                    <td className="r">
                      <Num value={n.neueLaufzeit} kind="yrs" dec={1} onChange={(v) => setN("neueLaufzeit", v)} />
                    </td>
                    <td className="r">
                      <Num value={n.leerstandNk} dec={2} suffix="€" onChange={(v) => setN("leerstandNk", v)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
        <p className="muted small">
          Heute leere Flächen werden nach der Leerstandsdauer zur Marktmiete vermietet; Ausbau fällt beim Kauf an. Bei Vertragsende wird mit der Verlängerungsquote gewichtet: Leerstand, Mietfreiheit, Ausbau und Makler fallen nur zum Anteil (1 − Quote) an, die
          Anschlussmiete ist die dann gültige Marktmiete.
        </p>
      </Card>
    </div>
  );
}

function ExpiryChart({ deal }: { deal: Deal }) {
  const y0 = parseInt(deal.stichtag.slice(0, 4), 10);
  const years = Array.from({ length: 11 }, (_, i) => y0 + i);
  const buckets = new Map<string, number>();
  let unbef = 0;
  let total = 0;
  for (const u of deal.units) {
    if (u.leer) continue;
    const jm = u.mieteMonat * 12;
    total += jm;
    if (!u.mietende) {
      unbef += jm;
      continue;
    }
    const y = Math.max(y0, Math.min(y0 + 10, parseInt(u.mietende.slice(0, 4), 10)));
    buckets.set(String(y), (buckets.get(String(y)) ?? 0) + jm);
  }
  const vals = years.map((y) => buckets.get(String(y)) ?? 0);
  const max = Math.max(1, ...vals, unbef);
  return (
    <Card title="Auslaufprofil" kicker="Jahresmiete nach Vertragsende">
      <div className="bars">
        {years.map((y, i) => (
          <div key={y} className="bar-col" title={`${y}: ${fmtEur(vals[i])}`}>
            <div className="bar" style={{ height: `${(vals[i] / max) * 100}%` }} />
            <span className="bar-v">{vals[i] ? fmtPct(vals[i] / (total || 1), 0) : ""}</span>
            <span className="bar-l">{i === 10 ? `${String(y).slice(2)}+` : String(y).slice(2)}</span>
          </div>
        ))}
        <div className="bar-col" title={`unbefristet: ${fmtEur(unbef)}`}>
          <div className="bar bar-alt" style={{ height: `${(unbef / max) * 100}%` }} />
          <span className="bar-v">{unbef ? fmtPct(unbef / (total || 1), 0) : ""}</span>
          <span className="bar-l">unb.</span>
        </div>
      </div>
      <div className="legend">
        <Badge tone="brass">befristet</Badge> <Badge>unbefristet</Badge>
      </div>
    </Card>
  );
}
