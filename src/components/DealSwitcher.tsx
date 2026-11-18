"use client";
import { useEffect, useRef, useState } from "react";
import type { useDeals } from "@/lib/store";
import { migrate } from "@/lib/store";
import type { Deal } from "@/lib/model/types";
import { Icon } from "./ui";
import { fmtMio } from "@/lib/format";

export function DealSwitcher({ store, onNew, onSample }: { store: ReturnType<typeof useDeals>; onNew: () => void; onSample: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const loadJson = async (f: File) => {
    try {
      const d = migrate(JSON.parse(await f.text()) as Deal);
      d.id = d.id + "-" + Date.now().toString(36);
      store.add(d);
    } catch {
      alert("Datei konnte nicht gelesen werden.");
    }
  };
  return (
    <div className="switcher" ref={ref}>
      <button className="btn btn-glass switcher-btn" onClick={() => setOpen((o) => !o)}>
        <Icon name="file" />
        <span className="switcher-name">{store.deal?.objekt.name || "Objekt"}</span>
        <span className="switcher-count">{store.deals.length}</span>
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div className="switcher-menu">
          <div className="switcher-list">
            {store.deals.map((d) => (
              <div key={d.id} className={`switcher-item ${d.id === store.deal?.id ? "on" : ""}`}>
                <button
                  className="switcher-pick"
                  onClick={() => {
                    store.select(d.id);
                    setOpen(false);
                  }}
                >
                  <strong>{d.objekt.name || "Ohne Namen"}</strong>
                  <span>
                    {d.objekt.ort || "–"} · {fmtMio(d.pricing.kaufpreis)} · {d.units.length} Einheiten
                  </span>
                </button>
                <button
                  className="icon-btn"
                  title="Löschen"
                  onClick={() => {
                    if (confirm(`„${d.objekt.name}" löschen?`)) store.remove(d.id);
                  }}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="switcher-actions">
            <button className="btn btn-small" onClick={() => (onNew(), setOpen(false))}>
              <Icon name="plus" size={15} /> Neues Objekt
            </button>
            <button className="btn btn-small" onClick={() => (store.duplicate(), setOpen(false))}>
              <Icon name="copy" size={15} /> Duplizieren
            </button>
            <button className="btn btn-small" onClick={() => (onSample(), setOpen(false))}>
              Musterobjekt
            </button>
            <button className="btn btn-small" onClick={() => fileRef.current?.click()}>
              Projektdatei laden
            </button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && loadJson(e.target.files[0])} />
          </div>
        </div>
      )}
    </div>
  );
}
