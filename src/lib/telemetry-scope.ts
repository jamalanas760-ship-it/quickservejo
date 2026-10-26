/** Strip bearer links/IDs and query strings from diagnostics before transport. */
export function safeTelemetryRoute(path: string): string {
  let pathname: string;
  try { pathname = new URL(path, "https://quickserve.invalid").pathname; } catch { return "/unknown"; }
  return pathname.split("/").map((part, i, parts) => {
    if (["o", "booking", "waitlist", "qr"].includes(parts[i - 1]) ||
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(part) || part.length > 24) return ":id";
    return part;
  }).join("/").slice(0, 240);
}
