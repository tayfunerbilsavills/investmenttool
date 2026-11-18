// Excel-Export mit echten Formeln. Eingaben (blau, hinterlegt) liegen im Reiter
// "Annahmen" und "Nutzungsarten" bzw. in der Mieterliste; alles andere rechnet
// Excel selbst. Nur der monatlich simulierte Mietverlauf im Cashflow wird als
// Wert übergeben (gekennzeichnet).
import ExcelJS from "exceljs";
import type { Deal } from "../model/types";
import { analyze, isM2, marktmieteQm, nkQuote, type Analysis } from "../model/calc";
import { grid, tornado, driver, output, axis, evalWith, defaultScenarios, type Scenario } from "../model/sensitivity";
import { bovResult } from "../model/bov";

const C = {
  walnut: "FF3B2A20",
  walnutLight: "FF5A4334",
  brass: "FFB08D57",
  brassLight: "FFF3E9D6",
  plaster: "FFF5EFE6",
  olive: "FF4A5235",
  ink: "FF22201C",
  muted: "FF7A6E62",
  input: "FF1F4E9A",
  inputFill: "FFFFF8E6",
  line: "FFD9CDBC",
  white: "FFFFFFFF",
  green: "FFE3EBD3",
  red: "FFF4D9D0",
};

const F = {
  eur: '#,##0 "€";[Red]-#,##0 "€"',
  eur2: '#,##0.00 "€";[Red]-#,##0.00 "€"',
  pct: "0.00%;[Red]-0.00%",
  x: '0.00"x"',
  m2: '#,##0 "m²"',
  num: "#,##0",
  num2: "#,##0.00",
  yrs: '0.00 "J."',
  date: "dd.mm.yyyy",
  mon: '0.0 "Mon."',
};

type WS = ExcelJS.Worksheet;

function font(bold = false, color = C.ink, size = 10): Partial<ExcelJS.Font> {
  return { name: "Arial", size, bold, color: { argb: color } };
}

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

const thin = (argb = C.line): Partial<ExcelJS.Border> => ({ style: "thin", color: { argb } });

function setupSheet(ws: WS, title: string, subtitle: string, widths: number[]) {
  ws.views = [{ showGridLines: false, state: "frozen", ySplit: 4, xSplit: 0 }];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.properties.defaultRowHeight = 16;
  ws.mergeCells(1, 1, 1, Math.max(4, widths.length));
  const t = ws.getCell(1, 1);
  t.value = title.toUpperCase();
  t.font = { name: "Arial", size: 15, bold: false, color: { argb: C.plaster } };
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 30;
  for (let c = 1; c <= Math.max(4, widths.length); c++) {
    ws.getCell(1, c).fill = fill(C.walnut);
    ws.getCell(2, c).fill = fill(C.walnut);
    ws.getCell(3, c).border = { top: { style: "medium", color: { argb: C.brass } } };
  }
  ws.mergeCells(2, 1, 2, Math.max(4, widths.length));
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = font(false, C.brass, 9);
  s.alignment = { indent: 1 };
  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  ws.headerFooter.oddFooter = `&L&8${title}&R&8Seite &P / &N`;
}

function header(ws: WS, row: number, labels: string[], startCol = 1) {
  labels.forEach((l, i) => {
    const c = ws.getCell(row, startCol + i);
    c.value = l;
    c.font = font(true, C.white, 9);
    c.fill = fill(C.walnutLight);
    c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", wrapText: true };
    c.border = { bottom: thin(C.brass) };
  });
  ws.getRow(row).height = 30;
}

function section(ws: WS, row: number, label: string, cols: number) {
  const c = ws.getCell(row, 1);
  c.value = label.toUpperCase();
  c.font = { name: "Arial", size: 10, color: { argb: C.walnut }, bold: true };
  for (let i = 1; i <= cols; i++) ws.getCell(row, i).border = { bottom: thin(C.brass) };
  ws.getRow(row).height = 22;
}

function inputStyle(c: ExcelJS.Cell, fmt?: string) {
  c.font = font(false, C.input);
  c.fill = fill(C.inputFill);
  c.border = { top: thin(), bottom: thin(), left: thin(), right: thin() };
  if (fmt) c.numFmt = fmt;
}

function calcStyle(c: ExcelJS.Cell, fmt?: string, bold = false) {
  c.font = font(bold);
  if (fmt) c.numFmt = fmt;
}

function d(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, dd] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}

function f(formula: string, result?: number | string): ExcelJS.CellFormulaValue {
  return { formula, result: result as number } as ExcelJS.CellFormulaValue;
}

