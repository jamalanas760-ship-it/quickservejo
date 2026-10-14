import type { GeofenceVerification } from "@/lib/geofence";
export function GeofenceBadge({
  verification,
  ar,
  action,
}: {
  verification?: GeofenceVerification | null | undefined;
  ar: boolean;
  action?: "in" | "out";
}) {
  if (!verification || verification.status === "not_configured") return null;
  const on = verification.status === "on_premise";
  const distance = Math.round(verification.distance_meters ?? 0).toLocaleString(
    ar ? "ar-JO" : "en-GB",
  );
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}
    >
      {action ? (action === "in" ? (ar ? "الدخول · " : "In · ") : (ar ? "الخروج · " : "Out · ")) : ""}
      {on
        ? ar
          ? "داخل المطعم"
          : "On Premise"
        : verification.status === "off_premise"
          ? ar
            ? `خارج المطعم (${distance} متر) · للمراجعة`
            : `Off Premise (${distance} meters away) · Review`
          : ar
            ? "الموقع غير متحقق · للمراجعة"
            : "Location unverified · Review"}
    </span>
  );
}
