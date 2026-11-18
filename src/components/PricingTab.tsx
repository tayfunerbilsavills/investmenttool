"use client";
import type { Deal } from "@/lib/model/types";
import { type Analysis, type PriceDriver, kaufpreisFrom } from "@/lib/model/calc";
import { fmtEur, fmtPct, fmtX, fmtMio } from "@/lib/format";
import { Card, Field, Num, Segmented, Slider, Stat, Icon } from "./ui";

type Upd = (fn: (d: Deal) => void) => void;

export function PricingTab({ deal, a, update }: { deal: Deal; a: Analysis; update: Upd }) {
  const { s, p, cf } = a;
  const setBy = (driver: PriceDriver, v: number) =>
    update((d) => {
      const kp = kaufpreisFrom(d, driver, v);
      if (kp != null && Number.isFinite(kp)) d.pricing.kaufpreis = Math.round(kp * 100) / 100;
    });

  // Stabile Reglerbereiche: hängen nur von Miete/Fläche ab, nicht vom Kaufpreis
  const rentBase = Math.max(s.istMieteJahr, s.potenzialJahr * 0.5, 1);
  const kpMax = Math.max(rentBase * 45, deal.pricing.kaufpreis * 1.25, 1_000_000);
  const qmMax = s.flaecheM2 > 0 ? kpMax / s.flaecheM2 : 10_000;
  const potenzial = deal.pricing.basis === "potenzial";
  const vkShare = s.vk.summe;

  return (
    <div className="stack">
      <div className="grid-2">
        <Card title="Kaufpreis, Faktor und Renditen" kicker="Alle Regler sind gekoppelt" className="span-2-md">
          <div className="basis-row">
            <span className="muted small">Faktor bezogen auf</span>
            <Segmented
              value={deal.pricing.basis}
              onChange={(v) => update((d) => void (d.pricing.basis = v))}
              options={[
                { value: "ist", label: "Ist-Miete" },
                { value: "potenzial", label: "Potenzialmiete − Vermietungskosten" },
              ]}
            />
          </div>
          <div className="sliders">
            <Slider label="Kaufpreis netto" kind="eur" value={p.kaufpreis} min={0} max={kpMax} step={Math.max(1000, Math.round(kpMax / 2000 / 1000) * 1000)} onChange={(v) => setBy("kaufpreis", v)} accent />
            <Slider
              label={potenzial ? "Faktor (Potenzial, inkl. Vermietungskosten)" : "Faktor (Ist-Miete)"}
              kind="x"
              value={p.faktor}
              min={potenzial ? 5 : 5}
              max={45}
              step={0.05}
              disabled={potenzial ? s.potenzialJahr <= 0 : s.istMieteJahr <= 0}
              hint={potenzial ? `Kaufpreis = Faktor × ${fmtEur(s.potenzialJahr)} − ${fmtEur(vkShare)} Vermietungskosten` : `Kaufpreis = Faktor × ${fmtEur(s.istMieteJahr)} Ist-Miete`}
              onChange={(v) => setBy("faktor", v)}
            />
            <Slider label="Kaufpreis je m²" kind="eur" value={p.preisQm} min={0} max={qmMax} step={5} disabled={s.flaecheM2 <= 0} hint={`${fmtEur(s.flaecheM2, 0).replace(" €", "")} m² Mietfläche`} onChange={(v) => setBy("preisQm", v)} />
            <Slider label="Bruttoanfangsrendite (Ist)" kind="pct" value={p.bar} min={0.01} max={0.15} step={0.0005} disabled={s.istMieteJahr <= 0} onChange={(v) => setBy("bar", v)} />
            <Slider label="Nettoanfangsrendite (NIY)" kind="pct" value={p.niy} min={0.005} max={0.12} step={0.0005} disabled={p.noiIst <= 0} hint="NOI Ist ÷ (Kaufpreis + Nebenkosten)" onChange={(v) => setBy("niy", v)} />
          </div>
          <div className="stats-row compact">
            <Stat label="Faktor Ist" value={fmtX(p.faktorIst)} />
            <Stat label="Faktor Potenzial" value={fmtX(p.faktorPotenzial)} sub="inkl. Vermietungskosten" />
            <Stat label="BAR Potenzial" value={fmtPct(p.barPotenzial)} />
            <Stat label="Gesamtinvestition" value={fmtMio(p.gesamtinvest)} sub="KP + NK + Ausbau Leerstand" />
          </div>
        </Card>

        <Card title="Kaufpreisherleitung" kicker="Faktormethode mit Abzug der Vermietungskosten" tone="walnut">
          <div className="waterfall">
            <Row label="Potenzialmiete p.a." value={fmtEur(s.potenzialJahr)} />
            <div className="wf-row">
              <span>× Zielfaktor</span>
              <Num value={deal.bov.zielfaktor} kind="x" onChange={(v) => v != null && update((d) => void (d.bov.zielfaktor = v))} />
            </div>
            <Row label="= Wert vollvermietet" value={fmtEur(deal.bov.zielfaktor * s.potenzialJahr)} strong />
            <Row label="− Ausbau Leerstand" value={fmtEur(-s.vk.umbau)} neg />
            <Row label="− Makler Erstvermietung" value={fmtEur(-s.vk.makler)} neg />
            <Row label="− Mietfreie Zeit" value={fmtEur(-s.vk.mietfrei)} neg />
            <Row label="− Mietausfall bis Vermietung" value={fmtEur(-s.vk.mietverlust)} neg />
            <Row label="− NK im Leerstand" value={fmtEur(-s.vk.leerNk)} neg />
            <Row label="= Kaufpreis (Faktormethode)" value={fmtEur(a.kaufpreisFaktormethode)} strong big />
            <Row label="entspricht Faktor auf Ist-Miete" value={fmtX(s.istMieteJahr ? a.kaufpreisFaktormethode / s.istMieteJahr : 0)} />
          </div>
          <div className="btn-row">
            <button className="btn btn-brass" onClick={() => update((d) => void (d.pricing.kaufpreis = Math.round(a.kaufpreisFaktormethode)))}>
              <Icon name="check" size={15} /> Als Kaufpreis übernehmen
            </button>
            <button className="btn btn-glass" title={`Kaufpreis, bei dem die IRR dem Diskontierungszins von ${fmtPct(deal.dcf.diskontsatz)} entspricht`} onClick={() => update((d) => void (d.pricing.kaufpreis = Math.max(0, Math.round(cf.kaufpreisMaxDcf))))}>
              DCF-Wert übernehmen ({fmtMio(cf.kaufpreisMaxDcf)})
            </button>
          </div>
        </Card>
      </div>

      <div className="grid-3">
        <Card title="Erwerbsnebenkosten" kicker={`${fmtPct(p.nkQuote)} · ${fmtEur(p.nk)}`}>
          <div className="form-grid two">
            <Field label="Grunderwerbsteuer" hint={deal.objekt.bundesland}>
              <Num value={deal.pricing.grest} kind="pct" onChange={(v) => update((d) => void (d.pricing.grest = v ?? 0))} />
            </Field>
            <Field label="Notar / Grundbuch">
              <Num value={deal.pricing.notar} kind="pct" onChange={(v) => update((d) => void (d.pricing.notar = v ?? 0))} />
            </Field>
            <Field label="Makler">
              <Num value={deal.pricing.makler} kind="pct" onChange={(v) => update((d) => void (d.pricing.makler = v ?? 0))} />
            </Field>
            <Field label="Sonstige (DD, Beratung)">
              <Num value={deal.pricing.sonstigeNk} kind="pct" onChange={(v) => update((d) => void (d.pricing.sonstigeNk = v ?? 0))} />
            </Field>
            <Field label="Sofort-Capex" hint="zusätzlich zum Ausbau Leerstand" wide>
              <Num value={deal.pricing.capexSofort} kind="eur" onChange={(v) => update((d) => void (d.pricing.capexSofort = v ?? 0))} />
            </Field>
          </div>
          <dl className="dl">
            <dt>Kaufpreis</dt>
            <dd>{fmtEur(p.kaufpreis)}</dd>
            <dt>+ Nebenkosten</dt>
            <dd>{fmtEur(p.nk)}</dd>
            <dt>+ Ausbau Leerstand</dt>
            <dd>{fmtEur(s.vk.umbau)}</dd>
            <dt>+ Sofort-Capex</dt>
            <dd>{fmtEur(deal.pricing.capexSofort)}</dd>
            <dt className="total">Gesamtinvestition</dt>
            <dd className="total">{fmtEur(p.gesamtinvest)}</dd>
          </dl>
        </Card>

        <Card title="Bewirtschaftung" kicker={`NOI Ist ${fmtEur(p.noiIst)}`}>
          <div className="form-grid two">
            <Field label="Verwaltung" hint="% der Miete">
              <Num value={deal.kosten.verwaltung} kind="pct" onChange={(v) => update((d) => void (d.kosten.verwaltung = v ?? 0))} />
            </Field>
            <Field label="Mietausfallwagnis" hint="% der Miete">
              <Num value={deal.kosten.mietausfall} kind="pct" onChange={(v) => update((d) => void (d.kosten.mietausfall = v ?? 0))} />
            </Field>
            <Field label="Nicht umlagefähig" hint="% der Miete">
              <Num value={deal.kosten.nichtUmlagefaehig} kind="pct" onChange={(v) => update((d) => void (d.kosten.nichtUmlagefaehig = v ?? 0))} />
            </Field>
            <Field label="Instandhaltung" hint="€/m² p.a.">
              <Num value={deal.kosten.instandhaltung} kind="eur" dec={2} onChange={(v) => update((d) => void (d.kosten.instandhaltung = v ?? 0))} />
            </Field>
          </div>
          <dl className="dl">
            <dt>Ist-Miete p.a.</dt>
            <dd>{fmtEur(s.istMieteJahr)}</dd>
            <dt>− Bewirtschaftung (%)</dt>
            <dd>{fmtEur(-s.istMieteJahr * (deal.kosten.verwaltung + deal.kosten.mietausfall + deal.kosten.nichtUmlagefaehig))}</dd>
            <dt>− Instandhaltung</dt>
            <dd>{fmtEur(-deal.kosten.instandhaltung * s.flaecheM2)}</dd>
            <dt>− NK Leerstand p.a.</dt>
            <dd>{fmtEur(-(s.istMieteJahr * (1 - deal.kosten.verwaltung - deal.kosten.mietausfall - deal.kosten.nichtUmlagefaehig) - deal.kosten.instandhaltung * s.flaecheM2 - p.noiIst))}</dd>
            <dt className="total">NOI Ist</dt>
            <dd className="total">{fmtEur(p.noiIst)}</dd>
            <dt className="muted">Kostenquote</dt>
            <dd className="muted">{fmtPct(s.istMieteJahr ? 1 - p.noiIst / s.istMieteJahr : 0, 1)}</dd>
          </dl>
        </Card>

        <Card title="Bewertung im Vergleich" kicker="Kaufpreis vs. Wertansätze" tone="plaster">
          <Compare label="Kaufpreis (Ansatz)" value={p.kaufpreis} max={Math.max(p.kaufpreis, a.kaufpreisFaktormethode, cf.kaufpreisMaxDcf, deal.objekt.angabeKaufpreis ?? 0)} accent />
          <Compare label="Faktormethode" value={a.kaufpreisFaktormethode} max={Math.max(p.kaufpreis, a.kaufpreisFaktormethode, cf.kaufpreisMaxDcf, deal.objekt.angabeKaufpreis ?? 0)} />
          <Compare label={`DCF @ ${fmtPct(deal.dcf.diskontsatz)}`} value={cf.kaufpreisMaxDcf} max={Math.max(p.kaufpreis, a.kaufpreisFaktormethode, cf.kaufpreisMaxDcf, deal.objekt.angabeKaufpreis ?? 0)} />
          {deal.objekt.angabeKaufpreis ? <Compare label="Exposé / Preisvorstellung" value={deal.objekt.angabeKaufpreis} max={Math.max(p.kaufpreis, a.kaufpreisFaktormethode, cf.kaufpreisMaxDcf, deal.objekt.angabeKaufpreis)} /> : null}
          <p className="muted small">
            Der DCF-Wert ist der Kaufpreis netto, bei dem der Kapitalwert zum Diskontierungszins null ist (IRR = {fmtPct(deal.dcf.diskontsatz)}).
          </p>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, strong, neg, big }: { label: string; value: string; strong?: boolean; neg?: boolean; big?: boolean }) {
  return (
    <div className={`wf-row ${strong ? "strong" : ""} ${neg ? "wf-neg" : ""} ${big ? "big" : ""}`}>
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}

function Compare({ label, value, max, accent }: { label: string; value: number; max: number; accent?: boolean }) {
  return (
    <div className={`cmp ${accent ? "accent" : ""}`}>
      <div className="cmp-top">
        <span>{label}</span>
        <strong className="tnum">{fmtMio(value)}</strong>
      </div>
      <div className="cmp-bar">
        <i style={{ width: `${max > 0 ? Math.max(0, (value / max) * 100) : 0}%` }} />
      </div>
    </div>
  );
}