function colL(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface ExportOptions {
  sensX?: string;
  sensY?: string;
  sensOut?: string;
  scenarios?: Scenario[];
}

export async function buildWorkbook(deal: Deal, opts: ExportOptions = {}): Promise<ExcelJS.Workbook> {
  const a: Analysis = analyze(deal);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Savills Investment Tool";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const name = deal.objekt.name || "Objekt";
  const sub = `${name} · ${[deal.objekt.adresse, [deal.objekt.plz, deal.objekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")} · Stichtag ${fmtDate(deal.stichtag)}`;

  const wsU = wb.addWorksheet("Übersicht", { properties: { tabColor: { argb: C.brass } } });
  const wsA = wb.addWorksheet("Annahmen", { properties: { tabColor: { argb: C.walnut } } });
  const wsM = wb.addWorksheet("Mieterliste", { properties: { tabColor: { argb: C.walnut } } });
  const wsN = wb.addWorksheet("Nutzungsarten", { properties: { tabColor: { argb: C.walnut } } });
  const wsK = wb.addWorksheet("Kaufpreis", { properties: { tabColor: { argb: C.olive } } });
  const wsC = wb.addWorksheet("Cashflow", { properties: { tabColor: { argb: C.olive } } });
  const wsS = wb.addWorksheet("Sensitivität", { properties: { tabColor: { argb: C.olive } } });
  const wsB = wb.addWorksheet("BOV", { properties: { tabColor: { argb: C.brass } } });

  // ------------------------------------------------------------ Annahmen
  setupSheet(wsA, "Annahmen", sub, [38, 18, 46]);
  const names: Record<string, string> = {};
  let r = 5;
  const addInput = (label: string, nameKey: string, value: number | Date | string, fmt: string, note = "") => {
    wsA.getCell(r, 1).value = label;
    wsA.getCell(r, 1).font = font();
    const c = wsA.getCell(r, 2);
    c.value = value as ExcelJS.CellValue;
    inputStyle(c, fmt);
    wsA.getCell(r, 3).value = note;
    wsA.getCell(r, 3).font = font(false, C.muted, 9);
    names[nameKey] = `Annahmen!$B$${r}`;
    wb.definedNames.add(`'Annahmen'!$B$${r}`, nameKey);
    r++;
  };
  const fin = deal.finanzierung;
  section(wsA, r++, "Bewertung", 3);
  addInput("Stichtag", "Stichtag", d(deal.stichtag) ?? new Date(), F.date, "Basis für Restlaufzeiten");
  addInput("Kaufpreis netto", "Kaufpreis_netto", deal.pricing.kaufpreis, F.eur, "Zentrale Preisgröße");
  addInput("Restlaufzeit unbefristeter Verträge", "Unbefristet_J", deal.dcf.unbefristetJahre, F.yrs, "Ansatz im WALT");
  addInput("Zielfaktor (Potenzialmiete)", "Zielfaktor", deal.bov.zielfaktor, F.x, "Faktormethode BOV");
  r++;
  section(wsA, r++, "Erwerbsnebenkosten", 3);
  addInput("Grunderwerbsteuer", "GrESt", deal.pricing.grest, F.pct, deal.objekt.bundesland);
  addInput("Notar / Grundbuch", "Notar", deal.pricing.notar, F.pct);
  addInput("Makler (Erwerb)", "Makler_NK", deal.pricing.makler, F.pct);
  addInput("Sonstige Nebenkosten", "Sonst_NK", deal.pricing.sonstigeNk, F.pct, "Due Diligence, Beratung");
  addInput("Sofortinvestitionen (Capex)", "Capex_Sofort", deal.pricing.capexSofort, F.eur);
  r++;
  section(wsA, r++, "Bewirtschaftung", 3);
  addInput("Verwaltung", "Verwaltung", deal.kosten.verwaltung, F.pct, "% der Mieteinnahmen");
  addInput("Mietausfallwagnis", "Mietausfall", deal.kosten.mietausfall, F.pct, "% der Mieteinnahmen");
  addInput("Nicht umlagefähige Kosten", "NichtUml", deal.kosten.nichtUmlagefaehig, F.pct, "% der Mieteinnahmen");
  addInput("Instandhaltung", "Instandhaltung", deal.kosten.instandhaltung, F.eur2, "€/m² Mietfläche p.a.");
  r++;
  section(wsA, r++, "Cashflow / Exit", 3);
  addInput("Haltedauer", "Haltedauer", deal.dcf.haltedauer, '0 "J."', "Spaltenstruktur im Reiter Cashflow ist fix");
  addInput("Marktmietwachstum p.a.", "Mietwachstum", deal.dcf.mietwachstum, F.pct);
  addInput("Indexierung Bestandsmieten p.a.", "Indexierung", deal.dcf.indexierung, F.pct);
  addInput("Kostensteigerung p.a.", "Kostensteig", deal.dcf.kostensteigerung, F.pct);
  addInput("Exit-Faktor (Miete Folgejahr)", "ExitFaktor", deal.dcf.exitFaktor, F.x);
  addInput("Verkaufskosten", "Verkaufskosten", deal.dcf.verkaufskosten, F.pct, "% vom Exit-Wert");
  addInput("Diskontierungszins", "Diskontsatz", deal.dcf.diskontsatz, F.pct);
  r++;
  section(wsA, r++, "Finanzierung", 3);
  addInput("LTV (auf Kaufpreis netto)", "LTV_Quote", fin.aktiv ? fin.ltv : 0, F.pct, fin.aktiv ? "" : "Finanzierung im Tool deaktiviert");
  addInput("Zins p.a.", "Zins", fin.zins, F.pct);
  addInput("Anfängliche Tilgung p.a.", "Tilgung", fin.tilgung, F.pct, "Annuität = Darlehen × (Zins + Tilgung)");
  addInput("Finanzierungsgebühren", "Gebuehren", fin.aktiv ? fin.gebuehren : 0, F.pct, "% vom Darlehen");
  r += 1;
  wsA.getCell(r, 1).value = "Legende:";
  wsA.getCell(r, 1).font = font(true, C.muted, 9);
  const lg = wsA.getCell(r, 2);
  lg.value = "Eingabe";
  inputStyle(lg);
  wsA.getCell(r, 3).value = "Schwarz = Formel · Grau kursiv = Wert aus dem Tool (monatliche Simulation)";
  wsA.getCell(r, 3).font = font(false, C.muted, 9);

  // ------------------------------------------------------------ Nutzungsarten (Annahmen-Block)
  const nutzList = [...new Set([...deal.units.map((u) => u.nutzung), ...Object.keys(deal.nutzungen)])].filter((n) =>
    deal.units.some((u) => u.nutzung === n),
  );
  setupSheet(wsN, "Nutzungsarten", sub, [22, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13]);
  header(wsN, 4, ["Nutzung", "Marktmiete €/m² bzw. €/Stk mtl.", "Ausbau Leerstand €/m²", "Ausbau Neuverm. €/m²", "Leerstand Monate", "Mietfrei Monate", "Makler Monatsmieten", "Verlängerung", "Neue Laufzeit J.", "Leerstands-NK €/m² mtl."]);
  const nStart = 5;
  nutzList.forEach((n, i) => {
    const row = nStart + i;
    const na = deal.nutzungen[n];
    wsN.getCell(row, 1).value = n;
    wsN.getCell(row, 1).font = font(true);
    const vals: [number, string][] = [
      [na.marktmiete, F.num2],
      [na.umbauLeer, F.num],
      [na.umbauNeu, F.num],
      [na.leerstandMonate, F.num2],
      [na.mietfreiMonate, F.num2],
      [na.maklerMonate, F.num2],
      [na.verlaengerung, "0%"],
      [na.neueLaufzeit, F.num2],
      [na.leerstandNk, F.num2],
    ];
    vals.forEach(([v, fmt], j) => {
      const c = wsN.getCell(row, 2 + j);
      c.value = v;
      inputStyle(c, fmt);
    });
  });
  const nEnd = nStart + Math.max(0, nutzList.length - 1);
  const NR = (col: string) => `Nutzungsarten!$${col}$${nStart}:$${col}$${nEnd}`;
  const lookup = (col: string, keyCell: string) => `IFERROR(INDEX(${NR(col)},MATCH(${keyCell},${NR("A")},0)),0)`;

  // ------------------------------------------------------------ Mieterliste
  setupSheet(wsM, "Mieterliste", sub, [5, 15, 30, 10, 11, 7, 10, 13, 10, 14, 12, 12, 12, 9, 15, 9, 15, 11, 14, 14, 10, 14, 13, 13, 30]);
  const mh = [
    "Nr",
    "Nutzung",
    "Mieter",
    "Geschoss",
    "Fläche",
    "Einh.",
    "Status",
    "Miete mtl. €",
    "€/m² mtl.",
    "Jahresmiete €",
    "Mietbeginn",
    "Mietende",
    "Option/Break",
    "RLZ J.",
    "JM × RLZ",
    "RLZ Break J.",
    "JM × RLZ Break",
    "Marktmiete €/m²",
    "Marktmiete p.a.",
    "Potenzial p.a.",
    "Over/Under",
    "Vermietungs-kosten",
    "Ausbau Leerstand",
    "Leerstands-NK p.a.",
    "Notiz",
  ];
  header(wsM, 4, mh);
  wsM.views = [{ showGridLines: false, state: "frozen", ySplit: 4, xSplit: 3 }];
  const mStart = 5;
  deal.units.forEach((u, i) => {
    const row = mStart + i;
    const R = (c: string) => `${c}${row}`;
    const cells: [ExcelJS.CellValue, string | undefined, boolean][] = [
      [i + 1, F.num, false],
      [u.nutzung, undefined, true],
      [u.mieter, undefined, true],
      [u.geschoss, undefined, true],
      [u.flaeche, F.num2, true],
      [isM2(u) ? "m²" : "Stk", undefined, true],
      [u.leer ? "leer" : "vermietet", undefined, true],
      [u.leer ? 0 : u.mieteMonat, F.eur2, true],
      [f(`IF(${R("E")}>0,${R("H")}/${R("E")},0)`), F.num2, false],
      [f(`IF(${R("G")}="leer",0,${R("H")}*12)`), F.eur, false],
      [d(u.mietbeginn), F.date, true],
      [d(u.mietende), F.date, true],
      [d(u.option), F.date, true],
      [f(`IF(${R("G")}="leer",0,IF(${R("L")}="",Unbefristet_J,MAX(0,(${R("L")}-Stichtag)/365.25)))`), F.num2, false],
      [f(`${R("J")}*${R("N")}`), F.eur, false],
      [
        f(
          `IF(${R("G")}="leer",0,IF(AND(${R("M")}="",${R("L")}=""),Unbefristet_J,MAX(0,(IF(AND(${R("M")}<>"",OR(${R("L")}="",${R("M")}<${R("L")})),${R("M")},${R("L")})-Stichtag)/365.25)))`,
        ),
        F.num2,
        false,
      ],
      [f(`${R("J")}*${R("P")}`), F.eur, false],
      [u.marktmiete != null ? u.marktmiete : f(lookup("B", R("B"))), F.num2, u.marktmiete != null],
      [f(`${R("R")}*${R("E")}*12`), F.eur, false],
      [f(`IF(${R("G")}="leer",${R("S")},${R("J")})`), F.eur, false],
      [f(`IF(AND(${R("G")}<>"leer",${R("S")}>0),${R("J")}/${R("S")}-1,"")`), F.pct, false],
      [
        f(
          `IF(${R("G")}="leer",IF(${R("F")}="m²",${lookup("C", R("B"))}*${R("E")},0)+(${lookup("G", R("B"))}+${lookup("F", R("B"))}+${lookup("E", R("B"))})*${R("R")}*${R("E")}+IF(${R("F")}="m²",${lookup("E", R("B"))}*${lookup("J", R("B"))}*${R("E")},0),0)`,
        ),
        F.eur,
        false,
      ],
      [f(`IF(AND(${R("G")}="leer",${R("F")}="m²"),${lookup("C", R("B"))}*${R("E")},0)`), F.eur, false],
      [f(`IF(AND(${R("G")}="leer",${R("F")}="m²"),${lookup("J", R("B"))}*${R("E")}*12,0)`), F.eur, false],
      [u.notiz, undefined, true],
    ];
    cells.forEach(([v, fmt, isInput], j) => {
      const c = wsM.getCell(row, j + 1);
      c.value = v;
      if (isInput) inputStyle(c, fmt);
      else calcStyle(c, fmt);
    });
    if (u.leer) wsM.getCell(row, 3).font = { ...font(false, C.input), italic: true };
  });
  const mEnd = mStart + Math.max(0, deal.units.length - 1);
  const mTot = mEnd + 2;
  const MR = (col: string) => `Mieterliste!$${col}$${mStart}:$${col}$${mEnd}`;
  wsM.getCell(mTot, 3).value = "Summe / Ø";
  wsM.getCell(mTot, 3).font = font(true);
  const totals: [string, string, string][] = [
    ["E", `SUMIFS(${MR("E")},${MR("F")},"m²")`, F.m2],
    ["H", `SUM(${MR("H")})`, F.eur2],
    ["J", `SUM(${MR("J")})`, F.eur],
    ["N", `IF(J${mTot}>0,O${mTot}/J${mTot},0)`, F.yrs],
    ["O", `SUM(${MR("O")})`, F.eur],
    ["P", `IF(J${mTot}>0,Q${mTot}/J${mTot},0)`, F.yrs],
    ["Q", `SUM(${MR("Q")})`, F.eur],
    ["S", `SUM(${MR("S")})`, F.eur],
    ["T", `SUM(${MR("T")})`, F.eur],
    ["V", `SUM(${MR("V")})`, F.eur],
    ["W", `SUM(${MR("W")})`, F.eur],
    ["X", `SUM(${MR("X")})`, F.eur],
  ];
  for (const [col, fo, fmt] of totals) {
    const c = wsM.getCell(`${col}${mTot}`);
    c.value = f(fo);
    calcStyle(c, fmt, true);
  }
  for (let c = 1; c <= mh.length; c++) {
    wsM.getCell(mTot, c).border = { top: { style: "medium", color: { argb: C.walnut } } };
    wsM.getCell(mTot, c).fill = fill(C.brassLight);
  }
  wsM.getCell(mTot + 1, 14).value = "WALT (mietgewichtet)";
  wsM.getCell(mTot + 1, 14).font = font(false, C.muted, 8);
  wsM.autoFilter = { from: { row: 4, column: 1 }, to: { row: mEnd, column: mh.length } };
  // Auswahllisten für Nutzung und Status
  for (let row = mStart; row <= mEnd + 20; row++) {
    wsM.getCell(row, 2).dataValidation = { type: "list", allowBlank: true, formulae: [`=Nutzungsarten!$A$${nStart}:$A$${nEnd}`] };
    wsM.getCell(row, 7).dataValidation = { type: "list", allowBlank: false, formulae: ['"vermietet,leer"'] };
  }
  // Over/Under farbig
  wsM.addConditionalFormatting({
    ref: `U${mStart}:U${mEnd}`,
    rules: [
      { type: "cellIs", operator: "greaterThan", formulae: ["0.1"], priority: 1, style: { fill: fill(C.red), font: { color: { argb: "FF9C3B22" } } } },
      { type: "cellIs", operator: "lessThan", formulae: ["-0.1"], priority: 2, style: { fill: fill(C.green), font: { color: { argb: "FF3E5A1E" } } } },
    ],
  });

  // ------------------------------------------------------------ Nutzungsarten (Auswertung)
  const aStart = nEnd + 4;
  section(wsN, aStart - 1, "Auswertung je Nutzungsart · WALT = Σ(Jahresmiete × Restlaufzeit) / Σ Jahresmiete", 12);
  header(wsN, aStart, ["Nutzung", "Fläche", "davon leer", "Leerstand %", "Ist-Miete p.a.", "Ø Ist €/m² mtl.", "Σ JM × RLZ", "WALT J.", "WALB J.", "Potenzial p.a.", "Vermietungs-kosten", "Anteil Miete"]);
  nutzList.forEach((n, i) => {
    const row = aStart + 1 + i;
    const A = `$A${row}`;
    wsN.getCell(row, 1).value = n;
    wsN.getCell(row, 1).font = font(true);
    const fs: [string, string][] = [
      [`SUMIFS(${MR("E")},${MR("B")},${A})`, F.num],
      [`SUMIFS(${MR("E")},${MR("B")},${A},${MR("G")},"leer")`, F.num],
      [`IF(B${row}>0,C${row}/B${row},0)`, F.pct],
      [`SUMIFS(${MR("J")},${MR("B")},${A})`, F.eur],
      [`IF(B${row}-C${row}>0,E${row}/12/(B${row}-C${row}),0)`, F.num2],
      [`SUMIFS(${MR("O")},${MR("B")},${A})`, F.eur],
      [`IF(E${row}>0,G${row}/E${row},0)`, F.yrs],
      [`IF(E${row}>0,SUMIFS(${MR("Q")},${MR("B")},${A})/E${row},0)`, F.yrs],
      [`SUMIFS(${MR("T")},${MR("B")},${A})`, F.eur],
      [`SUMIFS(${MR("V")},${MR("B")},${A})`, F.eur],
      [`IF(SUM($E$${aStart + 1}:$E$${aStart + nutzList.length})>0,E${row}/SUM($E$${aStart + 1}:$E$${aStart + nutzList.length}),0)`, F.pct],
    ];
    fs.forEach(([fo, fmt], j) => calcStyle(Object.assign(wsN.getCell(row, 2 + j), { value: f(fo) }), fmt));
  });
  const aEnd = aStart + nutzList.length;
  const aTot = aEnd + 1;
  wsN.getCell(aTot, 1).value = "Gesamt";
  const AR = (col: string) => `${col}${aStart + 1}:${col}${aEnd}`;
  const aTotals: [number, string, string][] = [
    [2, `SUMIFS(${MR("E")},${MR("F")},"m²")`, F.m2],
    [3, `SUMIFS(${MR("E")},${MR("F")},"m²",${MR("G")},"leer")`, F.m2],
    [4, `IF(B${aTot}>0,C${aTot}/B${aTot},0)`, F.pct],
    [5, `SUM(${AR("E")})`, F.eur],
    [7, `SUM(${AR("G")})`, F.eur],
    [8, `IF(E${aTot}>0,G${aTot}/E${aTot},0)`, F.yrs],
    [9, `IF(E${aTot}>0,SUM(${MR("Q")})/E${aTot},0)`, F.yrs],
    [10, `SUM(${AR("J")})`, F.eur],
    [11, `SUM(${AR("K")})`, F.eur],
    [12, `SUM(${AR("L")})`, F.pct],
  ];
  for (let c = 1; c <= 12; c++) {
    const cell = wsN.getCell(aTot, c);
    cell.border = { top: { style: "medium", color: { argb: C.walnut } } };
    cell.fill = fill(C.brassLight);
    cell.font = font(true);
  }
  for (const [c, fo, fmt] of aTotals) calcStyle(Object.assign(wsN.getCell(aTot, c), { value: f(fo) }), fmt, true);
  wsN.getCell(aTot + 1, 2).value = "Fläche/Leerstand gesamt nur m²-Flächen (ohne Stellplätze). Gesamt-WALT = Σ aller (JM × RLZ) / Σ aller JM — nicht der Durchschnitt der Nutzungs-WALTs.";
  wsN.getCell(aTot + 1, 2).font = { ...font(false, C.muted, 8), italic: true };
  wb.definedNames.add(`'Nutzungsarten'!$H$${aTot}`, "WALT");
  wb.definedNames.add(`'Nutzungsarten'!$E$${aTot}`, "IstMiete");
  wb.definedNames.add(`'Nutzungsarten'!$J$${aTot}`, "Potenzial");
  wb.definedNames.add(`'Nutzungsarten'!$K$${aTot}`, "Verm_Kosten");
  wb.definedNames.add(`'Nutzungsarten'!$B$${aTot}`, "FlaecheM2");

  // ------------------------------------------------------------ Kaufpreis
  setupSheet(wsK, "Kaufpreis & Kennzahlen", sub, [44, 18, 50]);
  r = 5;
  const kRow: Record<string, number> = {};
  const kLine = (key: string, label: string, formula: string, fmt: string, note = "", bold = false) => {
    wsK.getCell(r, 1).value = label;
    wsK.getCell(r, 1).font = font(bold);
    const c = wsK.getCell(r, 2);
    c.value = f(formula);
    calcStyle(c, fmt, bold);
    wsK.getCell(r, 3).value = note;
    wsK.getCell(r, 3).font = font(false, C.muted, 9);
    kRow[key] = r;
    if (bold) for (let i = 1; i <= 3; i++) wsK.getCell(r, i).fill = fill(C.brassLight);
    r++;
  };
  const K = (key: string) => `$B$${kRow[key]}`;
  section(wsK, r++, "Kaufpreis und Nebenkosten", 3);
  kLine("kp", "Kaufpreis netto", "Kaufpreis_netto", F.eur, "aus Annahmen", true);
  kLine("grest", "Grunderwerbsteuer", "Kaufpreis_netto*GrESt", F.eur);
  kLine("notar", "Notar / Grundbuch", "Kaufpreis_netto*Notar", F.eur);
  kLine("makler", "Makler", "Kaufpreis_netto*Makler_NK", F.eur);
  kLine("sonst", "Sonstige Nebenkosten", "Kaufpreis_netto*Sonst_NK", F.eur);
  kLine("nk", "Erwerbsnebenkosten gesamt", `SUM(B${r - 4}:B${r - 1})`, F.eur, "", false);
  kLine("nkq", "Nebenkostenquote", `IF(Kaufpreis_netto>0,${K("nk")}/Kaufpreis_netto,0)`, F.pct);
  kLine("gk", "Gesamtkosten (Kaufpreis + NK)", `Kaufpreis_netto+${K("nk")}`, F.eur, "", true);
  kLine("ausbau", "Ausbau Leerstand (t0)", `SUM(${MR("W")})`, F.eur, "Ausbaukosten × leere Fläche");
  kLine("gi", "Gesamtinvestition", `${K("gk")}+${K("ausbau")}+Capex_Sofort`, F.eur, "Kaufpreis + NK + Ausbau Leerstand + Sofort-Capex", true);
  r++;
  section(wsK, r++, "Mieten", 3);
  kLine("ist", "Ist-Jahresnettokaltmiete", "IstMiete", F.eur);
  kLine("pot", "Potenzialmiete (Leerstand zu Marktmiete)", "Potenzial", F.eur);
  kLine("fl", "Mietfläche (m²)", "FlaecheM2", F.m2);
  kLine("walt", "WALT", "WALT", F.yrs, "mietgewichtet, siehe Nutzungsarten");
  kLine("vk", "Vermietungskosten Leerstand", "Verm_Kosten", F.eur, "Ausbau + Makler + mietfrei + Mietverlust + Leerstands-NK");
  r++;
  section(wsK, r++, "Kennzahlen", 3);
  kLine("fi", "Kaufpreisfaktor (Ist)", `IF(${K("ist")}>0,Kaufpreis_netto/${K("ist")},0)`, F.x, "", true);
  kLine("fp", "Kaufpreisfaktor (Potenzial, inkl. Vermietungskosten)", `IF(${K("pot")}>0,(Kaufpreis_netto+${K("vk")})/${K("pot")},0)`, F.x);
  kLine("qm", "Kaufpreis je m²", `IF(${K("fl")}>0,Kaufpreis_netto/${K("fl")},0)`, F.eur, "", true);
  kLine("bar", "Bruttoanfangsrendite (Ist)", `IF(Kaufpreis_netto>0,${K("ist")}/Kaufpreis_netto,0)`, F.pct);
  kLine("barp", "Bruttoanfangsrendite (Potenzial)", `IF(Kaufpreis_netto>0,${K("pot")}/Kaufpreis_netto,0)`, F.pct);
  kLine(
    "noi",
    "Nettomietertrag Ist (NOI)",
    `${K("ist")}*(1-Verwaltung-Mietausfall-NichtUml)-Instandhaltung*${K("fl")}-SUM(${MR("X")})`,
    F.eur,
    "Ist-Miete − Bewirtschaftung − Instandhaltung − Leerstands-NK",
  );
  kLine("niy", "Nettoanfangsrendite (NIY)", `IF(Kaufpreis_netto>0,${K("noi")}/${K("gk")},0)`, F.pct, "NOI / (Kaufpreis + NK)", true);
  r++;
  section(wsK, r++, "Kaufpreisherleitung Faktormethode", 3);
  kLine("zf", "Zielfaktor auf Potenzialmiete", "Zielfaktor", F.x);
  kLine("wert", "Wert vollvermietet", `Zielfaktor*${K("pot")}`, F.eur);
  kLine("abzug", "abzgl. Vermietungskosten Leerstand", `-${K("vk")}`, F.eur);
  kLine("kpmax", "Kaufpreis (Faktormethode)", `MAX(0,${K("wert")}+${K("abzug")})`, F.eur, "", true);

  // ------------------------------------------------------------ Cashflow
  const N = a.cf.rows.length;
  setupSheet(wsC, "Cashflow (DCF)", sub, [38, 15, ...Array(N + 1).fill(14)]);
  wsC.views = [{ showGridLines: false, state: "frozen", ySplit: 5, xSplit: 2 }];
  const col0 = 3; // Jahr 0
  const yc = (y: number) => colL(col0 + y);
  header(wsC, 4, ["", "", ...Array.from({ length: N + 1 }, (_, i) => (i === 0 ? "t0" : `Jahr ${i}`))]);
  wsC.getCell(5, 1).value = "Periode bis";
  wsC.getCell(5, 1).font = font(false, C.muted, 9);
  wsC.getCell(5, col0).value = d(deal.stichtag);
  wsC.getCell(5, col0).numFmt = F.date;
  for (let y = 1; y <= N; y++) {
    const c = wsC.getCell(5, col0 + y);
    c.value = d(a.cf.rows[y - 1].bis);
    c.numFmt = F.date;
    c.font = font(false, C.muted, 9);
    wsC.getCell(3, col0 + y).value = y;
    wsC.getCell(3, col0 + y).font = font(false, C.white, 1);
  }
  let cr = 6;
  const rows: Record<string, number> = {};
  const cfRow = (key: string, label: string, fn: (y: number) => ExcelJS.CellValue | null, fmt = F.eur, opt: { bold?: boolean; value?: boolean; line?: boolean; t0?: ExcelJS.CellValue } = {}) => {
    wsC.getCell(cr, 1).value = label;
    wsC.getCell(cr, 1).font = font(!!opt.bold);
    if (opt.value) {
      wsC.getCell(cr, 2).value = "Wert (Tool)";
      wsC.getCell(cr, 2).font = { ...font(false, C.muted, 8), italic: true };
    }
    if (opt.t0 !== undefined) {
      const c = wsC.getCell(cr, col0);
      c.value = opt.t0;
      calcStyle(c, fmt, !!opt.bold);
    }
    for (let y = 1; y <= N; y++) {
      const v = fn(y);
      if (v === null) continue;
      const c = wsC.getCell(cr, col0 + y);
      c.value = v;
      calcStyle(c, fmt, !!opt.bold);
      if (opt.value) c.font = { ...font(false, C.muted), italic: true };
    }
    if (opt.line || opt.bold)
      for (let c = 1; c <= col0 + N; c++) {
        wsC.getCell(cr, c).border = { top: thin(C.walnut) };
        if (opt.bold) wsC.getCell(cr, c).fill = fill(C.brassLight);
      }
    rows[key] = cr++;
  };
  const Y = (key: string, y: number) => `${yc(y)}${rows[key]}`;
  const yearCell = (y: number) => `${yc(y)}$3`;
  section(wsC, cr++, "Mieteinnahmen", col0 + N);
  cfRow("vertrag", "Sollmiete (Vollvermietung)", (y) => a.cf.rows[y - 1].mieteVertrag, F.eur, { value: true });
  cfRow("leer", "./. Leerstand", (y) => -a.cf.rows[y - 1].leerstandsverlust, F.eur, { value: true });
  cfRow("frei", "./. Mietfreie Zeiten", (y) => -a.cf.rows[y - 1].mietfrei, F.eur, { value: true });
  cfRow("miete", "Mieteinnahmen (Nettokaltmiete)", (y) => f(`SUM(${Y("vertrag", y)}:${Y("frei", y)})`), F.eur, { bold: true });
  section(wsC, cr++, "Bewirtschaftung", col0 + N);
  cfRow("verw", "Verwaltung", (y) => f(`-${Y("miete", y)}*Verwaltung`));
  cfRow("maw", "Mietausfallwagnis", (y) => f(`-${Y("miete", y)}*Mietausfall`));
  cfRow("nu", "Nicht umlagefähige Kosten", (y) => f(`-${Y("miete", y)}*NichtUml`));
  cfRow("inst", "Instandhaltung", (y) => f(`-Instandhaltung*FlaecheM2*(1+Kostensteig)^(${yearCell(y)}-1)`));
  cfRow("lnk", "Leerstandskosten (nicht umlegbare NK)", (y) => -a.cf.rows[y - 1].leerNk, F.eur, { value: true });
  cfRow("noi", "Net Operating Income (NOI)", (y) => f(`SUM(${Y("miete", y)},${Y("verw", y)}:${Y("lnk", y)})`), F.eur, { bold: true });
  section(wsC, cr++, "Investitionen", col0 + N);
  cfRow("kp", "Kaufpreis inkl. Nebenkosten", () => null, F.eur, { t0: f(`-Kaufpreis!${K("gk")}`) });
  cfRow("ausbau0", "Ausbau Leerstand / Sofort-Capex", () => null, F.eur, { t0: f(`-(Kaufpreis!${K("ausbau")}+Capex_Sofort)`) });
  cfRow("ti", "Ausbau bei Neuvermietung", (y) => -a.cf.rows[y - 1].ausbau, F.eur, { value: true });
  cfRow("mak", "Maklerkosten Vermietung", (y) => -a.cf.rows[y - 1].makler, F.eur, { value: true });
  section(wsC, cr++, "Exit", col0 + N);
  cfRow("fwd", "Miete Folgejahr (Exit-Basis)", (y) => (y === N ? a.cf.forwardMiete : null), F.eur, { value: true });
  cfRow("exit", "Exit-Wert (Faktor × Miete Folgejahr)", (y) => (y === N ? f(`ExitFaktor*${Y("fwd", y)}`) : null));
  cfRow("vk", "Verkaufskosten", (y) => (y === N ? f(`-${Y("exit", y)}*Verkaufskosten`) : null));
  cfRow(
    "cf",
    "Cashflow ungehebelt",
    (y) => f(`${Y("noi", y)}+${Y("ti", y)}+${Y("mak", y)}+N(${Y("exit", y)})+N(${Y("vk", y)})`),
    F.eur,
    { bold: true, t0: f(`${yc(0)}${rows.kp}+${yc(0)}${rows.ausbau0}`) },
  );
  section(wsC, cr++, "Finanzierung", col0 + N);
  cfRow("darl", "Darlehen / Gebühren", () => null, F.eur, { t0: f("LTV_Quote*Kaufpreis_netto*(1-Gebuehren)") });
  cfRow("saldoA", "Darlehensstand Jahresbeginn", (y) => (y === 1 ? f("LTV_Quote*Kaufpreis_netto") : f(`${yc(y - 1)}${cr + 4}`)));
  cfRow("zins", "Zinsen", (y) => f(`-${Y("saldoA", y)}*Zins`));
  cfRow("tilg", "Tilgung", (y) => f(`-MIN(${Y("saldoA", y)},MAX(0,LTV_Quote*Kaufpreis_netto*(Zins+Tilgung)+${Y("zins", y)}))`));
  cfRow("rueck", "Rückzahlung bei Exit", (y) => (y === N ? f(`-(${Y("saldoA", y)}+${Y("tilg", y)})`) : null));
  cfRow("saldoE", "Darlehensstand Jahresende", (y) => f(`${Y("saldoA", y)}+${Y("tilg", y)}+N(${Y("rueck", y)})`));
  cfRow("cfl", "Cashflow gehebelt (Eigenkapital)", (y) => f(`${Y("cf", y)}+${Y("zins", y)}+${Y("tilg", y)}+N(${Y("rueck", y)})`), F.eur, {
    bold: true,
    t0: f(`${yc(0)}${rows.cf}+${yc(0)}${rows.darl}`),
  });
  cfRow("dscr", "DSCR (NOI / Kapitaldienst)", (y) => f(`IFERROR(${Y("noi", y)}/-(${Y("zins", y)}+${Y("tilg", y)}),0)`), F.x);
  cfRow("coc", "Cash-on-Cash", (y) => f(`IFERROR((${Y("noi", y)}+${Y("ti", y)}+${Y("mak", y)}+${Y("zins", y)}+${Y("tilg", y)})/-${yc(0)}${rows.cfl},0)`), F.pct);
  cr++;
  section(wsC, cr++, "Ergebnis", col0 + N);
  const cfRange = `${yc(0)}${rows.cf}:${yc(N)}${rows.cf}`;
  const cflRange = `${yc(0)}${rows.cfl}:${yc(N)}${rows.cfl}`;
  const res: [string, string, string, string][] = [
    ["irr", "IRR ungehebelt", `IRR(${cfRange})`, F.pct],
    ["irrl", "IRR gehebelt (Eigenkapital)", `IRR(${cflRange})`, F.pct],
    ["npv", "Kapitalwert (NPV) zum Diskontierungszins", `${yc(0)}${rows.cf}+NPV(Diskontsatz,${yc(1)}${rows.cf}:${yc(N)}${rows.cf})`, F.eur],
    ["kpmax", "Max. Kaufpreis netto (NPV = 0)", `(NPV(Diskontsatz,${yc(1)}${rows.cf}:${yc(N)}${rows.cf})-Kaufpreis!${K("ausbau")}-Capex_Sofort)/(1+GrESt+Notar+Makler_NK+Sonst_NK)`, F.eur],
    ["em", "Equity Multiple", `IFERROR(SUMIF(${yc(1)}${rows.cfl}:${yc(N)}${rows.cfl},">0")/-SUMIF(${cflRange},"<0"),0)`, F.x],
    ["gew", "Gewinn gehebelt", `SUM(${cflRange})`, F.eur],
    ["ek", "Eigenkapitaleinsatz", `-${yc(0)}${rows.cfl}`, F.eur],
  ];
  for (const [key, label, fo, fmt] of res) {
    wsC.getCell(cr, 1).value = label;
    wsC.getCell(cr, 1).font = font(true);
    const c = wsC.getCell(cr, 2);
    c.value = f(fo);
    calcStyle(c, fmt, true);
    c.fill = fill(C.brassLight);
    rows[key] = cr++;
  }
  wb.definedNames.add(`'Cashflow'!$B$${rows.irr}`, "IRR_unlev");
  wb.definedNames.add(`'Cashflow'!$B$${rows.irrl}`, "IRR_lev");
  wb.definedNames.add(`'Cashflow'!$B$${rows.npv}`, "NPV_DCF");
  wb.definedNames.add(`'Cashflow'!$B$${rows.em}`, "EquityMultiple");
  wb.definedNames.add(`'Cashflow'!$B$${rows.kpmax}`, "KP_max_DCF");
  // Zeile 3 enthält die Jahreszahlen für Formeln (weiß auf Walnuss, unsichtbar)
  for (let y = 0; y <= N; y++) wsC.getCell(3, col0 + y).value = y;

  // ------------------------------------------------------------ Sensitivität
  setupSheet(wsS, "Sensitivität", sub, [30, ...Array(12).fill(14)]);
  const xKey = opts.sensX ?? "faktorIst";
  const yKey = opts.sensY ?? "exitFaktor";
  const oKey = opts.sensOut ?? "irr";
  const xd = driver(xKey);
  const ydr = driver(yKey);
  const out = output(oKey);
  const xs = axis(xd.get(deal), xd.step, 3, xd.min);
  const ys = axis(ydr.get(deal), ydr.step, 3, ydr.min);
  const g = grid(deal, xKey, xs, yKey, ys, oKey);
  r = 5;
  section(wsS, r++, `${out.label} · ${ydr.label} (Zeilen) × ${xd.label} (Spalten)`, xs.length + 1);
  const fmtOf = (k: string) => ({ eur: F.eur, pct: F.pct, x: F.x, num: F.num2, yrs: F.yrs, eurqm: F.eur2, mon: F.mon })[k] ?? F.num2;
  wsS.getCell(r, 1).value = `${ydr.label} ↓ / ${xd.label} →`;
  wsS.getCell(r, 1).font = font(true, C.white, 9);
  wsS.getCell(r, 1).fill = fill(C.walnutLight);
  xs.forEach((x, i) => {
    const c = wsS.getCell(r, 2 + i);
    c.value = x;
    c.numFmt = fmtOf(xd.fmt);
    c.font = font(true, C.white, 9);
    c.fill = fill(C.walnutLight);
    c.alignment = { horizontal: "center" };
  });
  const gTop = r + 1;
  ys.forEach((yv, j) => {
    const row = gTop + j;
    const lc = wsS.getCell(row, 1);
    lc.value = yv;
    lc.numFmt = fmtOf(ydr.fmt);
    lc.font = font(true);
    lc.fill = fill(C.brassLight);
    xs.forEach((_, i) => {
      const c = wsS.getCell(row, 2 + i);
      const v = g.values[j][i];
      c.value = Number.isFinite(v) ? v : "n/a";
      c.numFmt = fmtOf(out.fmt);
      c.alignment = { horizontal: "center" };
      c.border = { top: thin(), bottom: thin(), left: thin(), right: thin() };
    });
  });
  wsS.addConditionalFormatting({
    ref: `B${gTop}:${colL(1 + xs.length)}${gTop + ys.length - 1}`,
    rules: [
      {
        type: "colorScale",
        priority: 1,
        cfvo: [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }],
        color: out.higherIsBetter ? [{ argb: "FFE8B9A8" }, { argb: "FFF8F1E4" }, { argb: "FFB9CC98" }] : [{ argb: "FFB9CC98" }, { argb: "FFF8F1E4" }, { argb: "FFE8B9A8" }],
      },
    ],
  });
  r = gTop + ys.length + 2;
  section(wsS, r++, `Tornado · Einfluss auf ${out.label} (± 1 Schritt)`, 5);
  header(wsS, r++, ["Treiber", "Wert tief", "Ergebnis tief", "Wert hoch", "Ergebnis hoch", "Spanne"]);
  const tor = tornado(deal, oKey, ["exitFaktor", "marktmiete", "mietwachstum", "leerstandMonate", "umbau", "zins", "faktorIst", "instandhaltung", "verlaengerung"]);
  for (const b of tor.bars) {
    const dr = driver(b.key);
    const vals: [ExcelJS.CellValue, string][] = [
      [b.label, "@"],
      [b.lowValue, fmtOf(dr.fmt)],
      [Number.isFinite(b.low) ? b.low : "n/a", fmtOf(out.fmt)],
      [b.highValue, fmtOf(dr.fmt)],
      [Number.isFinite(b.high) ? b.high : "n/a", fmtOf(out.fmt)],
      [Number.isFinite(b.spread) ? b.spread : "n/a", fmtOf(out.fmt)],
    ];
    vals.forEach(([v, fmt], i) => {
      const c = wsS.getCell(r, 1 + i);
      c.value = v;
      c.numFmt = fmt;
      c.font = font(i === 0);
    });
    r++;
  }
  r++;
  const scen = opts.scenarios ?? defaultScenarios(deal);
  section(wsS, r++, "Szenarien", scen.length + 1);
  header(wsS, r++, ["Kennzahl", ...scen.map((s) => s.name)]);
  const scenRes = scen.map((s) => evalWith(deal, s.changes));
  const kpis: [string, (x: Analysis) => number, string][] = [
    ["IRR ungehebelt", (x) => x.cf.irr, F.pct],
    ["IRR gehebelt", (x) => x.cf.irrLevered, F.pct],
    ["Kapitalwert (NPV)", (x) => x.cf.npv, F.eur],
    ["Equity Multiple", (x) => x.cf.equityMultiple, F.x],
    ["Max. Kaufpreis (DCF)", (x) => x.cf.kaufpreisMaxDcf, F.eur],
    ["Exit-Wert", (x) => x.cf.exitWert, F.eur],
    ["Ø Cash-on-Cash", (x) => x.cf.avgCoc, F.pct],
  ];
  for (const [label, fn, fmt] of kpis) {
    wsS.getCell(r, 1).value = label;
    wsS.getCell(r, 1).font = font(true);
    scenRes.forEach((res, i) => {
      const v = fn(res);
      const c = wsS.getCell(r, 2 + i);
      c.value = Number.isFinite(v) ? v : "n/a";
      c.numFmt = fmt;
    });
    r++;
  }
  wsS.getCell(r + 1, 1).value = "Sensitivitäten sind im Tool berechnete Werte (vollständige Neuberechnung je Zelle inkl. monatlicher Mietsimulation).";
  wsS.getCell(r + 1, 1).font = { ...font(false, C.muted, 8), italic: true };

  // ------------------------------------------------------------ BOV
  const bov = bovResult(deal, a);
  setupSheet(wsB, "Broker Opinion of Value", sub, [40, 18, 18, 18, 12, 40]);
  r = 5;
  section(wsB, r++, "Wertherleitung", 6);
  header(wsB, r++, ["Methode", "von", "Mittel", "bis", "Gewicht", "Annahme"]);
  for (const m of bov.methods) {
    const vals: [ExcelJS.CellValue, string][] = [
      [m.label, "@"],
      [m.low, F.eur],
      [m.mid, F.eur],
      [m.high, F.eur],
      [m.weight, "0%"],
      [m.note, "@"],
    ];
    vals.forEach(([v, fmt], i) => {
      const c = wsB.getCell(r, 1 + i);
      c.value = v;
      c.numFmt = fmt;
      c.font = font(i === 0);
    });
    r++;
  }
  const bTop = r - bov.methods.length;
  wsB.getCell(r, 1).value = "Gewichteter Marktwert (Kaufpreis netto)";
  wsB.getCell(r, 1).font = font(true);
  wsB.getCell(r, 3).value = f(`IFERROR(SUMPRODUCT(C${bTop}:C${r - 1},E${bTop}:E${r - 1})/SUM(E${bTop}:E${r - 1}),0)`, bov.wert);
  calcStyle(wsB.getCell(r, 3), F.eur, true);
  wsB.getCell(r, 2).value = f(`C${r}*(1-${deal.bov.spanne})`);
  calcStyle(wsB.getCell(r, 2), F.eur, true);
  wsB.getCell(r, 4).value = f(`C${r}*(1+${deal.bov.spanne})`);
  calcStyle(wsB.getCell(r, 4), F.eur, true);
  for (let c = 1; c <= 6; c++) wsB.getCell(r, c).fill = fill(C.brassLight);
  const wRow = r++;
  const bk: [string, string, string][] = [
    ["Faktor (Ist) beim Marktwert", `IF(IstMiete>0,C${wRow}/IstMiete,0)`, F.x],
    ["€/m² beim Marktwert", `IF(FlaecheM2>0,C${wRow}/FlaecheM2,0)`, F.eur],
    ["Bruttoanfangsrendite beim Marktwert", `IF(C${wRow}>0,IstMiete/C${wRow},0)`, F.pct],
    ["Abweichung Kaufpreis (Annahmen) zum Marktwert", `IF(C${wRow}>0,Kaufpreis_netto/C${wRow}-1,0)`, F.pct],
  ];
  for (const [label, fo, fmt] of bk) {
    wsB.getCell(r, 1).value = label;
    wsB.getCell(r, 1).font = font();
    calcStyle(Object.assign(wsB.getCell(r, 3), { value: f(fo) }), fmt);
    r++;
  }
  if (deal.bov.vergleiche.length) {
    r++;
    section(wsB, r++, "Vergleichstransaktionen", 6);
    header(wsB, r++, ["Objekt", "Ort", "Datum", "Fläche m²", "€/m²", "Faktor"]);
    for (const v of deal.bov.vergleiche) {
      const vals: [ExcelJS.CellValue, string][] = [
        [v.name, "@"],
        [v.ort, "@"],
        [v.datum, "@"],
        [v.flaeche, F.num],
        [v.preisQm, F.eur],
        [v.faktor, F.x],
      ];
      vals.forEach(([val, fmt], i) => {
        const c = wsB.getCell(r, 1 + i);
        c.value = val;
        inputStyle(c, fmt);
      });
      r++;
    }
  }
  const texts: [string, string][] = [
    ["Stärken", deal.bov.staerken],
    ["Schwächen", deal.bov.schwaechen],
    ["Chancen", deal.bov.chancen],
    ["Risiken", deal.bov.risiken],
    ["Zielgruppe / Käuferprofil", deal.bov.zielgruppe],
    ["Vermarktungsstrategie", deal.bov.strategie],
  ];
  r++;
  section(wsB, r++, "Einschätzung", 6);
  for (const [label, text] of texts) {
    if (!text) continue;
    wsB.getCell(r, 1).value = label;
    wsB.getCell(r, 1).font = font(true);
    wsB.mergeCells(r, 2, r, 6);
    wsB.getCell(r, 2).value = text;
    wsB.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
    wsB.getRow(r).height = Math.min(120, 16 * Math.ceil(text.length / 90) + 4);
    r++;
  }

  // ------------------------------------------------------------ Übersicht
  setupSheet(wsU, deal.objekt.name || "Investment Summary", sub, [34, 22, 4, 34, 22]);
  r = 5;
  section(wsU, r++, "Objekt", 5);
  const o = deal.objekt;
  const facts: [string, ExcelJS.CellValue][] = [
    ["Adresse", [o.adresse, [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
    ["Objektart", o.objektart],
    ["Baujahr / Modernisierung", [o.baujahr, o.modernisierung].filter(Boolean).join(" / ")],
    ["Grundstück", o.grundstueck || ""],
    ["Stellplätze", o.stellplaetze || ""],
    ["Mieter (Anzahl)", a.s.anzahlMieter],
    ["Bundesland", o.bundesland],
  ];
  facts.forEach(([l, v], i) => {
    wsU.getCell(r + i, 1).value = l;
    wsU.getCell(r + i, 1).font = font(false, C.muted);
    wsU.getCell(r + i, 2).value = v;
    wsU.getCell(r + i, 2).font = font(true);
    if (l === "Grundstück" && v) wsU.getCell(r + i, 2).numFmt = F.m2;
  });
  const kpiTop = r;
  const kpi: [string, string, string][] = [
    ["Kaufpreis netto", "Kaufpreis_netto", F.eur],
    ["Gesamtinvestition", `Kaufpreis!${K("gi")}`, F.eur],
    ["Kaufpreisfaktor (Ist)", `Kaufpreis!${K("fi")}`, F.x],
    ["Kaufpreis je m²", `Kaufpreis!${K("qm")}`, F.eur],
    ["Bruttoanfangsrendite", `Kaufpreis!${K("bar")}`, F.pct],
    ["Nettoanfangsrendite", `Kaufpreis!${K("niy")}`, F.pct],
    ["Ist-Miete p.a.", "IstMiete", F.eur],
    ["Potenzialmiete p.a.", "Potenzial", F.eur],
    ["Mietfläche", "FlaecheM2", F.m2],
    ["Leerstand (Fläche)", `Nutzungsarten!$D$${aTot}`, F.pct],
    ["WALT", "WALT", F.yrs],
    ["IRR ungehebelt", "IRR_unlev", F.pct],
    ["IRR gehebelt", "IRR_lev", F.pct],
    ["Equity Multiple", "EquityMultiple", F.x],
    ["Max. Kaufpreis (DCF)", "KP_max_DCF", F.eur],
  ];
  kpi.forEach(([l, fo, fmt], i) => {
    const row = kpiTop - 1 + i;
    wsU.getCell(row, 4).value = l;
    wsU.getCell(row, 4).font = font(false, C.muted);
    const c = wsU.getCell(row, 5);
    c.value = f(fo);
    calcStyle(c, fmt, true);
    c.border = { bottom: thin() };
  });
  wsU.getCell(kpiTop - 2, 4).value = "KENNZAHLEN";
  wsU.getCell(kpiTop - 2, 4).font = { name: "Arial", size: 10, color: { argb: C.walnut }, bold: true };
  r = kpiTop + kpi.length + 1;
  section(wsU, r++, "Inhalt", 5);
  const toc: [string, string][] = [
    ["Annahmen", "Alle Eingaben an einer Stelle — blau hinterlegt"],
    ["Mieterliste", "Einheiten, Restlaufzeiten, Marktmieten, Vermietungskosten"],
    ["Nutzungsarten", "Annahmen und WALT je Nutzungsart"],
    ["Kaufpreis", "Nebenkosten, Faktor, Renditen, Faktormethode"],
    ["Cashflow", "DCF mit Finanzierung, IRR, NPV"],
    ["Sensitivität", "Matrix, Tornado, Szenarien"],
    ["BOV", "Wertherleitung und Einschätzung"],
  ];
  for (const [sheet, desc] of toc) {
    const c = wsU.getCell(r, 1);
    c.value = { text: sheet, hyperlink: `#'${sheet}'!A1` };
    c.font = { ...font(true, C.input), underline: true };
    wsU.getCell(r, 2).value = desc;
    wsU.getCell(r, 2).font = font(false, C.muted, 9);
    r++;
  }
  r++;
  wsU.getCell(r, 1).value = `Erstellt am ${fmtDate(new Date().toISOString().slice(0, 10))} mit dem Savills Investment Tool. Alle Kennzahlen sind Formeln und rechnen bei Änderung der Annahmen neu.`;
  wsU.getCell(r, 1).font = { ...font(false, C.muted, 8), italic: true };
  void marktmieteQm;
  void nkQuote;
  return wb;
}

export async function exportXlsx(deal: Deal, opts: ExportOptions = {}): Promise<Blob> {
  const wb = await buildWorkbook(deal, opts);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const [y, m, dd] = iso.split("-");
  return `${dd}.${m}.${y}`;
}
