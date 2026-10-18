import type { ReactNode } from "react";
import { CalendarDays, Clock3, LockKeyhole, PlayCircle, StopCircle } from "lucide-react";
import type { GeofenceVerification } from "@/lib/geofence";
import type { AttendanceLocationPhase } from "@/lib/attendance-location";
import { GeofenceBadge } from "./GeofenceBadge";
import { WorkforceButton as Button } from "./WorkforceButton";

/** Approved overview card; attendance decisions remain in the owning clock flow. */
export function WorkforceClockCard({
  ar,
  name,
  status,
  verification,
  phase,
  updatedAt,
  now,
  radius,
  clockState,
  workedToday,
  sessionLabel,
  sessionValue,
  shiftLabel,
  shiftValue,
  shiftHint,
  pending,
  disabled,
  clockOut,
  onPunch,
  onReportMissing,
  locationMessage,
  onRetry,
}: {
  ar: boolean;
  name: string;
  status: ReactNode;
  verification: GeofenceVerification;
  phase: AttendanceLocationPhase;
  updatedAt: number | null;
  now: number;
  radius: number;
  clockState: string;
  workedToday: string;
  sessionLabel: string;
  sessionValue: string;
  shiftLabel: string;
  shiftValue: string;
  shiftHint: string;
  pending: boolean;
  disabled: boolean;
  clockOut: boolean;
  onPunch: () => void;
  onReportMissing: () => void;
  locationMessage: string;
  onRetry: () => void;
}) {
  const verified = verification.status === "on_premise" || verification.status === "off_premise";
  const distance = verification.distance_meters;
  const locale = ar ? "ar-JO" : "en-GB";
  const distanceLabel =
    verified && distance != null && Number.isFinite(distance)
      ? distance >= 1000
        ? ar
          ? `يبعد ${(distance / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} كم`
          : `${(distance / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} km away`
        : ar
          ? `يبعد ${Math.round(distance).toLocaleString(locale)} متر`
          : `${Math.round(distance).toLocaleString(locale)} m away`
      : null;
  const age = updatedAt == null ? null : Math.max(0, Math.floor((now - updatedAt) / 1000));
  const retry =
    !verified &&
    phase !== "checking" &&
    phase !== "locating" &&
    phase !== "insecure" &&
    verification.status !== "not_configured";
  return (
    <section
      className="wf-clock wf-overview-clock"
      data-clock-state={clockState}
      aria-label={ar ? "ساعة الدوام" : "Time clock"}
    >
      <div className="wf-clock-person">
        <span className="wf-avatar" aria-hidden="true">
          {name
            .split(" ")
            .map((value) => value[0])
            .slice(0, 2)
            .join("")}
        </span>
        <div className="wf-clock-identity">
          <strong>{name}</strong>
          <GeofenceBadge ar={ar} verification={verification} compact />
          {distanceLabel && <b className="wf-clock-distance">{distanceLabel}</b>}
          {verification.status !== "not_configured" && (
            <span className="wf-clock-radius">
              {ar ? "نطاق الحضور" : "Attendance radius"} {radius.toLocaleString(locale)}{" "}
              {ar ? "م" : "m"}
            </span>
          )}
          <small className="wf-clock-session-status">{status}</small>
        </div>
      </div>
      <div className="wf-clock-location" data-verified={verified}>
        <div className="wf-clock-live-label" role="status" aria-live="polite">
          <i aria-hidden="true" />
          <span>
            {verified
              ? ar
                ? "الموقع يتحدث تلقائيًا"
                : "Location updates automatically"
              : phase === "locating" || phase === "checking"
                ? ar
                  ? "جارٍ التحقق من الموقع…"
                  : "Checking location…"
                : ar
                  ? "يلزم التحقق من الموقع"
                  : "Location verification required"}
          </span>
        </div>
        {verified && age != null && (
          <small>
            {age < 5
              ? ar
                ? "تم التحديث الآن"
                : "Updated just now"
              : ar
                ? `تم التحديث قبل ${age.toLocaleString(locale)} ثانية`
                : `Updated ${age} s ago`}
          </small>
        )}
        <p
          id="attendance-location-status"
          className={verified ? "sr-only" : "wf-clock-location-help"}
        >
          {locationMessage}
        </p>
        {retry && (
          <button type="button" className="wf-clock-retry" onClick={onRetry}>
            {ar ? "تحقق مجددًا" : "Check again"}
          </button>
        )}
      </div>
      <div className="wf-clock-metric wf-clock-worked">
        <small>
          <Clock3 aria-hidden="true" />
          {ar ? "وقت العمل اليوم" : "Worked today"}
        </small>
        <strong>{workedToday}</strong>
        <small>
          {sessionLabel} · {sessionValue}
        </small>
      </div>
      <div className="wf-clock-metric wf-clock-next">
        <small>
          <CalendarDays aria-hidden="true" />
          {shiftLabel}
        </small>
        <strong>{shiftValue}</strong>
        <small>{shiftHint}</small>
      </div>
      <div className="wf-clock-action">
        <Button
          aria-busy={pending}
          disabled={disabled}
          aria-describedby="attendance-location-status"
          onClick={onPunch}
        >
          {verification.status !== "on_premise" ? (
            <LockKeyhole className="size-4" />
          ) : clockOut ? (
            <StopCircle className="size-4" />
          ) : (
            <PlayCircle className="size-4" />
          )}
          {pending
            ? ar
              ? "جارٍ التحديث…"
              : "Updating…"
            : clockOut
              ? ar
                ? "تسجيل الانصراف"
                : "Clock out"
              : ar
                ? "تسجيل الحضور"
                : "Clock in"}
        </Button>
        {verification.status === "off_premise" && (
          <p className="wf-clock-radius-hint">
            {ar
              ? "التسجيل متاح داخل نطاق الحضور فقط."
              : "Clock-in and clock-out are available inside the attendance radius."}
          </p>
        )}
        <button type="button" className="wf-missing" onClick={onReportMissing}>
          {ar ? "الإبلاغ عن بصمة مفقودة" : "Report missing punch"}
        </button>
      </div>
    </section>
  );
}
