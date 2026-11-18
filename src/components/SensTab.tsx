"use client";
import { useDeferredValue, useMemo, useState } from "react";
import type { Deal } from "@/lib/model/types";
import type { Analysis } from "@/lib/model/calc";
import { DRIVERS, OUTPUTS, axis, breakEven, defaultScenarios, driver, evalWith, grid, output, tornado, type Scenario } from "@/lib/model/sensitivity";
import { fmtBy, type FmtKind } from "@/lib/format";
import { Card, Field, Num, Select, Icon } from "./ui";

const fmt = (k: string, v: number) => fmtBy(k as FmtKind, v);
const driverOpts = DRIVERS.map((d) => ({ value: d.key, label: d.label }));
const outOpts = OUTPUTS.map((o) => ({ value: o.key, label: o.label }));

function numKind(f: string): "eur" | "pct" | "x" | "num" | "yrs" {
  return f === "eurqm" ? "num" : f === "mon" ? "num" : (f as "eur" | "pct" | "x" | "num" | "yrs");
}

export function SensTab({ deal: liveDeal, a }: { deal: Deal; a: Analysis }) {
  const deal = useDeferredValue(liveDeal);
  const [xKey, setX] = useState("faktorIst");
  const [yKey, setY] = useState("exitFaktor");
  const [oKey, setO] = useState("irr");
  const [steps, setSteps] = useState(3);
  const [xStep, setXStep] = useState<number | null>(null);
  const [yStep, setYStep] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);

  const xd = driver(xKey);
  const yd = driver(yKey);
  const out = output(oKey);
  const xs = useMemo(() => axis(xd.get(deal), xStep ?? xd.step, steps, xd.min), [deal, xd, xStep, steps]);
  const ys = useMemo(() => axis(yd.get(deal), yStep ?? yd.step, steps, yd.min), [deal, yd, yStep, steps]);
  const g = useMemo(() => grid(deal, xKey, xs, yKey, ys, oKey), [deal, xKey, xs, yKey, ys, oKey]);
  const base = out.get(a);
  const thr = target ?? (oKey === "irr" || oKey === "irrLev" ? deal.dcf.diskontsatz : oKey === "npv" ? 0 : null);
  const all = g.values.flat().filter(Number.isFinite);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const color = (v: number) => {
    if (!Number.isFinite(v)) return "transparent";
    const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
    const good = out.higherIsBetter ? t : 1 - t;
    // rostrot → putz → oliv
    const c1 = [214, 160, 140];
    const c2 = [245, 238, 226];
    const c3 = [170, 190, 135];
    const mix = (p: number[], q: number[], s: number) => p.map((x, i) => Math.round(x + (q[i] - x) * s));
    const c = good < 0.5 ? mix(c1, c2, good * 2) : mix(c2, c3, (good - 0.5) * 2);
    return `rgb(${c.join(",")})`;
  };
  const xBase = xd.get(deal);
  const yBase = yd.get(deal);

  return (
    <div className="stack">
      <Card title="Sensitivitätsmatrix" kicker="Zwei Treiber, eine Zielgröße – frei wählbar">
        <div className="sens-controls">
          <Field label="Zielgröße">
            <Select value={oKey} options={outOpts} onChange={setO} />
          </Field>
          <Field label="Spalten (X)">
            <Select value={xKey} options={driverOpts} onChange={(v) => (setX(v), setXStep(null))} />
          </Field>
          <Field label="Schritt X">
            <Num value={xStep ?? xd.step} kind={numKind(xd.fmt)} onChange={(v) => setXStep(v && v > 0 ? v : null)} />
          </Field>
          <Field label="Zeilen (Y)">
            <Select value={yKey} options={driverOpts} onChange={(v) => (setY(v), setYStep(null))} />
          </Field>
          <Field label="Schritt Y">
            <Num value={yStep ?? yd.step} kind={numKind(yd.fmt)} onChange={(v) => setYStep(v && v > 0 ? v : null)} />
          </Field>
          <Field label="Schritte je Seite">
            <Select value={String(steps)} options={["1", "2", "3", "4", "5"]} onChange={(v) => setSteps(parseInt(v, 10))} />
          </Field>
          <Field label="Schwelle markieren" hint={thr != null ? `Zellen ≥ ${fmt(out.fmt, thr)} umrandet` : "optional"}>
            <Num value={target ?? thr} kind={numKind(out.fmt)} nullable onChange={setTarget} />
          </Field>
        </div>
        <div className="table-wrap">
          <table className="tbl sens">
            <thead>
              <tr>
                <th className="corner">
                  {yd.label} ↓ <br />
                  {xd.label} →
                </th>
                {xs.map((x) => (
                  <th key={x} className={`r ${Math.abs(x - xBase) < 1e-9 ? "base" : ""}`}>
                    {xd.fmt === "pct" && (xKey === "marktmiete" || xKey === "leerstandMonate" || xKey === "umbau") ? (x > 0 ? "+" : "") + fmt("pct", x) : fmt(xd.fmt, x)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ys.map((y, j) => (
                <tr key={y}>
                  <th className={`r ${Math.abs(y - yBase) < 1e-9 ? "base" : ""}`}>{yd.fmt === "pct" && (yKey === "marktmiete" || yKey === "leerstandMonate" || yKey === "umbau") ? (y > 0 ? "+" : "") + fmt("pct", y) : fmt(yd.fmt, y)}</th>
                  {xs.map((x, i) => {
                    const v = g.values[j][i];
                    const isBase = Math.abs(x - xBase) < 1e-9 && Math.abs(y - yBase) < 1e-9;
                    const pass = thr != null && Number.isFinite(v) && (out.higherIsBetter ? v >= thr : v <= thr);
                    return (
                      <td key={x} className={`r tnum ${isBase ? "is-base" : ""} ${pass ? "pass" : ""}`} style={{ background: color(v) }}>
                        {Number.isFinite(v) ? fmt(out.fmt, v) : "n/a"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Jede Zelle ist eine vollständige Neuberechnung (Mieterliste, Leerstand, Cashflow, Finanzierung). Basisfall: {fmt(out.fmt, base)} · eingerahmt = aktueller Ansatz.
        </p>
      </Card>

      <div className="grid-2">
        <TornadoCard deal={deal} />
        <BreakEvenCard deal={deal} />
      </div>
      <ScenarioCard deal={deal} />
    </div>
  );
}

function TornadoCard({ deal }: { deal: Deal }) {
  const [oKey, setO] = useState("irr");
  const [mult, setMult] = useState(1);
  const keys = ["exitFaktor", "marktmiete", "mietwachstum", "indexierung", "leerstandMonate", "umbau", "verlaengerung", "instandhaltung", "zins", "ltv", "faktorIst"];
  const t = useMemo(() => tornado(deal, oKey, keys, mult), [deal, oKey, mult]); // eslint-disable-line react-hooks/exhaustive-deps
  const out = output(oKey);
  const span = Math.max(...t.bars.flatMap((b) => [Math.abs(b.low - t.base), Math.abs(b.high - t.base)]).filter(Number.isFinite), 1e-9);
  return (
    <Card title="Tornado" kicker="Welcher Treiber bewegt das Ergebnis am stärksten?">
      <div className="sens-controls">
        <Field label="Zielgröße">
          <Select value={oKey} options={outOpts} onChange={setO} />
        </Field>
        <Field label="Ausschlag">
          <Select value={String(mult)} options={[{ value: "0.5", label: "½ Schritt" }, { value: "1", label: "1 Schritt" }, { value: "2", label: "2 Schritte" }]} onChange={(v) => setMult(parseFloat(v))} />
        </Field>
      </div>
      <div className="tornado">
        {t.bars.map((b) => {
          const dr = driver(b.key);
          const l = Number.isFinite(b.low) ? (b.low - t.base) / span : 0;
          const h = Number.isFinite(b.high) ? (b.high - t.base) / span : 0;
          const rel = dr.key === "marktmiete" || dr.key === "leerstandMonate" || dr.key === "umbau";
          const fv = (v: number) => (rel ? (v > 0 ? "+" : "") + fmt("pct", v) : fmt(dr.fmt, v));
          return (
            <div key={b.key} className="tor-row" title={`${dr.label}: ${fv(b.lowValue)} → ${fmt(out.fmt, b.low)} · ${fv(b.highValue)} → ${fmt(out.fmt, b.high)}`}>
              <span className="tor-label">{b.label}</span>
              <div className="tor-track">
                <i className="tor-mid" />
                <Bar v={l} cls="low" />
                <Bar v={h} cls="high" />
              </div>
              <span className="tor-val tnum">
                {fmt(out.fmt, Math.min(b.low, b.high))} – {fmt(out.fmt, Math.max(b.low, b.high))}
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted small">
        Basis {fmt(out.fmt, t.base)}. Dunkel = Treiber gesenkt, Messing = Treiber erhöht. Δ%-Treiber verändern alle Nutzungsarten gleichzeitig.
      </p>
    </Card>
  );
}

function Bar({ v, cls }: { v: number; cls: string }) {
  const w = Math.min(50, Math.abs(v) * 50);
  const style = v >= 0 ? { left: "50%", width: `${w}%` } : { left: `${50 - w}%`, width: `${w}%` };
  return <i className={`tor-bar ${cls}`} style={style} />;
}

function BreakEvenCard({ deal }: { deal: Deal }) {
  const [dKey, setD] = useState("exitFaktor");
  const [oKey, setO] = useState("irr");
  const [target, setTarget] = useState<number>(deal.dcf.diskontsatz);
  const out = output(oKey);
  const dr = driver(dKey);
  const res = useMemo(() => breakEven(deal, dKey, oKey, target), [deal, dKey, oKey, target]);
  const quick: [string, string, string, number][] = [
    ["Exit-Faktor für Ziel-IRR", "exitFaktor", "irr", deal.dcf.diskontsatz],
    ["Max. Faktor für Ziel-IRR", "faktorIst", "irr", deal.dcf.diskontsatz],
    ["Zins für DSCR 1,2x", "zins", "dscr", 1.2],
    ["Marktmiete Δ für NPV 0", "marktmiete", "npv", 0],
  ];
  const quickRes = useMemo(() => quick.map(([, d, o, t]) => breakEven(deal, d, o, t)), [deal]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card title="Break-even / Zielwertsuche" kicker="Welcher Wert ist nötig, um das Ziel zu erreichen?" tone="plaster">
      <div className="sens-controls">
        <Field label="Treiber">
          <Select value={dKey} options={driverOpts} onChange={setD} />
        </Field>
        <Field label="Zielgröße">
          <Select value={oKey} options={outOpts} onChange={setO} />
        </Field>
        <Field label="Zielwert">
          <Num value={target} kind={numKind(out.fmt)} onChange={(v) => v != null && setTarget(v)} />
        </Field>
      </div>
      <div className="be-result">
        {res == null ? (
          <span className="muted">Im plausiblen Bereich nicht erreichbar.</span>
        ) : (
          <>
            <span>{dr.label} von</span>
            <strong>{dr.key === "marktmiete" || dr.key === "leerstandMonate" || dr.key === "umbau" ? (res > 0 ? "+" : "") + fmt("pct", res) : fmt(dr.fmt, res)}</strong>
            <span>
              (aktuell {fmt(dr.fmt, dr.get(deal))}) ergibt {out.label} {fmt(out.fmt, target)}
            </span>
          </>
        )}
      </div>
      <ul className="be-quick">
        {quick.map(([label, d, , t], i) => {
          const v = quickRes[i];
          const ddr = driver(d);
          const rel = d === "marktmiete";
          return (
            <li key={label}>
              <span>
                {label} <em className="muted">({fmt(output(quick[i][2]).fmt, t)})</em>
              </span>
              <strong className="tnum">{v == null ? "n/a" : rel ? (v > 0 ? "+" : "") + fmt("pct", v) : fmt(ddr.fmt, v)}</strong>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ScenarioCard({ deal }: { deal: Deal }) {
  const [scen, setScen] = useState<Scenario[]>(() => defaultScenarios(deal));
  const used = [...new Set(scen.flatMap((s) => s.changes.map((c) => c.key)))];
  const [addKey, setAddKey] = useState(DRIVERS.find((d) => !used.includes(d.key))?.key ?? "kaufpreis");
  const results = useMemo(() => scen.map((s) => evalWith(deal, s.changes)), [deal, scen]);
  const kpis: [string, (x: Analysis) => number, string][] = [
    ["IRR ungehebelt", (x) => x.cf.irr, "pct"],
    ["IRR Eigenkapital", (x) => x.cf.irrLevered, "pct"],
    ["Kapitalwert (NPV)", (x) => x.cf.npv, "eur"],
    ["Equity Multiple", (x) => x.cf.equityMultiple, "x"],
    ["Max. Kaufpreis (DCF)", (x) => x.cf.kaufpreisMaxDcf, "eur"],
    ["Exit-Wert", (x) => x.cf.exitWert, "eur"],
    ["Ø Cash-on-Cash", (x) => x.cf.avgCoc, "pct"],
    ["Min. DSCR", (x) => x.cf.minDscr, "x"],
  ];
  const valueOf = (s: Scenario, k: string) => s.changes.find((c) => c.key === k)?.value ?? null;
  const setVal = (si: number, k: string, v: number | null) =>
    setScen((list) =>
      list.map((s, i) => {
        if (i !== si) return s;
        const rest = s.changes.filter((c) => c.key !== k);
        return { ...s, changes: v == null ? rest : [...rest, { key: k, value: v }] };
      }),
    );
  return (
    <Card
      title="Szenarien"
      kicker="Mehrere Annahmen gleichzeitig ändern"
      actions={
        <>
          <button className="btn btn-small" onClick={() => setScen((l) => [...l, { id: Math.random().toString(36).slice(2), name: `Szenario ${l.length + 1}`, changes: [] }])}>
            <Icon name="plus" size={15} /> Szenario
          </button>
          <button className="btn btn-small" onClick={() => setScen(defaultScenarios(deal))}>
            Zurücksetzen
          </button>
        </>
      }
    >
      <div className="table-wrap">
        <table className="tbl scen">
          <thead>
            <tr>
              <th>Annahme</th>
              <th className="r muted">Basis</th>
              {scen.map((s, i) => (
                <th key={s.id} className="r">
                  <input className="txt scen-name" value={s.name} onChange={(e) => setScen((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  {scen.length > 1 && (
                    <button className="icon-btn" title="Entfernen" onClick={() => setScen((l) => l.filter((_, j) => j !== i))}>
                      <Icon name="x" size={13} />
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {used.map((k) => {
              const dr = driver(k);
              const rel = k === "marktmiete" || k === "leerstandMonate" || k === "umbau";
              return (
                <tr key={k}>
                  <td>{dr.label}</td>
                  <td className="r tnum muted">{rel ? "±0 %" : fmt(dr.fmt, dr.get(deal))}</td>
                  {scen.map((s, i) => (
                    <td key={s.id} className="r">
                      <Num value={valueOf(s, k)} kind={numKind(dr.fmt)} nullable placeholder="Basis" onChange={(v) => setVal(i, k, v)} />
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr className="add-row">
              <td colSpan={2 + scen.length}>
                <Select value={addKey} options={driverOpts.filter((o) => !used.includes(o.value))} onChange={setAddKey} />
                <button
                  className="btn btn-small"
                  onClick={() => {
                    const dr = driver(addKey);
                    setScen((l) => l.map((s, i) => (i === 0 && !s.changes.some((c) => c.key === addKey) ? { ...s, changes: [...s.changes, { key: addKey, value: dr.get(deal) }] } : s)));
                  }}
                >
                  Annahme hinzufügen
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            {kpis.map(([label, fn, f]) => {
              const vals = results.map(fn);
              return (
                <tr key={label}>
                  <td className="strong">{label}</td>
                  <td />
                  {vals.map((v, i) => (
                    <td key={i} className="r tnum strong">
                      {Number.isFinite(v) ? fmt(f, v) : "n/a"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tfoot>
        </table>
      </div>
      <p className="muted small">Leere Felder übernehmen den Basiswert. Δ%-Annahmen sind Abweichungen (z. B. −10 % Marktmiete).</p>
    </Card>
  );
}
