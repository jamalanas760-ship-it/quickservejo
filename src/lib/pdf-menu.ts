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

declare global {
  interface Window {
    pdfjsLib?: PdfJs;
    __quickservePdfJsPromise?: Promise<PdfJs>;
  }
}

const PDF_JS_VERSION = "3.11.174";
const PDF_JS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.min.js`;
const PDF_WORKER_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.worker.min.js`;

/** Loads PDF.js only when the PDF menu feature is actually used. */
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
    script.onload = () => {
      if (!window.pdfjsLib) {
        reject(new Error("PDF.js loaded without an API"));
        return;
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Could not load PDF.js"));
    document.head.appendChild(script);
  });

  return window.__quickservePdfJsPromise;
}

export async function openPdf(source: ArrayBuffer | Uint8Array | string): Promise<any> {
  const pdfjs = await loadPdfJs();
  if (typeof source === "string") {
    return pdfjs.getDocument({ data: new TextEncoder().encode(source) }).promise;
  }
  return pdfjs.getDocument({ data: source }).promise;
}

/**
 * Extracts text blocks with their real PDF coordinates. The original PDF is never
 * rewritten; these coordinates are only used for transparent click targets.
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

    const lines: { text: string; x: number; y: number; width: number; height: number }[] = [];
    for (const item of raw) {
      const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
      const x = Number(transform[4]) || 0;
      const baseline = Number(transform[5]) || 0;
      const height = Math.max(5, Math.abs(Number(transform[3]) || Number(item.height) || 10));
      const top = Math.max(0, viewport.height - baseline - height);
      const width = Math.max(4, Number(item.width) || item.str.length * height * 0.45);
      const existing = lines.find((line) => Math.abs(line.y - top) <= Math.max(3, height * 0.55));
      if (existing) {
        const before = x < existing.x;
        existing.text = before ? `${item.str.trim()} ${existing.text}` : `${existing.text} ${item.str.trim()}`;
        existing.x = Math.min(existing.x, x);
        existing.width = Math.max(existing.x + existing.width, x + width) - existing.x;
        existing.height = Math.max(existing.height, height);
      } else {
        lines.push({ text: item.str.trim(), x, y: top, width, height });
      }
    }

    lines.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const [index, line] of lines.entries()) {
      const text = line.text.replace(/\s+/g, " ").trim();
      if (!looksLikeMenuCandidate(text, line.height)) continue;
      const price = hasPrice(text);
      const words = text.split(/\s+/).length;
      const confidence = Math.min(0.99, 0.45 + (price ? 0.35 : 0) + (words >= 2 ? 0.12 : 0) + Math.min(0.07, line.height / 200));
      candidates.push({
        id: `p${pageNumber}-c${index}`,
        page_number: pageNumber,
        text,
        x: clamp01(line.x / viewport.width),
        y: clamp01(line.y / viewport.height),
        width: clamp01(line.width / viewport.width),
        height: clamp01(Math.max(line.height * 1.8, 20) / viewport.height),
        confidence,
      });
    }
  }

  return { buffer, analysis: { page_count: pdf.numPages, pages, candidates } };
}

function looksLikeMenuCandidate(text: string, height: number): boolean {
  if (text.length < 2 || text.length > 180) return false;
  if (/^(menu|القائمة|contents|page|tel|phone|www\.|https?:\/\/)/i.test(text)) return false;
  if (/^\d+$/.test(text)) return false;
  const price = hasPrice(text);
  const words = text.split(/\s+/).length;
  return price || words >= 2 || height >= 14;
}

export function hasPrice(text: string): boolean {
  return /(?:\d+(?:[.,]\d{1,2})?\s*(?:jd|jod|aed|sar|usd|€|\$|£)|(?:jd|jod|aed|sar|usd)\s*\d|\d+[.,]\d{2})/i.test(text);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export async function renderPdfPage(
  pdf: any,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  maxWidth = 1200,
): Promise<{ width: number; height: number }> {
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
