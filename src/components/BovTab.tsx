"use client";
import { useMemo } from "react";
import type { Deal } from "@/lib/model/types";
import type { Analysis } from "@/lib/model/calc";
import { bovResult } from "@/lib/model/bov";
import { uid } from "@/lib/model/defaults";
import { fmtEur, fmtMio, fmtPct, fmtX, fmtYrs, fmtM2, fmtDate } from "@/lib/format";
import { Card, Field, Icon, Num, Text } from "./ui";

type Upd = (fn: (d: Deal) => void) => void;

export function BovTab({ deal, a, update }: { deal: Deal; a: Analysis; update: Upd }) {
  const bov = useMemo(() => bovResult(deal, a), [deal, a]);
  const b = deal.bov;
  const o = deal.objekt;
  const allVals = bov.methods.flatMap((m) => (m.weight > 0 || m.mid > 0 ? [m.low, m.high] : [])).concat([bov.low, bov.high, deal.pricing.kaufpreis]).filter((x) => x > 0);
  const lo = Math.min(...allVals) * 0.9;
  const hi = Math.max(...allVals) * 1.05;
  const pos = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;

  return (
    <div className="stack">
      <div className="bov-actions no-print">
        <button className="btn btn-brass" onClick={() => window.print()}>
          <Icon name="print" /> BOV als PDF drucken
        </button>
      </div>

      <article className="bov-doc print-area">
        <header className="bov-cover">
          <div className="kicker">Broker Opinion of Value · {fmtDate(deal.stichtag)}</div>
          <h2>{o.name}</h2>
          <p>{[o.adresse, [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</p>
          <div className="bov-value">
            <span>Marktwert (Kaufpreis netto)</span>
            <strong>{fmtMio(bov.wert)}</strong>
            <em>
              Spanne {fmtMio(bov.low)} – {fmtMio(bov.high)}
            </em>
          </div>
        </header>

        <section className="bov-kpis">
          {[
            ["Faktor (Ist)", fmtX(bov.faktorIst)],
            ["€/m²", fmtEur(bov.preisQm)],
            ["Bruttoanfangsrendite", fmtPct(bov.bar)],
            ["Ist-Miete p.a.", fmtEur(a.s.istMieteJahr)],
            ["Mietfläche", fmtM2(a.s.flaecheM2)],
            ["WALT", fmtYrs(a.s.walt)],
            ["Leerstand", fmtPct(a.s.leerstandsquoteFlaeche, 1)],
            ["IRR beim Marktwert", fmtPct(bov.irrBeiWert)],
          ].map(([l, v]) => (
            <div key={l}>
              <span>{l}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </section>

        <Card title="Wertherleitung" kicker="Football Field">
          <div className="ff">
            {bov.methods.map((m) => (
              <div key={m.key} className={`ff-row ${m.weight === 0 ? "off" : ""}`}>
                <div className="ff-label">
                  <strong>{m.label}</strong>
                  <span>{m.note}</span>
                </div>
                <div className="ff-track">
                  {m.high > 0 && (
                    <>
                      <i className="ff-bar" style={{ left: pos(m.low), width: `calc(${pos(m.high)} - ${pos(m.low)})` }} />
                      <i className="ff-mid" style={{ left: pos(m.mid) }} />
                    </>
                  )}
                  <i className="ff-kp" style={{ left: pos(deal.pricing.kaufpreis) }} title="Kaufpreis (Ansatz)" />
                </div>
                <div className="ff-val tnum">
                  {m.high > 0 ? `${fmtMio(m.low, 1)} – ${fmtMio(m.high, 1)}` : "–"}
                  <span>Gewicht {fmtPct(m.weight, 0)}</span>
                </div>
              </div>
            ))}
            <div className="ff-row total">
              <div className="ff-label">
                <strong>Gewichteter Marktwert</strong>
                <span>± {fmtPct(b.spanne, 0)}</span>
              </div>
              <div className="ff-track">
                <i className="ff-bar brass" style={{ left: pos(bov.low), width: `calc(${pos(bov.high)} - ${pos(bov.low)})` }} />
                <i className="ff-mid" style={{ left: pos(bov.wert) }} />
                <i className="ff-kp" style={{ left: pos(deal.pricing.kaufpreis) }} />
              </div>
              <div className="ff-val tnum">
                <strong>{fmtMio(bov.wert)}</strong>
                <span>Kaufpreis {bov.abweichungKaufpreis >= 0 ? "+" : ""}{fmtPct(bov.abweichungKaufpreis, 1)}</span>
              </div>
            </div>
            <div className="ff-axis">
              <span>{fmtMio(lo, 1)}</span>
              <span className="ff-legend">
                <i className="ff-kp-l" /> Kaufpreis-Ansatz {fmtMio(deal.pricing.kaufpreis)}
              </span>
              <span>{fmtMio(hi, 1)}</span>
            </div>
          </div>
        </Card>

        <div className="grid-2 bov-text">
          {(
            [
              ["staerken", "Stärken"],
              ["schwaechen", "Schwächen"],
              ["chancen", "Chancen"],
              ["risiken", "Risiken"],
            ] as const
          ).map(([k, l]) => (
            <Card key={k} title={l} kicker="SWOT">
              <Text multiline value={b[k]} onChange={(v) => update((d) => void (d.bov[k] = v))} placeholder="Stichpunkte…" />
              <div className="print-only pre">{b[k]}</div>
            </Card>
          ))}
          <Card title="Käuferprofil" kicker="Zielgruppe">
            <Text multiline value={b.zielgruppe} onChange={(v) => update((d) => void (d.bov.zielgruppe = v))} placeholder="z. B. Family Offices, Spezialfonds Core+, Privatinvestoren…" />
            <div className="print-only pre">{b.zielgruppe}</div>
          </Card>
          <Card title="Vermarktungsstrategie" kicker="Prozess">
            <Text multiline value={b.strategie} onChange={(v) => update((d) => void (d.bov.strategie = v))} placeholder="z. B. strukturierter Bieterprozess, Off-Market-Ansprache…" />
            <div className="print-only pre">{b.strategie}</div>
          </Card>
        </div>
      </article>

      <div className="grid-2 no-print">
        <Card title="Gewichtung & Spanne" kicker="Einstellungen">
          <div className="form-grid two">
            <Field label="Zielfaktor (Potenzial)">
              <Num value={b.zielfaktor} kind="x" onChange={(v) => v != null && update((d) => void (d.bov.zielfaktor = v))} />
            </Field>
            <Field label="± Faktor-Spanne">
              <Num value={b.faktorSpanne} kind="x" onChange={(v) => update((d) => void (d.bov.faktorSpanne = Math.max(0, v ?? 0)))} />
            </Field>
            <Field label="Gewicht Faktormethode">
              <Num value={b.gewichtFaktor} kind="pct" dec={0} onChange={(v) => update((d) => void (d.bov.gewichtFaktor = Math.max(0, v ?? 0)))} />
            </Field>
            <Field label="Gewicht DCF">
              <Num value={b.gewichtDcf} kind="pct" dec={0} onChange={(v) => update((d) => void (d.bov.gewichtDcf = Math.max(0, v ?? 0)))} />
            </Field>
            <Field label="Gewicht Vergleichswert">
              <Num value={b.gewichtVergleich} kind="pct" dec={0} onChange={(v) => update((d) => void (d.bov.gewichtVergleich = Math.max(0, v ?? 0)))} />
            </Field>
            <Field label="Spanne ±">
              <Num value={b.spanne} kind="pct" dec={1} onChange={(v) => update((d) => void (d.bov.spanne = Math.max(0, v ?? 0)))} />
            </Field>
            <Field label="Verfasser" wide>
              <Text value={b.verfasser} onChange={(v) => update((d) => void (d.bov.verfasser = v))} />
            </Field>
          </div>
          <p className="muted small">Gewichte werden auf die verfügbaren Methoden normiert. Ohne Vergleichstransaktionen fällt der Vergleichswert heraus.</p>
          <button className="btn btn-glass" onClick={() => update((d) => void (d.pricing.kaufpreis = Math.round(bov.wert)))}>
            Marktwert als Kaufpreis übernehmen
          </button>
        </Card>

        <Card
          title="Vergleichstransaktionen"
          kicker={`${b.vergleiche.length} erfasst`}
          actions={
            <button className="btn btn-small btn-brass" onClick={() => update((d) => void d.bov.vergleiche.push({ id: uid(), name: "", ort: d.objekt.ort, datum: "", flaeche: 0, preisQm: 0, faktor: 0, quelle: "" }))}>
              <Icon name="plus" size={15} /> Vergleich
            </button>
          }
        >
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Objekt</th>
                  <th>Ort</th>
                  <th>Datum</th>
                  <th className="r">Fläche</th>
                  <th className="r">€/m²</th>
                  <th className="r">Faktor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {b.vergleiche.map((v) => {
                  const setV = (fn: (x: typeof v) => void) =>
                    update((d) => {
                      const x = d.bov.vergleiche.find((y) => y.id === v.id);
                      if (x) fn(x);
                    });
                  return (
                    <tr key={v.id}>
                      <td>
                        <Text value={v.name} onChange={(t) => setV((x) => (x.name = t))} />
                      </td>
                      <td>
                        <Text value={v.ort} onChange={(t) => setV((x) => (x.ort = t))} className="short" />
                      </td>
                      <td>
                        <Text value={v.datum} onChange={(t) => setV((x) => (x.datum = t))} className="short" placeholder="Q2/2026" />
                      </td>
                      <td className="r">
                        <Num value={v.flaeche} kind="m2" onChange={(n) => setV((x) => (x.flaeche = n ?? 0))} />
                      </td>
                      <td className="r">
                        <Num value={v.preisQm} kind="eur" onChange={(n) => setV((x) => (x.preisQm = n ?? 0))} />
                      </td>
                      <td className="r">
                        <Num value={v.faktor} kind="x" onChange={(n) => setV((x) => (x.faktor = n ?? 0))} />
                      </td>
                      <td>
                        <button className="icon-btn" onClick={() => update((d) => void (d.bov.vergleiche = d.bov.vergleiche.filter((y) => y.id !== v.id)))}>
                          <Icon name="trash" size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!b.vergleiche.length && (
                  <tr>
                    <td colSpan={7} className="empty">
                      Noch keine Vergleiche erfasst.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
