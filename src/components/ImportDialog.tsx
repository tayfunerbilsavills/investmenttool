"use client";
import { useRef, useState } from "react";
import type { Deal } from "@/lib/model/types";
import type { Extracted } from "@/lib/import/extractFile";
import { applyProposal, buildProposal, type Proposal } from "@/lib/import/merge";
import type { AiExtraction } from "@/app/api/extract/route";
import { fmtEur, fmtNum, fmtDate, fmtM2 } from "@/lib/format";
import { Badge, Icon, Segmented, Toggle } from "./ui";
import { useMobile } from "@/lib/useMobile";

type Stage = "input" | "busy" | "review";

export function ImportDialog({ deal, onClose, onApply }: { deal: Deal; onClose: () => void; onApply: (d: Deal) => void }) {
  const [stage, setStage] = useState<Stage>("input");
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [status, setStatus] = useState("");
  const [aiError, setAiError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [unitChoice, setUnitChoice] = useState(0);
  const [mode, setMode] = useState<"replace" | "append">(deal.units.length ? "replace" : "replace");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    setStage("busy");
    setAiError("");
    try {
      const { extractFile } = await import("@/lib/import/extractFile");
      const ex: Extracted[] = [];
      for (const f of files) {
        setStatus(`Lese ${f.name} …`);
        ex.push(await extractFile(f));
      }
      if (text.trim()) ex.push({ fileName: "Eingefügter Text", kind: "text", text, tables: [] });
      let ai: AiExtraction | null = null;
      if (useAi && ex.length) {
        setStatus("KI liest Flächen, Mieten und Laufzeiten …");
        const single = ex.length === 1 ? ex[0] : null;
        const body = {
          fileName: ex.map((e) => e.fileName).join(", "),
          text: ex.map((e) => `===== ${e.fileName} =====\n${e.text}`).join("\n\n"),
          attachment: single?.attachment ?? ex.find((e) => e.attachment && e.kind === "image")?.attachment,
        };
        try {
          const res = await fetch("/api/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
          const json = await res.json();
          if (!res.ok) setAiError(json.error || `Fehler ${res.status}`);
          else ai = json.data as AiExtraction;
        } catch {
          setAiError("KI nicht erreichbar – regelbasierte Erkennung wird verwendet.");
        }
      }
      setStatus("Abgleich …");
      const p = buildProposal(ex, ai);
      setProposal(p);
      setUnitChoice(0);
      setStage("review");
    } catch (e) {
      console.error(e);
      setAiError("Datei konnte nicht gelesen werden.");
      setStage("input");
    }
  };

  const onDrop = (list: FileList | null) => {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list)]);
  };

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <header className="modal-head">
          <div>
            <div className="kicker">Import</div>
            <h3>Unterlagen einlesen</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            <Icon name="x" />
          </button>
        </header>

        {stage === "input" && (
          <div className="modal-body">
            <div
              className={`drop ${drag ? "drag" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                onDrop(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
            >
              <Icon name="upload" size={28} />
              <strong>Dateien hierher ziehen oder klicken</strong>
              <span>Excel, CSV, PDF, Word, Bild (Foto einer Mieterliste), Text</span>
              <input ref={inputRef} type="file" multiple hidden accept=".xlsx,.xlsm,.xls,.ods,.csv,.tsv,.pdf,.docx,.txt,.eml,.md,.png,.jpg,.jpeg,.webp" onChange={(e) => onDrop(e.target.files)} />
            </div>
            {files.length > 0 && (
              <ul className="file-list">
                {files.map((f, i) => (
                  <li key={i}>
                    <Icon name="file" size={15} /> {f.name} <span className="muted">{Math.round(f.size / 1024)} KB</span>
                    <button className="icon-btn" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}>
                      <Icon name="x" size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="field wide">
              <span className="field-label">… oder Text einfügen (E-Mail, Exposé-Auszug, Mieterliste aus Excel kopiert)</span>
              <textarea className="txt" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Mieter\tFläche\tMiete p.a.\tMietende\nKanzlei Weber\t820\t169.248\t30.06.2028\n…"} />
            </label>
            <Toggle checked={useAi} onChange={setUseAi} label="KI-Auswertung zusätzlich (liest auch Fließtext, Scans und unübliche Tabellen)" />
            {aiError && <p className="error-text">{aiError}</p>}
            <footer className="modal-foot">
              <button className="btn" onClick={onClose}>
                Abbrechen
              </button>
              <button className="btn btn-brass" disabled={!files.length && !text.trim()} onClick={run}>
                <Icon name="sparkle" size={16} /> Auswerten
              </button>
            </footer>
          </div>
        )}

        {stage === "busy" && (
          <div className="modal-body center">
            <div className="spinner" />
            <p>{status}</p>
          </div>
        )}

        {stage === "review" && proposal && (
          <Review
            proposal={proposal}
            setProposal={setProposal}
            unitChoice={unitChoice}
            setUnitChoice={setUnitChoice}
            mode={mode}
            setMode={setMode}
            aiError={aiError}
            hasExisting={deal.units.length > 0}
            onBack={() => setStage("input")}
            onApply={() => onApply(applyProposal(deal, proposal, proposal.unitOptions.length ? unitChoice : null, mode))}
          />
        )}
      </div>
    </div>
  );
}

function Review({
  proposal,
  setProposal,
  unitChoice,
  setUnitChoice,
  mode,
  setMode,
  aiError,
  hasExisting,
  onBack,
  onApply,
}: {
  proposal: Proposal;
  setProposal: (p: Proposal) => void;
  unitChoice: number;
  setUnitChoice: (n: number) => void;
  mode: "replace" | "append";
  setMode: (m: "replace" | "append") => void;
  aiError: string;
  hasExisting: boolean;
  onBack: () => void;
  onApply: () => void;
}) {
  const opt = proposal.unitOptions[unitChoice];
  const mobile = useMobile();
  const sumM2 = opt ? opt.units.filter((u) => u.einheit !== "stk").reduce((x, u) => x + u.flaeche, 0) : 0;
  const sumAll = opt ? opt.units.reduce((x, u) => x + u.flaeche, 0) : 0;
  const sumM = opt ? opt.units.filter((u) => !u.leer).reduce((x, u) => x + u.mieteMonat * 12, 0) : 0;
  const angF = proposal.fields.find((f) => f.key === "angabeFlaeche")?.value as number | undefined;
  const angM = proposal.fields.find((f) => f.key === "angabeJahresmiete")?.value as number | undefined;
  const dev = (a: number, b?: number) => (b ? a / b - 1 : null);
  // Summenzeilen enthalten oft die Stellplatz-Stückzahl mit – dann gegen die Gesamtsumme abgleichen
  const sumF = angF && Math.abs(sumAll - angF) < Math.abs(sumM2 - angF) ? sumAll : sumM2;
  const dF = dev(sumF, angF);
  const dM = dev(sumM, angM);
  const toggleField = (i: number) => setProposal({ ...proposal, fields: proposal.fields.map((f, j) => (j === i ? { ...f, apply: !f.apply } : f)) });
  const useAlt = (i: number) =>
    setProposal({
      ...proposal,
      fields: proposal.fields.map((f, j) => (j === i && f.alt ? { ...f, value: f.alt.value, source: f.alt.source, alt: { value: f.value, source: f.source } } : f)),
    });
  const show = (v: string | number | boolean, key: string) =>
    typeof v === "boolean" ? (v ? "ja" : "nein") : typeof v === "number" ? (key.includes("miete") || key === "kaufpreis" ? fmtEur(v) : fmtNum(v, v % 1 ? 2 : 0)) : v;

  return (
    <div className="modal-body">
      {aiError && <p className="warn-text">KI: {aiError}</p>}
      <div className="review-grid">
        <section>
          <h4>Mieteinheiten</h4>
          {proposal.unitOptions.length === 0 ? (
            <p className="muted">Keine Mieterliste erkannt. Objektdaten können trotzdem übernommen werden.</p>
          ) : (
            <>
              {proposal.unitOptions.length > 1 && (
                <div className="unit-sources">
                  {proposal.unitOptions.map((u, i) => (
                    <button key={i} className={`src ${i === unitChoice ? "on" : ""}`} onClick={() => setUnitChoice(i)}>
                      <Badge tone={u.source === "KI" ? "brass" : "ok"}>{u.source}</Badge>
                      <strong>{u.label}</strong>
                      <span>{u.detail}</span>
                    </button>
                  ))}
                </div>
              )}
              {proposal.unitOptions.length === 1 && (
                <p className="muted small">
                  <Badge tone={opt.source === "KI" ? "brass" : "ok"}>{opt.source}</Badge> {opt.label} · {opt.detail}
                </p>
              )}
              <div className="recon">
                <div className={dF != null && Math.abs(dF) > 0.02 ? "bad" : dF != null ? "good" : ""}>
                  <span>Σ Fläche</span>
                  <strong>{fmtM2(sumF)}</strong>
                  {sumF !== sumM2 && <em>inkl. {fmtNum(sumAll - sumM2)} Stellplätze (Stk)</em>}
                  {angF ? <em>Angabe {fmtM2(angF)} ({dF! >= 0 ? "+" : ""}{fmtNum(dF! * 100, 1)} %)</em> : <em>keine Vergleichsangabe</em>}
                </div>
                <div className={dM != null && Math.abs(dM) > 0.02 ? "bad" : dM != null ? "good" : ""}>
                  <span>Σ Jahresmiete</span>
                  <strong>{fmtEur(sumM)}</strong>
                  {angM ? <em>Angabe {fmtEur(angM)} ({dM! >= 0 ? "+" : ""}{fmtNum(dM! * 100, 1)} %)</em> : <em>keine Vergleichsangabe</em>}
                </div>
                <div>
                  <span>Einheiten</span>
                  <strong>{opt.units.length}</strong>
                  <em>
                    {opt.units.filter((u) => u.leer).length} leer · {new Set(opt.units.map((u) => u.nutzung)).size} Nutzungsarten
                  </em>
                </div>
              </div>
              {mobile ? (
                <ul className="preview-m">
                  {opt.units.map((u) => (
                    <li key={u.id} className={u.leer ? "is-leer" : ""}>
                      <div>
                        <strong>{u.leer ? "Leerstand" : u.mieter || "–"}</strong>
                        <span>
                          {u.nutzung}
                          {u.geschoss ? ` · ${u.geschoss}` : ""}
                          {u.mietende ? ` · bis ${fmtDate(u.mietende)}` : u.leer ? "" : " · unbefristet"}
                        </span>
                      </div>
                      <div className="r">
                        <strong className="tnum">
                          {fmtNum(u.flaeche, u.flaeche % 1 ? 2 : 0)} {u.einheit === "stk" ? "Stk" : "m²"}
                        </strong>
                        <span className="tnum">{u.leer ? "leer" : `${fmtEur(u.mieteMonat, 2)} mtl. · ${u.flaeche ? fmtNum(u.mieteMonat / u.flaeche, 2) : "–"} €/m²`}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
              <div className="table-wrap preview">
                <table className="tbl small">
                  <thead>
                    <tr>
                      <th>Nutzung</th>
                      <th>Mieter</th>
                      <th>Geschoss</th>
                      <th className="r">Fläche</th>
                      <th className="r">Miete mtl.</th>
                      <th className="r">€/m²</th>
                      <th>Mietende</th>
                      <th>Option</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opt.units.map((u) => (
                      <tr key={u.id} className={u.leer ? "is-leer" : ""}>
                        <td>{u.nutzung}</td>
                        <td>{u.leer ? <em>Leerstand</em> : u.mieter}</td>
                        <td>{u.geschoss}</td>
                        <td className="r tnum">
                          {fmtNum(u.flaeche, u.flaeche % 1 ? 2 : 0)} {u.einheit === "stk" ? "Stk" : "m²"}
                        </td>
                        <td className="r tnum">{u.leer ? "–" : fmtEur(u.mieteMonat, 2)}</td>
                        <td className="r tnum">{u.leer || !u.flaeche ? "–" : fmtNum(u.mieteMonat / u.flaeche, 2)}</td>
                        <td>{u.mietende ? fmtDate(u.mietende) : u.leer ? "" : "unbefristet"}</td>
                        <td>{u.option ? fmtDate(u.option) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
              {hasExisting && (
                <div className="basis-row">
                  <span className="muted small">Bestehende Mieterliste</span>
                  <Segmented
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: "replace", label: "ersetzen" },
                      { value: "append", label: "ergänzen" },
                    ]}
                  />
                </div>
              )}
            </>
          )}
        </section>
        <section>
          <h4>Objektdaten</h4>
          {proposal.fields.length === 0 && <p className="muted">Keine Objektdaten erkannt.</p>}
          <ul className="field-props">
            {proposal.fields.map((f, i) => (
              <li key={f.key} className={f.apply ? "" : "off"}>
                <input type="checkbox" checked={f.apply} onChange={() => toggleField(i)} />
                <div>
                  <span className="fp-label">{f.label}</span>
                  <span className="fp-value">{show(f.value, f.key)}</span>
                  {f.alt && (
                    <button className="fp-alt" onClick={() => useAlt(i)} title="Andere Fundstelle verwenden">
                      ⇄ {f.alt.source}: {show(f.alt.value, f.key)}
                    </button>
                  )}
                </div>
                <Badge tone={f.source === "KI" ? "brass" : "ok"}>{f.source}</Badge>
              </li>
            ))}
          </ul>
          {proposal.hinweise.length > 0 && (
            <>
              <h4>Hinweise</h4>
              <ul className="checks">
                {proposal.hinweise.map((h, i) => (
                  <li key={i} className="warn">
                    <Icon name="alert" size={14} /> {h}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
      <footer className="modal-foot">
        <button className="btn" onClick={onBack}>
          Zurück
        </button>
        <button className="btn btn-brass" onClick={onApply}>
          <Icon name="check" size={16} /> Übernehmen
        </button>
      </footer>
    </div>
  );
}
