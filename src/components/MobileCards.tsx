"use client";
// Handy-Ansichten für Mieterliste und Nutzungsannahmen: Karten statt breiter Tabellen.
import { useState } from "react";
import type { Deal, Unit } from "@/lib/model/types";
import { istMieteQm, marktmieteQm, restlaufzeit, isM2 } from "@/lib/model/calc";
import { NUTZUNG_DEFAULTS } from "@/lib/model/defaults";
import { fmtEur, fmtNum, fmtPct, fmtM2 } from "@/lib/format";
import { DateIn, Icon, Num, Select, Text } from "./ui";

type Upd = (fn: (d: Deal) => void) => void;

export function UnitCards({
  deal,
  units,
  nutzOptions,
  update,
  setU,
  warnBy,
}: {
  deal: Deal;
  units: Unit[];
  nutzOptions: string[];
  update: Upd;
  setU: (id: string, fn: (u: Unit) => void) => void;
  warnBy: Map<string, string[]>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const sumF = units.filter(isM2).reduce((x, u) => x + u.flaeche, 0);
  const sumM = units.filter((u) => !u.leer).reduce((x, u) => x + u.mieteMonat * 12, 0);
  return (
    <div className="ucards">
      {units.map((u) => {
        const rlz = restlaufzeit(deal, u);
        const markt = marktmieteQm(deal, u);
        const ratio = !u.leer && markt > 0 ? istMieteQm(u) / markt - 1 : null;
        const isOpen = open === u.id;
        const w = warnBy.get(u.id);
        return (
          <div key={u.id} className={`ucard ${u.leer ? "is-leer" : ""} ${isOpen ? "open" : ""}`}>
            <button className="ucard-head" onClick={() => setOpen(isOpen ? null : u.id)}>
              <div className="ucard-title">
                <strong>{u.leer ? "Leerstand" : u.mieter || "Ohne Mieter"}</strong>
                <span>
                  {u.nutzung}
                  {u.geschoss ? ` · ${u.geschoss}` : ""}
                  {w ? " · " : ""}
                  {w && <Icon name="alert" size={12} />}
                </span>
              </div>
              <div className="ucard-figs">
                <strong className="tnum">{isM2(u) ? fmtM2(u.flaeche) : `${fmtNum(u.flaeche)} Stk`}</strong>
                <span className="tnum">{u.leer ? <em className="neg">leer</em> : `${fmtEur(u.mieteMonat * 12)} p.a.`}</span>
              </div>
              <Icon name="chevron" size={16} />
            </button>
            {!isOpen && !u.leer && (
              <div className="ucard-meta">
                <span>{fmtNum(istMieteQm(u), 2)} €/m²</span>
                <span>{u.mietende ? `bis ${u.mietende.split("-").reverse().join(".")} · ${fmtNum(rlz, 1)} J.` : "unbefristet"}</span>
                {ratio != null && <span className={ratio > 0.1 ? "neg" : ratio < -0.1 ? "pos" : ""}>{fmtPct(ratio, 0)} ggü. Markt</span>}
              </div>
            )}
            {isOpen && (
              <div className="ucard-body">
                {w && (
                  <ul className="checks">
                    {w.map((t, i) => (
                      <li key={i} className="warn">
                        <Icon name="alert" size={13} /> {t}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mgrid">
                  <label className="field wide">
                    <span className="field-label">Mieter</span>
                    <Text value={u.mieter} onChange={(v) => setU(u.id, (x) => (x.mieter = v))} />
                  </label>
                  <label className="field">
                    <span className="field-label">Nutzung</span>
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
                  </label>
                  <label className="field">
                    <span className="field-label">Geschoss</span>
                    <Text value={u.geschoss} onChange={(v) => setU(u.id, (x) => (x.geschoss = v))} />
                  </label>
                  <label className="field">
                    <span className="field-label">Fläche</span>
                    <Num value={u.flaeche} dec={isM2(u) ? 2 : 0} suffix={isM2(u) ? "m²" : "Stk"} onChange={(v) => setU(u.id, (x) => (x.flaeche = v ?? 0))} />
                  </label>
                  <div className="field">
                    <span className="field-label">Status</span>
                    <button className={`chip big ${u.leer ? "chip-leer" : "chip-ok"}`} onClick={() => setU(u.id, (x) => (x.leer = !x.leer))}>
                      {u.leer ? "leer" : "vermietet"}
                    </button>
                  </div>
                  {!u.leer && (
                    <>
                      <label className="field">
                        <span className="field-label">Miete mtl.</span>
                        <Num value={u.mieteMonat} kind="eur" dec={2} onChange={(v) => setU(u.id, (x) => (x.mieteMonat = v ?? 0))} />
                      </label>
                      <label className="field">
                        <span className="field-label">€/m² mtl.</span>
                        <Num value={istMieteQm(u)} dec={2} suffix="€" onChange={(v) => setU(u.id, (x) => (x.mieteMonat = (v ?? 0) * x.flaeche))} />
                      </label>
                      <label className="field">
                        <span className="field-label">Miete p.a.</span>
                        <Num value={u.mieteMonat * 12} kind="eur" onChange={(v) => setU(u.id, (x) => (x.mieteMonat = (v ?? 0) / 12))} />
                      </label>
                      <label className="field">
                        <span className="field-label">Restlaufzeit</span>
                        <span className="ro tnum">{u.mietende ? `${fmtNum(rlz, 2)} J.` : "unbefristet"}</span>
                      </label>
                      <label className="field">
                        <span className="field-label">Mietende</span>
                        <DateIn value={u.mietende} onChange={(v) => setU(u.id, (x) => (x.mietende = v))} />
                      </label>
                      <label className="field">
                        <span className="field-label">Option / Break</span>
                        <DateIn value={u.option} onChange={(v) => setU(u.id, (x) => (x.option = v))} />
                      </label>
                    </>
                  )}
                  <label className="field">
                    <span className="field-label">Marktmiete €/m²</span>
                    <Num value={u.marktmiete} dec={2} suffix="€" nullable placeholder={fmtNum(markt, 2)} onChange={(v) => setU(u.id, (x) => (x.marktmiete = v))} />
                  </label>
                </div>
                <button className="btn btn-small danger" onClick={() => update((d) => void (d.units = d.units.filter((x) => x.id !== u.id)))}>
                  <Icon name="trash" size={14} /> Einheit entfernen
                </button>
              </div>
            )}
          </div>
        );
      })}
      {units.length === 0 && <div className="empty-m">Noch keine Einheiten. Mieterliste importieren oder Einheit hinzufügen.</div>}
      <div className="ucard-total">
        <span>Summe</span>
        <strong className="tnum">{fmtM2(sumF)}</strong>
        <strong className="tnum">{fmtEur(sumM)} p.a.</strong>
      </div>
    </div>
  );
}

const FIELDS: { k: keyof (typeof NUTZUNG_DEFAULTS)["Büro"]; label: string; kind?: "eur" | "pct" | "mon" | "yrs"; suffix?: string; dec?: number }[] = [
  { k: "marktmiete", label: "Marktmiete €/m² mtl.", suffix: "€", dec: 2 },
  { k: "umbauLeer", label: "Ausbau Leerstand €/m²", kind: "eur" },
  { k: "umbauNeu", label: "Ausbau Neuverm. €/m²", kind: "eur" },
  { k: "leerstandMonate", label: "Leerstand bis Vermietung", kind: "mon", dec: 1 },
  { k: "mietfreiMonate", label: "Mietfrei", kind: "mon", dec: 1 },
  { k: "maklerMonate", label: "Makler (Monatsmieten)", suffix: "MM", dec: 1 },
  { k: "verlaengerung", label: "Verlängerungsquote", kind: "pct", dec: 0 },
  { k: "neueLaufzeit", label: "Neue Laufzeit", kind: "yrs", dec: 1 },
  { k: "leerstandNk", label: "NK im Leerstand €/m²", suffix: "€", dec: 2 },
];

export function NutzungCards({ deal, nutzungen, update }: { deal: Deal; nutzungen: string[]; update: Upd }) {
  const [open, setOpen] = useState<string | null>(nutzungen[0] ?? null);
  return (
    <div className="ucards">
      {nutzungen.map((nutzung) => {
        const n = deal.nutzungen[nutzung] ?? NUTZUNG_DEFAULTS["Sonstiges"];
        const isOpen = open === nutzung;
        return (
          <div key={nutzung} className={`ucard ${isOpen ? "open" : ""}`}>
            <button className="ucard-head" onClick={() => setOpen(isOpen ? null : nutzung)}>
              <div className="ucard-title">
                <strong>{nutzung}</strong>
                <span>
                  Markt {fmtNum(n.marktmiete, 2)} € · Ausbau {fmtNum(n.umbauLeer)} €/m² · {fmtNum(n.leerstandMonate, 0)} Mon. Leerstand
                </span>
              </div>
              <Icon name="chevron" size={16} />
            </button>
            {isOpen && (
              <div className="ucard-body">
                <div className="mgrid">
                  {FIELDS.map((f) => (
                    <label key={f.k} className="field">
                      <span className="field-label">{f.label}</span>
                      <Num
                        value={n[f.k]}
                        kind={f.kind === "eur" ? "eur" : f.kind === "pct" ? "pct" : f.kind === "mon" ? "mon" : f.kind === "yrs" ? "yrs" : "num"}
                        dec={f.dec}
                        suffix={nutzung === "Stellplätze" && f.k === "marktmiete" ? "€/Stk" : f.suffix}
                        onChange={(v) =>
                          update((d) => {
                            const val = f.k === "verlaengerung" ? Math.min(1, Math.max(0, v ?? 0)) : (v ?? 0);
                            d.nutzungen[nutzung] = { ...(d.nutzungen[nutzung] ?? NUTZUNG_DEFAULTS["Sonstiges"]), [f.k]: val };
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
