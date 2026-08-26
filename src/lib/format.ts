import type { Language } from "@/lib/i18n";

export function formatMoney(
  amount: number | string | null | undefined,
  currency = "SAR",
  lang: Language = "en",
): string {
  const value = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  try {
    return new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `${(Number.isFinite(value) ? value : 0).toFixed(2)} ${currency}`;
  }
}

export function formatNumber(value: number | null | undefined, lang: Language = "en"): string {
  return new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US").format(value ?? 0);
}

export function formatDate(iso: string | null | undefined, lang: Language = "en"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined, lang: Language = "en"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

/** Start of day, N days back, as an ISO string usable in Supabase filters. */
export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
