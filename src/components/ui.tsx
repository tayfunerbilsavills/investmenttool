"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { parseNumber } from "@/lib/import/parse";

type NumKind = "eur" | "num" | "pct" | "x" | "m2" | "yrs" | "mon";

const SUFFIX: Record<NumKind, string> = { eur: "€", num: "", pct: "%", x: "x", m2: "m²", yrs: "J.", mon: "Mon." };

function display(v: number | null | undefined, kind: NumKind, dec: number) {
  if (v == null || !Number.isFinite(v)) return "";
  const x = kind === "pct" ? v * 100 : v;
  return x.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Zahlenfeld: zeigt deutsch formatiert, übernimmt beim Verlassen/Enter. */
export function Num({
  value,
  onChange,
  kind = "num",
  dec,
  placeholder,
  suffix,
  className = "",
  nullable = false,
  min,
  title,
  disabled,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  kind?: NumKind;
  dec?: number;
  placeholder?: string;
  suffix?: string;
  className?: string;
  nullable?: boolean;
  min?: number;
  title?: string;
  disabled?: boolean;
}) {
  const d = dec ?? (kind === "eur" ? 0 : kind === "pct" || kind === "x" ? 2 : kind === "m2" ? 0 : 2);
  const [text, setText] = useState(display(value, kind, d));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(display(value, kind, d));
  }, [value, kind, d, focus]);
  const commit = () => {
    const t = text.trim();
    if (!t) {
      if (nullable) onChange(null);
      else setText(display(value, kind, d));
      return;
    }
    let n = parseNumber(t);
    if (n == null) {
      setText(display(value, kind, d));
      return;
    }
    if (kind === "pct") n = n / 100;
    if (min != null) n = Math.max(min, n);
    onChange(n);
  };
  return (
    <span className={`num ${className}`} title={title}>
      <input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={(e) => {
          setFocus(true);
          e.target.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setFocus(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(display(value, kind, d));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {(suffix ?? SUFFIX[kind]) && <em>{suffix ?? SUFFIX[kind]}</em>}
    </span>
  );
}

export function Text({ value, onChange, placeholder, className = "", multiline = false }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; multiline?: boolean }) {
  if (multiline)
    return <textarea className={`txt ${className}`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={3} />;
  return <input className={`txt ${className}`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function DateIn({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="date" className="txt date" value={value || ""} onChange={(e) => onChange(e.target.value)} />;
}

export function Select({ value, onChange, options, className = "" }: { value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[]; className?: string }) {
  return (
    <select className={`sel ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

export function Field({ label, children, hint, wide }: { label: string; children: ReactNode; hint?: string; wide?: boolean }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Card({ title, kicker, children, actions, className = "", tone }: { title?: string; kicker?: string; children: ReactNode; actions?: ReactNode; className?: string; tone?: "walnut" | "olive" | "brass" | "plaster" }) {
  return (
    <section className={`card ${tone ? `tone-${tone}` : ""} ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {kicker && <div className="kicker">{kicker}</div>}
            {title && <h3>{title}</h3>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone, big }: { label: string; value: string; sub?: string; tone?: "pos" | "neg" | "brass"; big?: boolean }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ""} ${big ? "stat-big" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Regler mit Zahlenfeld. Der Bereich wandert mit dem Wert mit, damit man nie
 * am Rand hängen bleibt; `onChange` liefert den neuen Wert der Kennzahl, die
 * aufrufende Stelle rechnet ihn in den Kaufpreis zurück.
 */
export function Slider({
  label,
  value,
  onChange,
  kind,
  min,
  max,
  step,
  disabled,
  hint,
  dec,
  accent,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  kind: NumKind;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  hint?: string;
  dec?: number;
  accent?: boolean;
}) {
  const [range, setRange] = useState<[number, number]>([min, max]);
  const dragging = useRef(false);
  useEffect(() => {
    if (dragging.current) return;
    setRange([min, max]);
  }, [min, max]);
  const v = Number.isFinite(value) ? value : range[0];
  const pct = ((Math.min(range[1], Math.max(range[0], v)) - range[0]) / (range[1] - range[0] || 1)) * 100;
  return (
    <div className={`slider ${disabled ? "disabled" : ""} ${accent ? "accent" : ""}`}>
      <div className="slider-top">
        <span className="slider-label">{label}</span>
        <Num value={Number.isFinite(value) ? value : null} onChange={(n) => n != null && onChange(n)} kind={kind} dec={dec} disabled={disabled} />
      </div>
      <input
        type="range"
        min={range[0]}
        max={range[1]}
        step={step}
        value={v}
        disabled={disabled}
        style={{ ["--p" as string]: `${pct}%` }}
        onPointerDown={() => (dragging.current = true)}
        onPointerUp={() => (dragging.current = false)}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      {hint && <div className="slider-hint">{hint}</div>}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" | "error" | "ok" | "brass" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const p: Record<string, ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9" />,
    building: <path d="M4 21V5l8-3 8 3v16M9 21v-4h6v4M8 8h2M14 8h2M8 12h2M14 12h2" />,
    users: <path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M21 19v-1a4 4 0 0 0-3-3.8M16 4.2a3 3 0 0 1 0 5.6" />,
    tag: <path d="M3 12V3h9l9 9-9 9-9-9ZM7.5 7.5h.01" />,
    flow: <path d="M3 17l5-5 4 4 8-8M15 8h5v5" />,
    grid: <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
    award: <path d="M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM8.5 14 7 22l5-3 5 3-1.5-8" />,
    upload: <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />,
    download: <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />,
    plus: <path d="M12 5v14M5 12h14" />,
    trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
    copy: <path d="M8 8h12v12H8zM4 16V4h12" />,
    check: <path d="m5 12 5 5L20 7" />,
    alert: <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
    sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    print: <path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M6 14h12v7H6z" />,
    file: <path d="M14 3H6v18h12V7l-4-4ZM14 3v4h4" />,
    chevron: <path d="m6 9 6 6 6-6" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p[name]}
    </svg>
  );
}
