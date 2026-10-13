import { workforceLocalTimestamp, workforceNextDay } from "./workforce-hours.ts";
export type ScheduleWindow = { day: string; start: string; end: string };
/** Calendar days and overnight ends are resolved in the restaurant's timezone. */
export function restaurantScheduleWindows(input: {
  first: string;
  last: string;
  start: string;
  end: string;
  weekdays: number[];
  timeZone: string;
}): ScheduleWindow[] {
  const { first, last, start, end, weekdays, timeZone } = input;
  const validDay = (day: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) &&
    new Date(day).toISOString().slice(0, 10) === day;
  const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  if (
    !validDay(first) ||
    !validDay(last) ||
    first > last ||
    (Date.parse(last) - Date.parse(first)) / 86400000 > 366 ||
    !validTime(start) ||
    !validTime(end) ||
    start === end ||
    !weekdays.length ||
    weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )
    throw new Error("Choose valid dates, times and workdays.");
  const windows: ScheduleWindow[] = [];
  for (let day = first; day <= last; day = workforceNextDay(day)) {
    if (!weekdays.includes(new Date(`${day}T12:00:00Z`).getUTCDay())) continue;
    const starts = workforceLocalTimestamp(day, start, timeZone);
    const ends = workforceLocalTimestamp(end < start ? workforceNextDay(day) : day, end, timeZone);
    if (ends <= starts || ends - starts > 86400000)
      throw new Error("Shift must end after it starts and last at most 24 hours.");
    windows.push({ day, start: new Date(starts).toISOString(), end: new Date(ends).toISOString() });
  }
  return windows;
}
