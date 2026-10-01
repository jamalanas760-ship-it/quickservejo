/** Date-only values belong to the restaurant, never to the operator's device timezone. */
export function reservationDay(value: Date | string, timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
export function addReservationDays(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function restaurantDateTime(date: string, time: string, timeZone: string) {
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall)) throw new Error("Choose a valid date and time");
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
    const shown = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    instant += wall - shown;
  }
  const result = new Date(instant);
  const parts = Object.fromEntries(formatter.formatToParts(result).map(p => [p.type, p.value]));
  if (`${parts.year}-${parts.month}-${parts.day}` !== date || `${parts.hour}:${parts.minute}` !== time) throw new Error("This time is unavailable in the restaurant timezone");
  return result.toISOString();
}
export function bookingTimeLabel(value: string, timeZone: string, ar: boolean) {
  return new Intl.DateTimeFormat(ar ? "ar-JO" : "en-JO", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
export type WeeklyHours = Record<string, { open?: string; close?: string; closed?: boolean }>;
export function defaultBookingHours(): WeeklyHours {
  return Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(i), { open: "12:00", close: "23:00" }]));
}
export function validateBookingHours(hours: WeeklyHours) {
  return Object.values(hours).every(row => row.closed || (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.open ?? "") && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.close ?? "") && (row.close ?? "") > (row.open ?? "")));
}
