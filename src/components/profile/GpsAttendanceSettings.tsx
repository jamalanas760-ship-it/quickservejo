import type { CSSProperties } from "react";
import { Info, LocateFixed, MapPin, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import "@/components/integrations/mcp-gps-studio.css";
export function GpsAttendanceSettings({
  ar,
  latitude,
  longitude,
  radius,
  locating,
  saving,
  onLatitude,
  onLongitude,
  onRadius,
  onLocate,
}: {
  ar: boolean;
  latitude: string;
  longitude: string;
  radius: number;
  locating: boolean;
  saving: boolean;
  onLatitude: (value: string) => void;
  onLongitude: (value: string) => void;
  onRadius: (value: number) => void;
  onLocate: () => void;
}) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  return (
    <section
      className="qs-gps-studio"
      dir={ar ? "rtl" : "ltr"}
      aria-labelledby="gps-attendance-title"
    >
      <header>
        <h2 id="gps-attendance-title">{t("GPS attendance", "التحقق من موقع الحضور")}</h2>
        <p>
          {t("Verify location when clocking in and out", "تحقق من الموقع عند تسجيل الدخول والخروج")}
        </p>
      </header>
      <div className="qs-gps-layout">
        <div className="qs-gps-preview-column">
          <div
            className="qs-gps-preview"
            role="img"
            aria-label={t(
              "Illustrative location and geofence preview",
              "رسم توضيحي للموقع ونطاق الحضور",
            )}
          >
            <svg viewBox="0 0 400 230" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <rect width="400" height="230" fill="#f3efe8" />
              <path d="M0 65L120 20L230 95L400 15V0H0ZM240 175L400 130V230H200Z" fill="#ebe7de" />
              <path d="M340 0L330 70L400 100V0Z" fill="#e6ecdf" />
              <g fill="none" stroke="#fff" strokeWidth="7">
                <path d="M-20 220L150-20M70 260L230-20M250 250L400 15M-20 75L400 200M20-20L400 115" />
              </g>
              <circle
                cx="200"
                cy="105"
                r={60 + radius / 8}
                fill="#ff6600"
                fillOpacity=".13"
                stroke="#ff6600"
                strokeWidth="1.5"
                strokeDasharray="7 5"
              />
            </svg>
            <span className="qs-gps-pin">
              <MapPin aria-hidden="true" />
              <Store aria-hidden="true" />
            </span>
            <span className="qs-gps-radius-label">
              {t("Attendance radius", "نطاق الحضور")} · {radius} {t("m", "متر")}
            </span>
            <small className="qs-gps-illustration-note">
              {t("Illustrative preview", "رسم توضيحي")}
            </small>
          </div>
          <Button
            type="button"
            variant="outline"
            className="qs-gps-locate"
            disabled={locating}
            onClick={onLocate}
          >
            <LocateFixed aria-hidden="true" />
            {locating
              ? t("Locating…", "جارٍ تحديد الموقع…")
              : t("Use current location", "استخدام الموقع الحالي")}
          </Button>
        </div>
        <div className="qs-gps-form-column">
          <div className="qs-gps-coordinates">
            <h3>
              <MapPin aria-hidden="true" />
              {t("Restaurant location", "موقع المطعم")}
            </h3>
            <div>
              <label>
                {t("Latitude", "خط العرض")}
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={-90}
                  max={90}
                  value={latitude}
                  onChange={(e) => onLatitude(e.target.value)}
                />
              </label>
              <label>
                {t("Longitude", "خط الطول")}
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={-180}
                  max={180}
                  value={longitude}
                  onChange={(e) => onLongitude(e.target.value)}
                />
              </label>
            </div>
          </div>
          <label className="qs-gps-radius-control">
            <span>
              {t("Attendance radius", "نطاق الحضور")}
              <strong>
                {radius} {t("m", "متر")}
              </strong>
            </span>
            <input
              type="range"
              min={50}
              max={300}
              step={10}
              value={radius}
              style={{ "--qs-gps-progress": `${((radius - 50) / 250) * 100}%` } as CSSProperties}
              aria-label={t("Attendance radius", "نطاق الحضور")}
              onChange={(e) => onRadius(Number(e.target.value))}
            />
            <span className="qs-gps-range-ends">
              <small>50 {t("m", "متر")}</small>
              <small>300 {t("m", "متر")}</small>
            </span>
          </label>
          <div className="qs-gps-review">
            <h3>{t("Location review (examples)", "مراجعة الموقع (أمثلة)")}</h3>
            <ul>
              <li>
                <i className="is-on" />
                <span>{t("On Premise", "داخل المطعم")}</span>
                <small>{t(`Within ${radius} m`, `ضمن ${radius} متر`)}</small>
              </li>
              <li>
                <i className="is-off" />
                <span>
                  {t(
                    `Off Premise · ${radius + 115} m away`,
                    `خارج المطعم · على بعد ${radius + 115} متر`,
                  )}
                </span>
                <small>{t("Review", "للمراجعة")}</small>
              </li>
              <li>
                <i />
                <span>{t("Location unavailable", "الموقع غير متاح")}</span>
                <small>{t("Review", "للمراجعة")}</small>
              </li>
            </ul>
          </div>
          <footer className="qs-gps-footer">
            <p>
              <Info aria-hidden="true" />
              {t(
                "Off-premise punches are flagged for review.",
                "تظهر سجلات الحضور خارج النطاق للمراجعة.",
              )}
            </p>
            <Button type="submit" disabled={saving}>
              {saving ? t("Saving…", "جارٍ الحفظ…") : t("Save settings", "حفظ الإعدادات")}
            </Button>
          </footer>
        </div>
      </div>
    </section>
  );
}
