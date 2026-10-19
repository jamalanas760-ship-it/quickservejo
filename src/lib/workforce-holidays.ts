export type WorkforceHoliday = { id: string; name: string; holiday_date: string; annual: boolean };
export const COMMON_HOLIDAYS = [
  { name: "New Year", monthDay: "01-01" },
  { name: "Labour Day", monthDay: "05-01" },
  { name: "Christmas", monthDay: "12-25" },
] as const;
export function holidayOccurrences(holidays: WorkforceHoliday[], year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return [];
  const result = new Map<string, WorkforceHoliday & { date: string }>();
  for (const holiday of holidays) {
    const startYear = Number(holiday.holiday_date.slice(0, 4));
    if ((!holiday.annual && startYear !== year) || startYear > year) continue;
    const date = holiday.annual ? `${year}-${holiday.holiday_date.slice(5)}` : holiday.holiday_date;
    const parsed = new Date(`${date}T12:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) continue;
    result.set(`${date}:${holiday.name.trim().toLowerCase()}`, { ...holiday, date });
  }
  return [...result.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
  );
}
