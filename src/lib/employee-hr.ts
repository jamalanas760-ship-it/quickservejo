/** Calendar arithmetic is deliberately independent of the device timezone. */
export type LeaveAccount = {
  staff_id: string;
  year: number;
  leave_type: "annual" | "sick";
  opening_days: number;
  entitlement_days: number;
  accrual_method: "upfront" | "daily";
  accrual_start: string;
  accrual_end: string;
  day_basis: "calendar" | "workdays";
  workweek: number[];
  hours_per_day: number;
};
export type LeaveRecord = {
  id: string;
  staff_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  status: string;
  reason?: string;
  created_at?: string;
};
export type LeaveTransaction = {
  id: string;
  date: string;
  description: string;
  change: number;
  balance: number;
  projected: boolean;
};
const dayMs = 86400000;
const timestamp = (key: string) => Date.parse(`${key}T00:00:00Z`);
const key = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const roundDays = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
export function servicePeriod(start: string | null | undefined, end: string) {
  if (!start || !Number.isFinite(timestamp(start)) || end < start) return null;
  const a = new Date(timestamp(start)),
    b = new Date(timestamp(end));
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  const anniversary = (count: number) => {
    const target = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + count, 1));
    const lastDay = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();
    target.setUTCDate(Math.min(a.getUTCDate(), lastDay));
    return target.getTime();
  };
  if (anniversary(months) > b.getTime()) months--;
  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days: Math.floor((b.getTime() - anniversary(months)) / dayMs),
  };
}
/** Only approved requests consume leave; dates outside the selected year are clipped.
 * Future approved days are reserved in availability and included in the year-end projection.
 * Daily accrual includes each calendar day of the explicitly configured accrual interval.
 */
export function leaveBalance(
  account: LeaveAccount,
  requests: readonly LeaveRecord[],
  today: string,
) {
  const start = `${account.year}-01-01`,
    end = `${account.year}-12-31`;
  const raw: Omit<LeaveTransaction, "balance">[] = [
    {
      id: "opening",
      date: start,
      description: "Opening balance",
      change: Number(account.opening_days),
      projected: start > today,
    },
  ];
  const accrualStart = Math.max(timestamp(start), timestamp(account.accrual_start));
  const accrualEnd = Math.min(timestamp(end), timestamp(account.accrual_end));
  const accrualDays = Math.floor((accrualEnd - accrualStart) / dayMs) + 1;
  const earned = (until: string) => {
    if (accrualDays <= 0 || timestamp(until) < accrualStart) return 0;
    return account.accrual_method === "upfront"
      ? Number(account.entitlement_days)
      : (Number(account.entitlement_days) *
          Math.min(accrualDays, Math.floor((timestamp(until) - accrualStart) / dayMs) + 1)) /
          accrualDays;
  };
  if (accrualDays > 0) {
    if (account.accrual_method === "upfront")
      raw.push({
        id: "entitlement",
        date: key(accrualStart),
        description: "Entitlement",
        change: Number(account.entitlement_days),
        projected: key(accrualStart) > today,
      });
    else {
      for (let ms = accrualStart; ms <= accrualEnd; ms += dayMs) {
        const date = key(ms);
        raw.push({
          id: `accrual-${date}`,
          date,
          description: "Daily accrual",
          change: roundDays(earned(date)) - roundDays(earned(key(ms - dayMs))),
          projected: date > today,
        });
      }
    }
  }
  let taken = 0,
    reserved = 0;
  // Count overlapping approved requests once per day, capped at one full day.
  const consumed = new Map<
    string,
    { full: boolean; intervals: [number, number][]; ids: string[] }
  >();
  for (const r of requests) {
    if (
      r.status !== "approved" ||
      r.staff_id !== account.staff_id ||
      r.leave_type !== account.leave_type
    )
      continue;
    for (
      let ms = Math.max(timestamp(start), timestamp(r.start_date));
      ms <= Math.min(timestamp(end), timestamp(r.end_date));
      ms += dayMs
    ) {
      if (account.day_basis === "workdays" && !account.workweek.includes(new Date(ms).getUTCDay()))
        continue;
      const date = key(ms);
      const prior = consumed.get(date) ?? { full: false, intervals: [], ids: [] };
      if (r.start_time && r.end_time) {
        const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
        const from = minutes(r.start_time),
          to = minutes(r.end_time);
        prior.intervals.push([from, to > from ? to : to + 1440]);
      } else prior.full = true;
      prior.ids.push(r.id);
      consumed.set(date, prior);
    }
  }
  for (const [date, value] of consumed) {
    let covered = 0,
      through = -Infinity;
    for (const [from, to] of value.intervals.sort((a, b) => a[0] - b[0])) {
      covered += Math.max(0, to - Math.max(from, through));
      through = Math.max(through, to);
    }
    const amount = value.full ? 1 : Math.min(1, covered / (Number(account.hours_per_day) * 60));
    if (date <= today) taken += amount;
    else reserved += amount;
    raw.push({
      id: `leave-${date}-${value.ids.join("-")}`,
      date,
      description: "Approved leave",
      change: -amount,
      projected: date > today,
    });
  }
  let running = 0;
  const transactions = raw
    .sort((a, b) => a.date.localeCompare(b.date) || Number(b.change > 0) - Number(a.change > 0))
    .map((t) => ({ ...t, change: roundDays(t.change), balance: roundDays((running += t.change)) }));
  return {
    taken: roundDays(taken),
    reserved: roundDays(reserved),
    earned: roundDays(earned(today)),
    available: roundDays(
      (today >= start ? Number(account.opening_days) : 0) + earned(today) - taken - reserved,
    ),
    projected: roundDays(Number(account.opening_days) + earned(end) - taken - reserved),
    transactions,
  };
}
export type PayItem = { label: string; amount: number };
export function payTotal(items: readonly PayItem[]) {
  return Math.round(items.reduce((sum, i) => sum + Math.round(Number(i.amount) * 1000), 0)) / 1000;
}
export function parsePayItems(value: string): PayItem[] {
  return value
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const separator = line.lastIndexOf("=");
      const label = line.slice(0, separator).trim(),
        amount = Number(line.slice(separator + 1).trim());
      if (
        separator < 1 ||
        !label ||
        !line.slice(separator + 1).trim() ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        amount > 100000000 ||
        label.length > 120
      )
        throw new Error(
          "Use one item per line: Description = amount. Amounts must be positive or zero.",
        );
      return { label, amount: Math.round(amount * 1000) / 1000 };
    });
}

export const daysText = (n: number, ar: boolean, precision = 2) =>
  `${new Intl.NumberFormat(ar ? "ar" : "en", { maximumFractionDigits: precision }).format(n)} ${ar ? "يوم" : "days"}`;
