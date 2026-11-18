"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDeals } from "@/lib/store";
import { analyze, checks } from "@/lib/model/calc";
import { emptyDeal, sampleDeal } from "@/lib/model/defaults";
import { Icon } from "@/components/ui";
import { fmtMio, fmtX, fmtPct, fmtNum } from "@/lib/format";
import { KpiBar } from "@/components/KpiBar";
import { ObjektTab } from "@/components/ObjektTab";
import { MieterTab } from "@/components/MieterTab";
import { PricingTab } from "@/components/PricingTab";
import { CashflowTab } from "@/components/CashflowTab";
import { SensTab } from "@/components/SensTab";
import { BovTab } from "@/components/BovTab";
import { ImportDialog } from "@/components/ImportDialog";
import { ExportMenu } from "@/components/ExportMenu";
import { DealSwitcher } from "@/components/DealSwitcher";

const TABS = [
  { id: "objekt", label: "Objekt", icon: "building" },
  { id: "mieter", label: "Vermietung", icon: "users" },
  { id: "pricing", label: "Pricing", icon: "tag" },
  { id: "cashflow", label: "Cashflow", icon: "flow" },
  { id: "sens", label: "Sensitivität", icon: "grid" },
  { id: "bov", label: "BOV", icon: "award" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Page() {
  const store = useDeals();
  const { deal, update, ready } = store;
  const [tab, setTab] = useState<TabId>("pricing");
  const [importOpen, setImportOpen] = useState(false);
  const headRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { threshold: 0, rootMargin: "-40px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ready]);
  const analysis = useMemo(() => (deal ? analyze(deal) : null), [deal]);
  const warn = useMemo(() => (deal ? checks(deal, analysis?.s) : []), [deal, analysis]);

  if (!ready || !deal || !analysis)
    return (
      <main className="loading">
        <div className="brand-mark">S</div>
      </main>
    );

  const idx = TABS.findIndex((t) => t.id === tab);
  return (
    <div className="app">
      <header className="masthead" ref={headRef}>
        <div className="masthead-inner">
          <div className="brand">
            <span className="brand-mark">S</span>
            <div>
              <div className="brand-name">Investment Tool</div>
              <div className="brand-sub">Ankaufsprüfung · DCF · BOV</div>
            </div>
          </div>
          <DealSwitcher store={store} onNew={() => store.add(emptyDeal())} onSample={() => store.add(sampleDeal())} />
          <div className="masthead-actions">
            <button className="btn btn-glass" onClick={() => setImportOpen(true)}>
              <Icon name="upload" /> <span className="lbl">Import</span>
            </button>
            <ExportMenu deal={deal} analysis={analysis} />
          </div>
        </div>
        <div className="object-title">
          <div className="kicker">{[deal.objekt.objektart, deal.objekt.ort].filter(Boolean).join(" · ") || "Objekt"}</div>
          <h1>{deal.objekt.name || "Neues Objekt"}</h1>
          <div className="object-addr">{[deal.objekt.adresse, [deal.objekt.plz, deal.objekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>
        </div>
        <KpiBar a={analysis} deal={deal} />
      </header>

      <div className={`mini-kpi ${scrolled ? "show" : ""}`} aria-hidden>
        <span>
          <em>KP</em>
          {fmtMio(analysis.p.kaufpreis)}
        </span>
        <span>
          <em>Faktor</em>
          {fmtX(analysis.p.faktorIst)}
        </span>
        <span>
          <em>IRR</em>
          {fmtPct(analysis.cf.irr)}
        </span>
        <span>
          <em>WALT</em>
          {fmtNum(analysis.s.walt, 1)}
        </span>
      </div>

      <nav className="glassnav" aria-label="Bereiche">
        <div className="glassnav-track" style={{ ["--i" as string]: idx, ["--n" as string]: TABS.length }}>
          <span className="glassnav-spot" aria-hidden />
          {TABS.map((t) => (
            <button key={t.id} className={t.id === tab ? "on" : ""} onClick={() => {
                setTab(t.id);
                if (window.matchMedia("(max-width: 760px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
              }}>
              <Icon name={t.icon} size={17} />
              <span>{t.label}</span>
              {t.id === "objekt" && warn.some((w) => w.level === "error") && <i className="dot" />}
            </button>
          ))}
        </div>
      </nav>

      <main className="content">
        {tab === "objekt" && <ObjektTab deal={deal} update={update} warn={warn} onImport={() => setImportOpen(true)} />}
        {tab === "mieter" && <MieterTab deal={deal} a={analysis} update={update} warn={warn} onImport={() => setImportOpen(true)} />}
        {tab === "pricing" && <PricingTab deal={deal} a={analysis} update={update} />}
        {tab === "cashflow" && <CashflowTab deal={deal} a={analysis} update={update} />}
        {tab === "sens" && <SensTab deal={deal} a={analysis} />}
        {tab === "bov" && <BovTab deal={deal} a={analysis} update={update} />}
      </main>

      <footer className="foot">
        Alle Werte werden lokal im Browser gespeichert · Rechenkern geprüft gegen Excel-Formeln · v3.0
      </footer>

      {importOpen && <ImportDialog deal={deal} onClose={() => setImportOpen(false)} onApply={(d) => { store.replace(d); setImportOpen(false); setTab("mieter"); }} />}
    </div>
  );
}
