export type PdfMenuCandidate = {
  id: string;
  page_number: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

export type PdfMenuAnalysis = {
  page_count: number;
  pages: { page_number: number; width: number; height: number }[];
  candidates: PdfMenuCandidate[];
};

type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (source: { data: ArrayBuffer | Uint8Array; useWorkerFetch?: boolean }) => { promise: Promise<any> };
};

type PdfTextLine = { text: string; x: number; y: number; width: number; height: number };

declare global {
  interface Window { pdfjsLib?: PdfJs; __quickservePdfJsPromise?: Promise<PdfJs>; }
}

const PDF_JS_VERSION = "3.11.174";
const PDF_JS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.min.js`;
const PDF_WORKER_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.worker.min.js`;

// Keep a small browser-side PDF byte cache so returning to the Menu tab or
// moving between pages does not download the same PDF again. Large PDFs are
// deliberately not retained to avoid turning the app into a memory hog.
const PDF_BYTE_CACHE_LIMIT = 32 * 1024 * 1024;
const pdfByteCache = new Map<string, { buffer: ArrayBuffer; lastUsed: number }>();
const pdfDocumentCache = new WeakMap<ArrayBuffer, Promise<any>>();

function pdfCacheKey(url: string, parts: string[]): string {
  return `${url}|${parts.join("|")}`;
}

function getCachedPdfBytes(key: string): ArrayBuffer | null {
  const cached = pdfByteCache.get(key);
  if (!cached) return null;
  cached.lastUsed = Date.now();
  return cached.buffer;
}

function cachePdfBytes(key: string, buffer: ArrayBuffer): void {
  if (buffer.byteLength > PDF_BYTE_CACHE_LIMIT) return;
  pdfByteCache.set(key, { buffer, lastUsed: Date.now() });
  let total = 0;
  for (const entry of pdfByteCache.values()) total += entry.buffer.byteLength;
  if (total <= PDF_BYTE_CACHE_LIMIT) return;
  const oldest = [...pdfByteCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [oldKey, entry] of oldest) {
    if (total <= PDF_BYTE_CACHE_LIMIT) break;
    pdfByteCache.delete(oldKey);
    total -= entry.buffer.byteLength;
  }
}

