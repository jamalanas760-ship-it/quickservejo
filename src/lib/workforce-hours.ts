import { isUsableTeamPunch, isLiveTeamPunch, teamPunchesByStaff, type TeamPunch } from "./team-attendance.ts";
export type HoursPunch = TeamPunch & { break_minutes?: number; review_status?: string | null };
export type HoursAssignment = {
  staff_id: string;
  starts_at?: string | null | undefined;
  ends_at?: string | null | undefined;
  status?: string;
};
export function workforceDayKey(date: Date, timeZone = "Asia/Amman") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
/** Convert a calendar midnight in the restaurant's zone without using the device zone. */
export function workforceLocalTimestamp(key: string, time: string, timeZone = "Asia/Amman") {
  const target = Date.parse(`${key}T${time}:00Z`);
  if (!Number.isFinite(target)) throw new Error("Invalid shift date or time.");
  let timestamp = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
    const get = (type: string) => parts.find((part) => part.type === type)!.value;
    const represented = Date.parse(
      `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`,
    );
    timestamp += target - represented;
  }
  if (workforceLocalInput(new Date(timestamp).toISOString(), timeZone) !== `${key}T${time}`)
    throw new Error("This date or time does not exist in the restaurant timezone.");
  return timestamp;
}
export function workforceDayStart(key: string, timeZone = "Asia/Amman") {
  return workforceLocalTimestamp(key, "00:00", timeZone);
}
export function workforceNextDay(key: string) {
  return new Date(Date.parse(`${key}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
}
type Interval = { start: number; end: number; rate: number };
function hours(intervals: Interval[]) {
  // Integrate each segment once, including duplicate/overlapping punches. Breaks
  // have no timestamps in the schema, so distribute them over their own session.
  const points = [...new Set(intervals.flatMap((i) => [i.start, i.end]))].sort((a, b) => a - b);
  let duration = 0;
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1]!,
      end = points[index]!;
    const covering = intervals.filter((i) => i.start <= start && i.end >= end);
    if (covering.length) duration += (end - start) * Math.min(...covering.map((i) => i.rate));
  }
  return duration / 3600000;
}
export function workforceHours(
  staffId: string,
  day: string,
  assignments: readonly HoursAssignment[],
  entries: readonly HoursPunch[],
  now = Date.now(),
  timeZone = "Asia/Amman",
) {
  const start = workforceDayStart(day, timeZone),
    end = workforceDayStart(workforceNextDay(day), timeZone);
  const clip = (from: number, to: number, rate = 1): Interval[] =>
    Number.isFinite(from) && Number.isFinite(to) && to > from && to > start && from < end
      ? [{ start: Math.max(start, from), end: Math.min(end, to), rate }]
      : [];
  const planned = assignments
    .filter((a) => a.staff_id === staffId && a.status !== "released")
    .flatMap((a) => clip(Date.parse(a.starts_at ?? ""), Date.parse(a.ends_at ?? "")));
  const accepted = entries.filter((e) => isUsableTeamPunch(e, now));
  const live = teamPunchesByStaff(accepted, now).live;
  const actual = accepted
    .filter((e) => e.staff_id === staffId)
    .flatMap((e) => {
      const from = Date.parse(e.clock_in),
        to = e.clock_out ? Math.min(now, Date.parse(e.clock_out)) : now;
      if (from > now || (!e.clock_out && (!isLiveTeamPunch(e, now) || live.get(staffId) !== e)))
        return [];
      const breakMs = Math.max(0, Number(e.break_minutes) || 0) * 60000;
      return clip(from, to, Math.max(0, 1 - breakMs / (to - from)));
    });
  const plannedH = hours(planned),
    actualH = hours(actual);
  return {
    plannedH,
    actualH,
    varianceH: actualH - plannedH,
    live: Boolean(live.get(staffId) && day === workforceDayKey(new Date(now), timeZone)),
  };
}

export function workforceLocalInput(value: string, timeZone = "Asia/Amman") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function workforceInputTimestamp(value: string, timeZone = "Asia/Amman") {
  const [day, time] = value.split("T");
  if (!day || !time) return Number.NaN;
  try {
    return workforceLocalTimestamp(day, time.slice(0, 5), timeZone);
  } catch {
    return Number.NaN;
  }
}
