// Gegenprobe: Export → LibreOffice rechnet die Formeln → Vergleich mit dem Rechenkern.
// Aufruf: npm run verify:excel   (benötigt soffice im PATH)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { buildWorkbook } from "../src/lib/export/excel";
import { analyze } from "../src/lib/model/calc";
import { sampleDeal } from "../src/lib/model/defaults";
import type { Deal } from "../src/lib/model/types";

async function verify(label: string, deal: Deal) {
  const dir = mkdtempSync(join(tmpdir(), "xlsx-verify-"));
  const src = join(dir, "in.xlsx");
  const wb = await buildWorkbook(deal);
  writeFileSync(src, Buffer.from(await wb.xlsx.writeBuffer()));
  execFileSync("soffice", ["--headless", "--calc", "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", join(dir, "out"), src], { stdio: "ignore" });
  const out = XLSX.read(readFileSync(join(dir, "out", "in.xlsx")), { type: "buffer" });
  const a = analyze(deal);

  // benannte Zellen auflösen
  const names = new Map<string, string>();
  for (const n of out.Workbook?.Names ?? []) names.set(n.Name, n.Ref);
  const byName = (name: string): number => {
    const ref = names.get(name);
    if (!ref) throw new Error(`Name ${name} fehlt`);
    const m = /^'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+)$/.exec(ref)!;
    const cell = out.Sheets[m[1]][`${m[2]}${m[3]}`];
    return cell?.v as number;
  };
  const findRow = (sheet: string, label: string, col = "B"): number => {
    const ws = out.Sheets[sheet];
    const range = XLSX.utils.decode_range(ws["!ref"]!);
    for (let r = range.s.r; r <= range.e.r; r++) {
      const c = ws[XLSX.utils.encode_cell({ r, c: 0 })];
      if (c && String(c.v).trim() === label) return ws[`${col}${r + 1}`]?.v as number;
    }
    throw new Error(`${sheet}: ${label} nicht gefunden`);
  };

  const checks: [string, number, number, number][] = [
    ["Ist-Miete p.a.", byName("IstMiete"), a.s.istMieteJahr, 0.01],
    ["Potenzialmiete", byName("Potenzial"), a.s.potenzialJahr, 0.01],
    ["Fläche m²", byName("FlaecheM2"), a.s.flaecheM2, 0.001],
    ["WALT", byName("WALT"), a.s.walt, 1e-9],
    ["Vermietungskosten", byName("Verm_Kosten"), a.s.vk.summe, 0.01],
    ["Faktor Ist", findRow("Kaufpreis", "Kaufpreisfaktor (Ist)"), a.p.faktorIst, 1e-9],
    ["Faktor Potenzial", findRow("Kaufpreis", "Kaufpreisfaktor (Potenzial, inkl. Vermietungskosten)"), a.p.faktorPotenzial, 1e-9],
    ["€/m²", findRow("Kaufpreis", "Kaufpreis je m²"), a.p.preisQm, 1e-6],
    ["BAR", findRow("Kaufpreis", "Bruttoanfangsrendite (Ist)"), a.p.bar, 1e-12],
    ["NOI Ist", findRow("Kaufpreis", "Nettomietertrag Ist (NOI)"), a.p.noiIst, 0.01],
    ["NIY", findRow("Kaufpreis", "Nettoanfangsrendite (NIY)"), a.p.niy, 1e-12],
    ["Gesamtinvestition", findRow("Kaufpreis", "Gesamtinvestition"), a.p.gesamtinvest, 0.01],
    ["Kaufpreis Faktormethode", findRow("Kaufpreis", "Kaufpreis (Faktormethode)"), a.kaufpreisFaktormethode, 0.01],
    ["IRR ungehebelt", byName("IRR_unlev"), a.cf.irr, 1e-7],
    ["IRR gehebelt", byName("IRR_lev"), a.cf.irrLevered, 1e-7],
    ["NPV", byName("NPV_DCF"), a.cf.npv, 0.05],
    ["Equity Multiple", byName("EquityMultiple"), a.cf.equityMultiple, 1e-9],
    ["Max. Kaufpreis DCF", byName("KP_max_DCF"), a.cf.kaufpreisMaxDcf, 0.05],
  ];
  // Cashflow Jahr für Jahr
  const wc = out.Sheets["Cashflow"];
  const rowOf = (label: string) => {
    const range = XLSX.utils.decode_range(wc["!ref"]!);
    for (let r = range.s.r; r <= range.e.r; r++) if (String(wc[XLSX.utils.encode_cell({ r, c: 0 })]?.v ?? "").trim() === label) return r;
    throw new Error(label);
  };
  const cfLines: [string, (i: number) => number][] = [
    ["Mieteinnahmen (Nettokaltmiete)", (i) => a.cf.rows[i].miete],
    ["Net Operating Income (NOI)", (i) => a.cf.rows[i].noi],
    ["Cashflow ungehebelt", (i) => a.cf.rows[i].cf],
    ["Zinsen", (i) => -a.cf.rows[i].zinsen],
    ["Tilgung", (i) => -a.cf.rows[i].tilgung],
    ["Cashflow gehebelt (Eigenkapital)", (i) => a.cf.rows[i].cfLevered],
    ["DSCR (NOI / Kapitaldienst)", (i) => a.cf.rows[i].dscr],
  ];
  for (const [label, fn] of cfLines) {
    const r = rowOf(label);
    a.cf.rows.forEach((_, i) => {
      const v = wc[XLSX.utils.encode_cell({ r, c: 3 + i })]?.v as number;
      checks.push([`${label} J${i + 1}`, v, fn(i), label.startsWith("DSCR") ? 1e-9 : 0.01]);
    });
  }
  checks.push(["CF t0 ungehebelt", wc[XLSX.utils.encode_cell({ r: rowOf("Cashflow ungehebelt"), c: 2 })]?.v as number, a.cf.t0.cf, 0.01]);
  checks.push(["CF t0 gehebelt", wc[XLSX.utils.encode_cell({ r: rowOf("Cashflow gehebelt (Eigenkapital)"), c: 2 })]?.v as number, a.cf.t0.cfLevered, 0.01]);

  // WALT je Nutzung
  const ws = out.Sheets["Nutzungsarten"];
  for (const n of a.s.byNutzung) {
    const range = XLSX.utils.decode_range(ws["!ref"]!);
    // die Auswertungstabelle ist die letzte Fundstelle (erste = Annahmen-Block)
    let last = -1;
    for (let r = range.s.r; r <= range.e.r; r++) if (ws[XLSX.utils.encode_cell({ r, c: 0 })]?.v === n.nutzung) last = r;
    const found = last >= 0 ? 1 : 0;
    if (found) {
      checks.push([`WALT ${n.nutzung}`, ws[`H${last + 1}`].v, n.walt, 1e-9]);
      checks.push([`WALB ${n.nutzung}`, ws[`I${last + 1}`].v, n.walb, 1e-9]);
      checks.push([`Ist-Miete ${n.nutzung}`, ws[`E${last + 1}`].v, n.istMieteJahr, 0.01]);
      checks.push([`Vermietungskosten ${n.nutzung}`, ws[`K${last + 1}`].v, n.vermietungskosten, 0.01]);
    }
    if (!found) throw new Error(`WALT ${n.nutzung} nicht gefunden`);
  }

  let fail = 0;
  for (const [name, xl, app, tol] of checks) {
    const ok = typeof xl === "number" && Math.abs(xl - app) <= tol + 1e-12 * Math.abs(app);
    if (!ok) fail++;
    if (!ok || process.env.VERBOSE) console.log(`${ok ? "✓" : "✗"} ${label.padEnd(10)} ${name.padEnd(40)} Excel ${fmt(xl)}   Tool ${fmt(app)}`);
  }
  console.log(`${label}: ${checks.length - fail}/${checks.length} Werte identisch`);
  return fail;
}

function fmt(n: unknown) {
  return typeof n === "number" ? n.toLocaleString("de-DE", { maximumFractionDigits: 6 }) : String(n);
}

(async () => {
  let fail = 0;
  fail += await verify("Muster", sampleDeal());
  const d2 = sampleDeal();
  d2.finanzierung.aktiv = false;
  d2.dcf.haltedauer = 7;
  d2.pricing.basis = "potenzial";
  d2.units[2].option = "";
  d2.units.push({ ...d2.units[0], id: "x", mieter: "Leer EG", leer: true, mieteMonat: 0, flaeche: 210, nutzung: "Einzelhandel" });
  fail += await verify("Variante", d2);
  console.log(fail ? `\n${fail} Abweichungen` : "\nAlle Werte stimmen überein.");
  process.exit(fail ? 1 : 0);
})();
