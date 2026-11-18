"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Deal } from "./model/types";
import { emptyDeal, sampleDeal, uid, NUTZUNG_DEFAULTS } from "./model/defaults";

const KEY = "investmenttool.deals.v3";
const CUR = "investmenttool.current.v3";

function load(): Deal[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Deal[];
    return Array.isArray(arr) ? arr.map(migrate) : [];
  } catch {
    return [];
  }
}

/** Fehlende Felder aus älteren Ständen mit Vorgaben auffüllen. */
export function migrate(d: Deal): Deal {
  const base = emptyDeal();
  const out: Deal = {
    ...base,
    ...d,
    objekt: { ...base.objekt, ...d.objekt },
    pricing: { ...base.pricing, ...d.pricing },
    kosten: { ...base.kosten, ...d.kosten },
    dcf: { ...base.dcf, ...d.dcf },
    finanzierung: { ...base.finanzierung, ...d.finanzierung },
    bov: { ...base.bov, ...d.bov },
    nutzungen: { ...structuredClone(NUTZUNG_DEFAULTS), ...d.nutzungen },
    units: (d.units ?? []).map((u) => ({ ...u, id: u.id || uid() })),
    version: 3,
  };
  return out;
}

export function useDeals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let list = load();
    if (!list.length) list = [sampleDeal()];
    setDeals(list);
    let cur = "";
    try {
      cur = localStorage.getItem(CUR) || "";
    } catch {}
    setCurrentId(list.some((d) => d.id === cur) ? cur : list[0].id);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(deals));
        localStorage.setItem(CUR, currentId);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [deals, currentId, ready]);

  const deal = useMemo(() => deals.find((d) => d.id === currentId) ?? deals[0], [deals, currentId]);

  const update = useCallback(
    (fn: (d: Deal) => void) => {
      setDeals((list) =>
        list.map((d) => {
          if (d.id !== (currentId || list[0]?.id)) return d;
          const c = structuredClone(d);
          fn(c);
          c.updated = new Date().toISOString();
          return c;
        }),
      );
    },
    [currentId],
  );

  const replace = useCallback((next: Deal) => setDeals((list) => list.map((d) => (d.id === next.id ? next : d))), []);

  const add = useCallback((d: Deal = emptyDeal()) => {
    setDeals((list) => [d, ...list]);
    setCurrentId(d.id);
  }, []);

  const duplicate = useCallback(() => {
    if (!deal) return;
    const c = structuredClone(deal);
    c.id = uid();
    c.objekt.name = `${c.objekt.name} (Kopie)`;
    c.created = c.updated = new Date().toISOString();
    setDeals((list) => [c, ...list]);
    setCurrentId(c.id);
  }, [deal]);

  const remove = useCallback(
    (id: string) => {
      setDeals((list) => {
        const next = list.filter((d) => d.id !== id);
        const safe = next.length ? next : [emptyDeal()];
        if (id === currentId) setCurrentId(safe[0].id);
        return safe;
      });
    },
    [currentId],
  );

  return { deals, deal, ready, update, replace, add, duplicate, remove, select: setCurrentId };
}