export function loadPdfJs(): Promise<PdfJs> {
  if (typeof window === "undefined") throw new Error("PDF rendering requires a browser");
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (window.__quickservePdfJsPromise) return window.__quickservePdfJsPromise;
  window.__quickservePdfJsPromise = new Promise<PdfJs>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-quickserve-pdfjs="${PDF_JS_VERSION}"]`);
    if (existing) {
      existing.addEventListener("load", () => window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error("PDF.js loaded without an API")), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load PDF.js")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = PDF_JS_URL;
    script.async = true;
    script.dataset.quickservePdfjs = PDF_JS_VERSION;
    script.onload = () => window.pdfjsLib ? (window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL, resolve(window.pdfjsLib)) : reject(new Error("PDF.js loaded without an API"));
    script.onerror = () => reject(new Error("Could not load PDF.js"));
    document.head.appendChild(script);
  });
  return window.__quickservePdfJsPromise;
}

export async function openPdf(source: ArrayBuffer | Uint8Array | string): Promise<any> {
  const pdfjs = await loadPdfJs();
  if (typeof source === "string") return pdfjs.getDocument({ data: new TextEncoder().encode(source) }).promise;
  const buffer = source instanceof Uint8Array ? source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) : source;
  const cached = pdfDocumentCache.get(buffer);
  if (cached) return cached;
  const promise = pdfjs.getDocument({ data: buffer }).promise;
  pdfDocumentCache.set(buffer, promise);
  return promise;
}

export async function fetchPdfBytes(url: string, parts: string[] = []): Promise<ArrayBuffer> {
  const key = pdfCacheKey(url, parts);
  const cached = getCachedPdfBytes(key);
  if (cached) return cached;

  const sources = parts.length ? parts : [url];
  const buffers = await Promise.all(sources.map(async (source) => {
    const response = await fetch(source, { cache: "force-cache" });
    if (!response.ok) throw new Error("PDF could not be loaded");
    return response.arrayBuffer();
  }));
  if (buffers.length === 1) {
    cachePdfBytes(key, buffers[0]);
    return buffers[0];
  }
  const total = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const buffer of buffers) { combined.set(new Uint8Array(buffer), offset); offset += buffer.byteLength; }
  cachePdfBytes(key, combined.buffer);
  return combined.buffer;
}

/**
 * Extract complete menu-item blocks rather than individual PDF text fragments.
 * The original PDF is never modified; these rectangles are only click targets.
 */
export async function analyzePdfFile(file: File): Promise<{ buffer: ArrayBuffer; analysis: PdfMenuAnalysis }> {
  const buffer = await file.arrayBuffer();
  const pdf = await openPdf(buffer);
  const pages: PdfMenuAnalysis["pages"] = [];
  const candidates: PdfMenuCandidate[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ page_number: pageNumber, width: viewport.width, height: viewport.height });
    const content = await page.getTextContent();
    const raw = (content.items ?? []).filter((item: any) => typeof item?.str === "string" && item.str.trim());
    const lines = mergePdfTextLines(raw, viewport.height);
    const blocks = buildMenuBlocks(lines);

    for (const [index, block] of blocks.entries()) {
      const text = block.lines.map((line) => line.text).join(" ").replace(/\s+/g, " ").trim();
      if (!isUsefulMenuBlock(block, text)) continue;
      const titleLine = block.lines.find((line) => !hasPrice(line.text) && !isLikelyDescription(line.text)) ?? block.lines[0];
      const hasAssociatedPrice = block.lines.some((line) => hasPrice(line.text));
      const confidence = Math.min(0.98, 0.55 + (hasAssociatedPrice ? 0.22 : 0) + (block.lines.length > 1 ? 0.12 : 0) + (looksTitleLike(titleLine, block.lines) ? 0.08 : 0));
      candidates.push({ id: `p${pageNumber}-item${index}`, page_number: pageNumber, text, x: clamp01(block.x / viewport.width), y: clamp01(block.y / viewport.height), width: clamp01(block.width / viewport.width), height: clamp01(block.height / viewport.height), confidence });
    }
  }
  return { buffer, analysis: { page_count: pdf.numPages, pages, candidates } };
}

function mergePdfTextLines(raw: any[], pageHeight: number): PdfTextLine[] {
  const lines: PdfTextLine[] = [];
  for (const item of raw) {
    const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
    const x = Number(transform[4]) || 0;
    const baseline = Number(transform[5]) || 0;
    const height = Math.max(5, Math.abs(Number(transform[3]) || Number(item.height) || 10));
    const y = Math.max(0, pageHeight - baseline - height);
    const width = Math.max(4, Number(item.width) || item.str.length * height * 0.45);
    const existing = lines.find((line) => Math.abs(line.y - y) <= Math.max(3, height * 0.55) && horizontalDistance(line, x, width) <= Math.max(18, height * 2));
    if (existing) {
      const before = x < existing.x;
      existing.text = before ? `${item.str.trim()} ${existing.text}` : `${existing.text} ${item.str.trim()}`;
      existing.x = Math.min(existing.x, x);
      existing.width = Math.max(existing.x + existing.width, x + width) - existing.x;
      existing.height = Math.max(existing.height, height);
    } else lines.push({ text: item.str.trim(), x, y, width, height });
  }
  return lines.sort((a, b) => a.y - b.y || a.x - b.x);
}

function buildMenuBlocks(lines: PdfTextLine[]): { lines: PdfTextLine[]; x: number; y: number; width: number; height: number }[] {
  if (!lines.length) return [];
  const medianHeight = median(lines.map((line) => line.height));
  const blocks: { lines: PdfTextLine[]; x: number; y: number; width: number; height: number }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!isTitleLikeLine(line, medianHeight) || isNonProductText(line.text)) continue;
    const blockLines = [line];
    let last = line;
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j];
      const gap = next.y - (last.y + last.height);
      const sameColumn = horizontalOverlap(last, next) >= 0.15 || Math.abs(next.x - line.x) <= Math.max(36, line.height * 4);
      const compact = gap <= Math.max(18, medianHeight * 1.8);
      if (!sameColumn || !compact || isSectionHeader(next.text) || isNonProductText(next.text)) break;
      blockLines.push(next);
      last = next;
      if (hasPrice(next.text)) break;
    }
    blocks.push({ lines: blockLines, ...rectangleFor(blockLines) });
    i += blockLines.length - 1;
  }
  return blocks;
}

function isTitleLikeLine(line: PdfTextLine, medianHeight: number): boolean {
  const text = line.text.trim();
  if (isNonProductText(text) || hasPrice(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= 2 || line.height >= medianHeight * 1.08;
}

function isUsefulMenuBlock(block: { lines: PdfTextLine[] }, text: string): boolean {
  if (!text || text.length < 2 || text.length > 500 || isNonProductText(text)) return false;
  if (block.lines.length === 1 && !hasPrice(text) && text.split(/\s+/).length < 2) return false;
  return block.lines.some((line) => !isNonProductText(line.text) && (line.text.split(/\s+/).length >= 2 || line.height >= 12 || hasPrice(line.text)));
}

function looksTitleLike(line: PdfTextLine, blockLines: PdfTextLine[]): boolean {
  const maxHeight = Math.max(...blockLines.map((item) => item.height));
  return line.height >= maxHeight * 0.92 || line.text.split(/\s+/).length <= 8;
}

function isLikelyDescription(text: string): boolean {
  return text.split(/\s+/).filter(Boolean).length >= 8 || /[.!،؛]/.test(text);
}

function isSectionHeader(text: string): boolean {
  const normalized = normalizeText(text);
  return ["menu", "food menu", "drinks", "beverages", "appetizers", "starters", "main course", "mains", "desserts", "salads", "sandwiches", "burgers", "pizza", "pasta", "القائمة", "المقبلات", "السلطات", "السندويشات", "البرغر", "الحلويات", "المشروبات"].includes(normalized);
}

function isNonProductText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || /^(menu|page|contents|tel|phone|fax|email|www|https?)/i.test(text.trim()) || /^\d+$/.test(normalized) || isSectionHeader(text)) return true;
  const nonProduct = ["garlic", "onion", "lettuce", "tomato", "cheese", "sauce", "ketchup", "mayo", "mayonnaise", "pickles", "parsley", "pepper", "salt", "olive oil", "thyme", "basil", "زعتر", "ثوم", "بصل", "خس", "طماطم", "جبنة", "صوص", "مخلل", "بقدونس"];
  return nonProduct.includes(normalized) || /^(ingredients?|المكونات?)\s*[:：]/i.test(text);
}

export function hasPrice(text: string): boolean {
  return /(?:\d+(?:[.,]\d{1,2})?\s*(?:jd|jod|aed|sar|usd|eur|€|\$|£)|(?:jd|jod|aed|sar|usd|eur)\s*\d|\d+[.,]\d{2})/i.test(text);
}

function normalizeText(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function horizontalDistance(line: PdfTextLine, x: number, width: number): number {
  const right = line.x + line.width;
  if ((x >= line.x && x <= right) || (x + width >= line.x && x + width <= right)) return 0;
  return Math.min(Math.abs(x - right), Math.abs(line.x - (x + width)));
}

function horizontalOverlap(a: PdfTextLine, b: PdfTextLine): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  return Math.max(0, right - left) / Math.max(1, Math.min(a.width, b.width));
}

function rectangleFor(lines: PdfTextLine[]) {
  const x = Math.min(...lines.map((line) => line.x));
  const y = Math.min(...lines.map((line) => line.y));
  const right = Math.max(...lines.map((line) => line.x + line.width));
  const bottom = Math.max(...lines.map((line) => line.y + line.height));
  return { x, y, width: right - x, height: bottom - y };
}

function median(values: number[]): number {
  if (!values.length) return 10;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

export async function renderPdfPage(pdf: any, pageNumber: number, canvas: HTMLCanvasElement, maxWidth = 1200): Promise<{ width: number; height: number }> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2, Math.max(1, maxWidth / base.width));
  const viewport = page.getViewport({ scale });
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return { width: viewport.width, height: viewport.height };
}
