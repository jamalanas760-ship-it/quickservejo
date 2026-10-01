import { reservationDay } from "./reservation-studio";

/** Resolve queue requests in the restaurant's timezone, including midnight rollover. */
export function defaultWaitlistVisit(desiredDate: string, preferredTime: string | null, timezone: string, now = new Date()) {
  const future = new Date(Math.ceil((now.getTime() + 60 * 60_000) / 900_000) * 900_000);
  const futureDay = reservationDay(future, timezone);
  const date = desiredDate && desiredDate > futureDay ? desiredDate : futureDay;
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const nextTime = formatter.format(future);
  const preferred = preferredTime?.slice(0, 5);
  const validPreferred = preferred && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(preferred);
  const time = validPreferred && desiredDate === date && (date > futureDay || preferred >= nextTime) ? preferred : date > futureDay ? "18:00" : nextTime;
  return { date, time };
}
