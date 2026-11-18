"use client";
import type { Deal } from "@/lib/model/types";
import type { Check } from "@/lib/model/calc";
import { GREST, OBJEKTARTEN } from "@/lib/model/defaults";
import { Card, DateIn, Field, Icon, Num, Select, Text, Toggle } from "./ui";

export function ObjektTab({ deal, update, warn, onImport }: { deal: Deal; update: (fn: (d: Deal) => void) => void; warn: Check[]; onImport: () => void }) {
  const o = deal.objekt;
  const set = <K extends keyof Deal["objekt"]>(k: K, v: Deal["objekt"][K]) => update((d) => void (d.objekt[k] = v));
  return (
    <div className="grid-2">
      <Card title="Stammdaten" kicker="Objekt" className="span-2-md">
        <div className="form-grid">
          <Field label="Objektname" wide>
            <Text value={o.name} onChange={(v) => set("name", v)} />
          </Field>
          <Field label="Straße, Nr.">
            <Text value={o.adresse} onChange={(v) => set("adresse", v)} />
          </Field>
          <Field label="PLZ">
            <Text value={o.plz} onChange={(v) => set("plz", v)} />
          </Field>
          <Field label="Ort">
            <Text value={o.ort} onChange={(v) => set("ort", v)} />
          </Field>
          <Field label="Bundesland" hint={`GrESt ${((GREST[o.bundesland] ?? 0) * 100).toLocaleString("de-DE")} %`}>
            <Select
              value={o.bundesland}
              options={Object.keys(GREST)}
              onChange={(v) =>
                update((d) => {
                  d.objekt.bundesland = v;
                  if (GREST[v] != null) d.pricing.grest = GREST[v];
                })
              }
            />
          </Field>
          <Field label="Objektart">
            <Select value={o.objektart} options={OBJEKTARTEN} onChange={(v) => set("objektart", v)} />
          </Field>
          <Field label="Baujahr">
            <Text value={o.baujahr} onChange={(v) => set("baujahr", v)} />
          </Field>
          <Field label="Modernisierung">
            <Text value={o.modernisierung} onChange={(v) => set("modernisierung", v)} />
          </Field>
          <Field label="Geschosse">
            <Text value={o.geschosse} onChange={(v) => set("geschosse", v)} />
          </Field>
          <Field label="Grundstück">
            <Num value={o.grundstueck} kind="m2" onChange={(v) => set("grundstueck", v ?? 0)} />
          </Field>
          <Field label="BGF">
            <Num value={o.bgf} kind="m2" onChange={(v) => set("bgf", v ?? 0)} />
          </Field>
          <Field label="Stellplätze">
            <Num value={o.stellplaetze} kind="num" dec={0} onChange={(v) => set("stellplaetze", v ?? 0)} />
          </Field>
          <Field label="Energieklasse">
            <Text value={o.energieklasse} onChange={(v) => set("energieklasse", v)} />
          </Field>
          <Field label="Eigentümer">
            <Text value={o.eigentuemer} onChange={(v) => set("eigentuemer", v)} />
          </Field>
          <Field label="Verkäufer / Abgeber">
            <Text value={o.verkaeufer} onChange={(v) => set("verkaeufer", v)} />
          </Field>
          <Field label="Bewertungsstichtag" hint="Basis für Restlaufzeiten und Cashflow">
            <DateIn value={deal.stichtag} onChange={(v) => v && update((d) => void (d.stichtag = v))} />
          </Field>
          <div className="field toggles">
            <Toggle checked={o.erbbaurecht} onChange={(v) => set("erbbaurecht", v)} label="Erbbaurecht" />
            <Toggle checked={o.denkmal} onChange={(v) => set("denkmal", v)} label="Denkmalschutz" />
          </div>
          <Field label="Lage" wide>
            <Text multiline value={o.lage} onChange={(v) => set("lage", v)} />
          </Field>
          <Field label="Objektbeschreibung" wide>
            <Text multiline value={o.beschreibung} onChange={(v) => set("beschreibung", v)} />
          </Field>
        </div>
      </Card>

      <div className="stack">
        <Card title="Unterlagen einlesen" kicker="Import" tone="walnut">
          <p className="muted-inv">Exposé, Mieterliste (Excel/PDF), Teaser, E-Mail-Text oder Foto: Das Tool erkennt Flächen, Mieten, Laufzeiten und Objektdaten und schlägt sie zur Prüfung vor.</p>
          <button className="btn btn-brass" onClick={onImport}>
            <Icon name="upload" /> Datei oder Text importieren
          </button>
        </Card>
        <Card title="Angaben laut Unterlagen" kicker="Abgleich">
          <p className="muted small">Werden mit der Summe der Mieterliste verglichen, um Lese- oder Erfassungsfehler zu finden.</p>
          <div className="form-grid">
            <Field label="Mietfläche gesamt">
              <Num value={o.angabeFlaeche} kind="m2" nullable onChange={(v) => set("angabeFlaeche", v)} />
            </Field>
            <Field label="Jahresmiete gesamt">
              <Num value={o.angabeJahresmiete} kind="eur" nullable onChange={(v) => set("angabeJahresmiete", v)} />
            </Field>
            <Field label="Kaufpreis lt. Exposé">
              <Num value={o.angabeKaufpreis} kind="eur" nullable onChange={(v) => set("angabeKaufpreis", v)} />
            </Field>
          </div>
        </Card>
        <Card title="Plausibilitätsprüfung" kicker={`${warn.filter((w) => w.level !== "ok").length} Hinweise`}>
          <ul className="checks">
            {warn.length === 0 && (
              <li className="ok">
                <Icon name="check" size={15} /> Keine Auffälligkeiten
              </li>
            )}
            {warn.map((w, i) => (
              <li key={i} className={w.level}>
                <Icon name={w.level === "ok" ? "check" : "alert"} size={15} /> {w.text}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
