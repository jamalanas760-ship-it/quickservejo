import { openPdf } from "@/lib/pdf-menu";

export async function extractPdfTextForArea(source: ArrayBuffer, pageNumber: number, rect: { x: number; y: number; width: number; height: number }): Promise<string> {
  const pdf = await openPdf(source);
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const left = rect.x * viewport.width;
  const top = rect.y * viewport.height;
  const right = left + rect.width * viewport.width;
  const bottom = top + rect.height * viewport.height;
  const rows: Array<{ text: string; x: number; y: number }> = [];
  for (const item of content.items ?? []) {
    if (!item || typeof (item as any).str !== "string" || !(item as any).str.trim()) continue;
    const transform = Array.isArray((item as any).transform) ? (item as any).transform : [1, 0, 0, 1, 0, 0];
    const x = Number(transform[4]) || 0;
    const baseline = Number(transform[5]) || 0;
    const height = Math.max(5, Math.abs(Number(transform[3]) || Number((item as any).height) || 10));
    const y = Math.max(0, viewport.height - baseline - height);
    const width = Math.max(4, Number((item as any).width) || String((item as any).str).length * height * 0.45);
    if (x < right && x + width > left && y < bottom && y + height > top) rows.push({ text: String((item as any).str).trim(), x, y });
  }
  rows.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: string[] = [];
  for (const row of rows) {
    const previous = lines.length ? lines[lines.length - 1] : "";
    lines.push(previous ? `${previous} ${row.text}`.replace(/\s+/g, " ").trim() : row.text);
  }
  return lines.join("\n").slice(0, 12000);
}
