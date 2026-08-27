/** Reporting date ranges shared by the dashboard and super-admin analytics. */
export type RangePreset = "today" | "7d" | "30d" | "90d" | "custom";

export type DateRange = {
  preset: RangePreset;
  /** Inclusive start, ISO timestamp. */
  from: string;
  /** Exclusive end, ISO timestamp. */
  to: string;
};

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Builds a range from a preset, anchored on the local day boundary. */
export function rangeFromPreset(preset: Exclude<RangePreset, "custom">): DateRange {
  const today = startOfDay(new Date());
  const days = preset === "today" ? 1 : preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  return {
    preset,
    from: addDays(today, -(days - 1)).toISOString(),
    to: addDays(today, 1).toISOString(),
  };
}

/** Builds a range from two yyyy-mm-dd inputs; end date is made exclusive. */
export function rangeFromDates(fromDate: string, toDate: string): DateRange | null {
  if (!fromDate || !toDate) return null;
  const from = startOfDay(new Date(`${fromDate}T00:00:00`));
  const to = startOfDay(new Date(`${toDate}T00:00:00`));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null;
  return { preset: "custom", from: from.toISOString(), to: addDays(to, 1).toISOString() };
}

/** Number of whole days covered by the range (at least 1). */
export function rangeDays(range: DateRange): number {
  const ms = new Date(range.to).getTime() - new Date(range.from).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

/** yyyy-mm-dd list of every day in the range, for chart buckets. */
export function rangeDayKeys(range: DateRange): string[] {
  const keys: string[] = [];
  const start = new Date(range.from);
  for (let i = 0; i < rangeDays(range); i += 1) {
    keys.push(dayKey(addDays(start, i)));
  }
  return keys;
}

/** Local yyyy-mm-dd key for a date or ISO string. */
export function dayKey(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
