// Baut aus PDF-Textfragmenten Zeilen; große horizontale Lücken werden zu Tabs (= Spalten).
export interface PdfItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export function pdfItemsToLines(raw: PdfItem[]): string[] {
  type It = { x: number; y: number; w: number; s: string; h: number };
  const items: It[] = [];
  for (const it of raw) {
    if (!it.str || !it.str.trim()) continue;
    items.push({ x: it.transform[4], y: it.transform[5], w: it.width, s: it.str, h: it.height || Math.abs(it.transform[3]) || 10 });
  }
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: It[][] = [];
  for (const it of items) {
    const line = lines.find((l) => Math.abs(l[0].y - it.y) < Math.max(2, it.h * 0.4));
    if (line) line.push(it);
    else lines.push([it]);
  }
  return lines
    .sort((a, b) => b[0].y - a[0].y)
    .map((l) => {
      l.sort((a, b) => a.x - b.x);
      let s = "";
      let end = -Infinity;
      for (const it of l) {
        const gap = it.x - end;
        // Wortabstand ≈ 0,28 × Schriftgröße; deutlich größere Lücken = neue Spalte
        const colGap = Math.max(3.5, it.h * 0.45);
        if (s) s += gap > colGap ? "\t" : gap > it.h * 0.12 ? " " : "";
        s += it.s;
        end = it.x + it.w;
      }
      return s;
    });
}
