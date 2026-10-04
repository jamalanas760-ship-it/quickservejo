/** Configure a connected production domain once for QR and reservation sharing. */
export function publicGuestUrl(path: string): string {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  const current = typeof window === "undefined" ? "" : window.location.origin;
  let origin = current;
  if (configured) {
    try { const url = new URL(configured); if (url.protocol === "https:" && !url.username && !url.password) origin = url.origin; } catch { /* retain the working origin */ }
  }
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
