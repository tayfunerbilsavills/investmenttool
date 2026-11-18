"use client";
import { useEffect, useRef, useState } from "react";
import type { Deal } from "@/lib/model/types";
import type { Analysis } from "@/lib/model/calc";
import { Icon } from "./ui";

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 4000);
}

function slug(s: string) {
  // Nur ASCII: Umlaute im download-Attribut verwerfen manche Browser
  const t = (s || "Objekt")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[^\w\- ]+/g, "");
  return t.trim().replace(/\s+/g, "_").slice(0, 60) || "Objekt";
}

export function ExportMenu({ deal }: { deal: Deal; analysis: Analysis }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const date = new Date().toISOString().slice(0, 10);
  const xlsx = async () => {
    setBusy(true);
    try {
      const { exportXlsx } = await import("@/lib/export/excel");
      save(await exportXlsx(deal), `${slug(deal.objekt.name)}_Investment_${date}.xlsx`);
    } catch (e) {
      console.error(e);
      alert("Excel-Export fehlgeschlagen.");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };
  return (
    <div className="switcher" ref={ref}>
      <button className="btn btn-brass" onClick={() => setOpen((o) => !o)} disabled={busy}>
        <Icon name="download" /> {busy ? "Erzeuge…" : "Export"}
      </button>
      {open && (
        <div className="switcher-menu right">
          <button className="menu-item" onClick={xlsx}>
            <strong>Excel-Modell (.xlsx)</strong>
            <span>8 Reiter, echte Formeln, benannte Zellen, Formatierung</span>
          </button>
          <button
            className="menu-item"
            onClick={() => {
              save(new Blob([JSON.stringify(deal, null, 2)], { type: "application/json" }), `${slug(deal.objekt.name)}_${date}.json`);
              setOpen(false);
            }}
          >
            <strong>Projektdatei (.json)</strong>
            <span>Zum Weitergeben oder Sichern; über „Projektdatei laden" wieder öffnen</span>
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false);
              setTimeout(() => window.print(), 50);
            }}
          >
            <strong>Drucken / PDF</strong>
            <span>Aktuelle Ansicht – im Reiter BOV als Bewertungsbericht</span>
          </button>
        </div>
      )}
    </div>
  );
}
