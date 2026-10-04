import { useState } from "react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { HOME_PERIODS, homePeriodRange, type HomePeriod } from "@/lib/home-period";

export function HomePeriodPicker({ period, onChange, ar, timezone, now }: {
  period: HomePeriod; onChange: (period: HomePeriod) => void; ar: boolean; timezone: string; now: Date;
}) {
  const [open, setOpen] = useState(false);
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const current = HOME_PERIODS.find(([key]) => key === period) ?? HOME_PERIODS[0];
  const dateLabel = (day: string) => new Intl.DateTimeFormat(ar ? "ar-JO" : "en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
  const rangeLabel = (key: HomePeriod) => {
    const range = homePeriodRange(key, timezone, now);
    return range.firstDay === range.lastDay ? dateLabel(range.firstDay) : `${dateLabel(range.firstDay)} – ${dateLabel(range.lastDay)}`;
  };
  return <section className="qs-home-period" aria-label={t("Overview period", "فترة العرض")} dir={ar ? "rtl" : "ltr"}>
    <div className="qs-home-period-copy"><strong>{t("Overview", "نظرة شاملة")}</strong><small>{t("Sales, orders & bookings", "المبيعات والطلبات والحجوزات")}</small></div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><button type="button" className="qs-home-period-trigger" aria-label={t(`Change period: ${current[1]}`, `تغيير الفترة: ${current[2]}`)}>
        <CalendarRange aria-hidden="true" /><span>{t(current[1], current[2])}</span><ChevronDown aria-hidden="true" />
      </button></DialogTrigger>
      <DialogContent placement="edge" className="qs-home-period-dialog" dir={ar ? "rtl" : "ltr"} onOpenAutoFocus={event => event.preventDefault()}>
        <DialogHeader><DialogTitle>{t("Choose a period", "اختر الفترة")}</DialogTitle><DialogDescription>{t("View your restaurant’s sales, orders and bookings.", "اعرض مبيعات مطعمك وطلباته وحجوزاته.")}</DialogDescription></DialogHeader>
        <div className="qs-home-period-options">{HOME_PERIODS.map(([key,en,arabic]) => <button key={key} type="button" aria-pressed={period === key} onClick={() => { onChange(key); setOpen(false); }}>
          <span><strong>{t(en,arabic)}</strong><small>{rangeLabel(key)}</small></span>{period === key ? <Check aria-hidden="true" /> : null}
        </button>)}</div>
        <p className="qs-home-period-note">{t("Restaurant timezone", "توقيت المطعم")}: {timezone} · {t("Weeks start Monday", "الأسبوع يبدأ الاثنين")}</p>
      </DialogContent>
    </Dialog>
    <p className="qs-home-period-range">{rangeLabel(period)}</p>
    <p className="qs-home-period-live">{t("Tables & team · Live now", "الطاولات والفريق · الحالة الحالية")}</p>
  </section>;
}
