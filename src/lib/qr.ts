import QRCode from "qrcode";

/** Public diner URL encoded into a table QR code. */
export function tableMenuUrl(slug: string, qrToken: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/r/${slug}?t=${qrToken}`;
}

export async function qrDataUrl(value: string, size = 512): Promise<string> {
  return QRCode.toDataURL(value, {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#111827", light: "#ffffff" },
  });
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export type PrintableTable = { table_number: string; table_name: string | null; url: string };

/** Opens a print-ready sheet of QR cards in a new window. */
export async function printQrCards(
  restaurantName: string,
  scanLabel: string,
  tables: PrintableTable[],
): Promise<void> {
  const cards = await Promise.all(
    tables.map(async (table) => {
      const img = await qrDataUrl(table.url, 420);
      return `<div class="card">
        <div class="name">${escapeHtml(restaurantName)}</div>
        <img src="${img}" alt="" />
        <div class="table">${escapeHtml(table.table_name || table.table_number)}</div>
        <div class="hint">${escapeHtml(scanLabel)}</div>
      </div>`;
    }),
  );

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8" />
    <title>${escapeHtml(restaurantName)} — QR</title>
    <style>
      *{box-sizing:border-box}
      body{margin:0;padding:16px;font-family:ui-sans-serif,system-ui,sans-serif;display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
      .card{border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;page-break-inside:avoid}
      .card img{width:100%;max-width:220px}
      .name{font-weight:700;font-size:14px;color:#111827}
      .table{font-weight:700;font-size:20px;margin-top:4px}
      .hint{font-size:11px;color:#6b7280;margin-top:2px}
      @media print{body{padding:0}}
    </style></head><body>${cards.join("")}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
