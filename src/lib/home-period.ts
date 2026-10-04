import { addReservationDays, reservationDay, restaurantDateTime } from "./reservation-studio";
export const HOME_PERIODS = [
  ["today", "Today", "اليوم"], ["yesterday", "Yesterday", "أمس"],
  ["week", "This week", "هذا الأسبوع"], ["last-week", "Last week", "الأسبوع الماضي"],
  ["month", "This month", "هذا الشهر"], ["last-month", "Last month", "الشهر الماضي"],
  ["year", "This year", "هذا العام"], ["last-year", "Last year", "العام الماضي"],
] as const;
export type HomePeriod = typeof HOME_PERIODS[number][0];
export function homePeriodRange(period: HomePeriod, timezone: string, now = new Date()) {
  const today = reservationDay(now, timezone);
  let start = today, end = addReservationDays(today, 1);
  const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
  const monthStart = (offset: number) => new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
  if (period === "yesterday") { start = addReservationDays(today, -1); end = today; }
  if (period === "week" || period === "last-week") {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    start = addReservationDays(today, -((weekday + 6) % 7) - (period === "last-week" ? 7 : 0));
    end = addReservationDays(start, 7);
  }
  if (period === "month" || period === "last-month") { start = monthStart(period === "last-month" ? -1 : 0); end = monthStart(period === "last-month" ? 0 : 1); }
  if (period === "year" || period === "last-year") { const y = year - (period === "last-year" ? 1 : 0); start = `${y}-01-01`; end = `${y + 1}-01-01`; }
  return { start: restaurantDateTime(start, "00:00", timezone), end: restaurantDateTime(end, "00:00", timezone), firstDay: start, lastDay: addReservationDays(end, -1) };
}
