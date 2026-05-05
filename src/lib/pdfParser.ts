import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

// Vite resolves new URL(..., import.meta.url) at build time
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

interface RawItem { text: string; x: number; y: number; endX: number; }

// Merge horizontally adjacent items (split words within the same cell)
function mergeRow(items: RawItem[], gapThreshold = 6): string[] {
  items.sort((a, b) => a.x - b.x);
  const cells: string[] = [];
  let current: RawItem | null = null;

  for (const item of items) {
    if (!current) { current = { ...item }; continue; }
    const gap = item.x - current.endX;
    if (gap <= gapThreshold) {
      // Same cell — append with space only if there's a real gap
      current.text += (gap > 1 ? ' ' : '') + item.text;
      current.endX = Math.max(current.endX, item.endX);
    } else {
      cells.push(current.text.trim());
      current = { ...item };
    }
  }
  if (current) cells.push(current.text.trim());
  return cells.filter(Boolean);
}

export async function parsePDF(data: ArrayBuffer): Promise<unknown[][]> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const allRows: unknown[][] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Collect items with position info
    const items: RawItem[] = [];
    for (const raw of content.items) {
      const item = raw as TextItem;
      if (!item.str?.trim()) continue;
      const x   = item.transform[4];
      const y   = item.transform[5];
      const w   = item.width ?? 0;
      items.push({ text: item.str.trim(), x, y: Math.round(y), endX: x + w });
    }

    if (items.length === 0) continue;

    // Group by y-coordinate with ±3px tolerance
    const rowMap = new Map<number, RawItem[]>();
    for (const item of items) {
      let key = -1;
      for (const [k] of rowMap) {
        if (Math.abs(k - item.y) <= 3) { key = k; break; }
      }
      if (key === -1) rowMap.set(item.y, [item]);
      else rowMap.get(key)!.push(item);
    }

    // Sort rows top-to-bottom (PDF y increases upward, so descending = top-first)
    const sortedRows = Array.from(rowMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, rowItems]) => mergeRow(rowItems));

    for (const row of sortedRows) {
      if (row.length > 0) allRows.push(row);
    }
  }

  return allRows;
}
