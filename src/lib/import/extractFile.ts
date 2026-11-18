"use client";
// Liest hochgeladene Dateien im Browser: Text + Tabellen, optional die Originaldatei für die KI.
import type { Row } from "./rentroll";
import { pdfItemsToLines, type PdfItem } from "./pdfLines";

export interface Extracted {
  fileName: string;
  kind: "excel" | "csv" | "pdf" | "docx" | "text" | "image";
  text: string;
  tables: { name: string; rows: Row[] }[];
  attachment?: { mediaType: string; data: string }; // base64 für die KI (PDF/Bild)
}

const MAX_ATTACH = 3_000_000; // Vercel-Requestlimit 4,5 MB, Base64 +33 %

export async function extractFile(file: File): Promise<Extracted> {
  const name = file.name;
  const lower = name.toLowerCase();
  if (/\.(xlsx|xlsm|xls|ods)$/.test(lower)) return extractExcel(file);
  if (/\.(csv|tsv)$/.test(lower)) return extractCsv(file);
  if (lower.endsWith(".pdf") || file.type === "application/pdf") return extractPdf(file);
  if (lower.endsWith(".docx")) return extractDocx(file);
  if (/\.(png|jpe?g|webp|gif)$/.test(lower) || file.type.startsWith("image/")) return extractImage(file);
  const text = await file.text();
  return { fileName: name, kind: "text", text, tables: [] };
}

async function extractExcel(file: File): Promise<Extracted> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const tables = wb.SheetNames.map((n) => ({
    name: n,
    rows: XLSX.utils.sheet_to_json<Row>(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true }) as Row[],
  }));
  const text = wb.SheetNames.map((n) => `### Tabellenblatt: ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: "\t", blankrows: false })).join("\n\n");
  return { fileName: file.name, kind: "excel", text, tables };
}

async function extractCsv(file: File): Promise<Extracted> {
  const XLSX = await import("xlsx");
  const raw = await file.text();
  const wb = XLSX.read(raw, { type: "string", FS: raw.split("\n")[0].includes(";") ? ";" : undefined } as never);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, raw: false, defval: null }) as Row[];
  return { fileName: file.name, kind: "csv", text: raw, tables: [{ name: file.name, rows }] };
}

async function extractPdf(file: File): Promise<Extracted> {
  const buf = await file.arrayBuffer();
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const out = pdfItemsToLines(content.items as PdfItem[]);
    pages.push(out.join("\n"));
  }
  const text = pages.map((p, i) => `--- Seite ${i + 1} ---\n${p}`).join("\n\n");
  const tables = pages.map((p, i) => ({ name: `Seite ${i + 1}`, rows: p.split("\n").map((l) => (l.includes("\t") ? l.split("\t") : l.split(/\s{2,}/))) }));
  const attachment = file.size <= MAX_ATTACH ? { mediaType: "application/pdf", data: await toBase64(buf) } : undefined;
  return { fileName: file.name, kind: "pdf", text, tables, attachment };
}

async function extractDocx(file: File): Promise<Extracted> {
  const mammoth = await import("mammoth");
  const buf = await file.arrayBuffer();
  const [{ value: text }, { value: html }] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer: buf }),
    mammoth.convertToHtml({ arrayBuffer: buf }),
  ]);
  const tables: { name: string; rows: Row[] }[] = [];
  const dom = new DOMParser().parseFromString(html, "text/html");
  dom.querySelectorAll("table").forEach((t, i) => {
    const rows: Row[] = [];
    t.querySelectorAll("tr").forEach((tr) => rows.push([...tr.querySelectorAll("td,th")].map((c) => c.textContent?.trim() ?? "")));
    tables.push({ name: `Tabelle ${i + 1}`, rows });
  });
  const tableText = tables.map((t) => `### ${t.name}\n` + t.rows.map((r) => r.join("\t")).join("\n")).join("\n\n");
  return { fileName: file.name, kind: "docx", text: text + (tableText ? "\n\n" + tableText : ""), tables };
}

async function extractImage(file: File): Promise<Extracted> {
  const buf = await file.arrayBuffer();
  const mediaType = file.type || "image/png";
  return {
    fileName: file.name,
    kind: "image",
    text: "",
    tables: [],
    attachment: file.size <= MAX_ATTACH ? { mediaType, data: await toBase64(buf) } : undefined,
  };
}

async function toBase64(buf: ArrayBuffer): Promise<string> {
  const blob = new Blob([buf]);
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
