import { useState, type ReactNode } from "react";
import { Building2, CalendarDays, Clock3, LockKeyhole, Route } from "lucide-react";
import { attendanceRoadmapPosition } from "@/lib/attendance-roadmap";
import "./attendance-clock.css";
import type { GeofenceVerification } from "@/lib/geofence";
import type { AttendanceLocationPhase } from "@/lib/attendance-location";
import { GeofenceBadge } from "./GeofenceBadge";
import { WorkforceButton as Button } from "./WorkforceButton";

/** Approved overview card; attendance decisions remain in the owning clock flow. */
export function WorkforceClockCard({
  ar,
  name,
  avatarUrl,
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
  avatarUrl?: string | null;
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
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
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
  const onPremise = verification.status === "on_premise";
  const roadmap = verified ? attendanceRoadmapPosition(distance, radius) : null;
  const liveLabel = verified
    ? ar
      ? "الموقع يتحدث تلقائيًا"
      : "Location updates automatically"
    : phase === "locating" || phase === "checking"
      ? ar
        ? "جارٍ التحقق من الموقع…"
        : "Checking location…"
      : ar
        ? "يلزم التحقق من الموقع"
        : "Location verification required";
  return (
    <section
      className="wf-arrival-clock"
      data-clock-state={clockState}
      dir={ar ? "rtl" : "ltr"}
      aria-label={ar ? "ساعة الدوام" : "Time clock"}
    >
      <header className="wf-arrival-header">
        <div className="wf-arrival-person">
          <span className="wf-arrival-avatar" aria-hidden="true">
            {avatarUrl && failedAvatar !== avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="wf-clock-profile-image"
                onError={() => setFailedAvatar(avatarUrl)}
              />
            ) : (
              name
                .split(" ")
                .map((value) => value[0])
                .slice(0, 2)
                .join("")
            )}
          </span>
          <div>
            <strong>{name}</strong>
            <small>{ar ? "حضوري" : "My attendance"}</small>
          </div>
        </div>
        <span className="wf-arrival-live" data-verified={verified} role="status" aria-live="polite">
          <i aria-hidden="true" />
          <span>{liveLabel}</span>
        </span>
      </header>
      <div className="wf-arrival-layout">
        <div className="wf-arrival-location">
          <div className="wf-arrival-location-heading">
            <span>
              <Route aria-hidden="true" />
              {ar ? "مسار موقع العمل" : "Workplace roadmap"}
            </span>
            <GeofenceBadge ar={ar} verification={verification} compact />
          </div>
          <strong className="wf-arrival-distance">
            {onPremise ? (ar ? "أنت في موقع العمل" : "You’re at work") : distanceLabel || liveLabel}
          </strong>
          <small className="wf-arrival-detail">
            {onPremise && distanceLabel
              ? distanceLabel
              : ar
                ? "مؤشر المسافة إلى موقع العمل"
                : "Distance to your workplace"}
          </small>
          <div className="wf-arrival-roadmap" aria-hidden="true" data-location-known={!!roadmap}>
            <svg viewBox="0 0 500 180" preserveAspectRatio="none" className="wf-arrival-route">
              <circle className="wf-arrival-zone" cx="425" cy="66" r="43" />
              <path
                className="wf-arrival-route-bed"
                d="M60 135H145Q185 135 185 100Q185 66 225 66H425"
              />
              <path
                className="wf-arrival-route-track"
                d="M60 135H145Q185 135 185 100Q185 66 225 66H425"
              />
              {roadmap && (
                <>
                  <path
                    className="wf-arrival-route-progress"
                    pathLength="1"
                    strokeDasharray="1"
                    strokeDashoffset={1 - roadmap.progress}
                    d="M60 135H145Q185 135 185 100Q185 66 225 66H425"
                  />
                  <circle className="wf-arrival-marker-halo" cx={roadmap.x} cy={roadmap.y} r="13" />
                  <circle className="wf-arrival-marker" cx={roadmap.x} cy={roadmap.y} r="6" />
                </>
              )}
            </svg>
            <div className="wf-arrival-office">
              <Building2 />
              <span>{ar ? "موقع العمل" : "Workplace"}</span>
            </div>
          </div>
          <div className="wf-arrival-location-footer">
            <small>
              {verification.status !== "not_configured" && (
                <>
                  {ar ? "نطاق الحضور" : "Attendance radius"} · {radius.toLocaleString(locale)}{" "}
                  {ar ? "م" : "m"}
                </>
              )}
            </small>
            <small>
              {verified && age != null
                ? age < 5
                  ? ar
                    ? "تم التحديث الآن"
                    : "Updated just now"
                  : ar
                    ? `تم التحديث قبل ${age.toLocaleString(locale)} ثانية`
                    : `Updated ${age} s ago`
                : "—"}
            </small>
          </div>
          <small className="wf-arrival-schematic">
            {ar
              ? "مؤشر توضيحي للمسافة، وليس مسار ملاحة"
              : "Schematic distance indicator, not directions"}
          </small>
          <p
            id="attendance-location-status"
            className={verified ? "sr-only" : "wf-arrival-location-help"}
          >
            {locationMessage}
          </p>
          {retry && (
            <button type="button" className="wf-arrival-retry" onClick={onRetry}>
              {ar ? "تحقق مجددًا" : "Check again"}
            </button>
          )}
        </div>
        <div className="wf-arrival-action">
          <small>{ar ? "وقت العمل اليوم" : "Worked today"}</small>
          <strong className="wf-arrival-worked">{workedToday}</strong>
          <div className="wf-arrival-session">{status}</div>
          <Button
            className="wf-arrival-punch"
            data-punch-direction={clockOut ? "out" : "in"}
            aria-busy={pending}
            disabled={disabled || pending || !onPremise}
            aria-describedby="attendance-location-status"
            onClick={onPunch}
          >
            {!onPremise && <LockKeyhole className="size-4" aria-hidden="true" />}
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
          <p className="wf-arrival-radius-hint">
            {onPremise
              ? ar
                ? "تم التحقق من الموقع"
                : "Location verified"
              : ar
                ? "التسجيل متاح داخل نطاق الحضور فقط."
                : "Clock-in and clock-out are available inside the attendance radius."}
          </p>
          <button type="button" className="wf-arrival-missing" onClick={onReportMissing}>
            {ar ? "الإبلاغ عن بصمة مفقودة" : "Report missing punch"}
          </button>
        </div>
      </div>
      <footer className="wf-arrival-footer">
        <div>
          <small>
            <CalendarDays aria-hidden="true" />
            {shiftLabel}
          </small>
          <strong>{shiftValue}</strong>
          <small>{shiftHint}</small>
        </div>
        <div>
          <small>
            <Clock3 aria-hidden="true" />
            {sessionLabel}
          </small>
          <strong>{sessionValue}</strong>
        </div>
      </footer>
    </section>
  );
}
