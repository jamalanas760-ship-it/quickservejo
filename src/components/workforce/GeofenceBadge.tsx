import type { GeofenceVerification } from "@/lib/geofence";
export function GeofenceBadge({
  verification,
  ar,
  action,
  compact = false,
}: {
  verification?: GeofenceVerification | null | undefined;
  ar: boolean;
  action?: "in" | "out";
  compact?: boolean;
}) {
  if (!verification || verification.status === "not_configured") return null;
  const on = verification.status === "on_premise";
  const distance = Math.round(verification.distance_meters ?? 0).toLocaleString(
    ar ? "ar-JO" : "en-GB",
  );
  const currentLabels: Record<string, string> = {
    checking: ar ? "جارٍ التحقق من الموقع…" : "Checking location…",
    loading: ar ? "جارٍ تحميل الموقع…" : "Loading location…",
    locating: ar ? "جارٍ تحديد الموقع…" : "Locating…",
    needs_permission: ar ? "يلزم إذن الموقع" : "Location permission needed",
    permission_denied: ar ? "الموقع محظور" : "Location blocked",
    inaccurate: ar ? "دقة الموقع منخفضة" : "GPS accuracy too low",
    stale: ar ? "انتهت صلاحية الموقع" : "Location expired",
    timeout: ar ? "انتهت مهلة الموقع" : "Location timed out",
    unavailable: ar ? "الموقع غير متاح" : "Location unavailable",
    insecure: ar ? "يلزم اتصال آمن" : "Secure connection required",
  };
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}
    >
      {action ? (action === "in" ? (ar ? "الدخول · " : "In · ") : ar ? "الخروج · " : "Out · ") : ""}
      {on
        ? ar
          ? "داخل المطعم"
          : "On Premise"
        : verification.status === "off_premise"
          ? compact
            ? ar
              ? "خارج المطعم"
              : "Off premise"
            : ar
              ? `خارج المطعم (${distance} متر)${action ? " · للمراجعة" : ""}`
              : `Off Premise (${distance} meters away)${action ? " · Review" : ""}`
          : action
            ? ar
              ? "الموقع غير متحقق · للمراجعة"
              : "Location unverified · Review"
            : (currentLabels[verification.reason ?? "unavailable"] ??
              (ar ? "الموقع غير متحقق" : "Location unverified"))}
    </span>
  );
}
