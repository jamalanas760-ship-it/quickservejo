export type WorkforceHoliday = {
  id: string;
  name: string;
  holiday_date: string;
  annual: boolean;
  source?: "google";
  tentative?: boolean;
};
export const COMMON_HOLIDAYS = [
  { name: "New Year", arName: "رأس السنة الميلادية", monthDay: "01-01" },
  { name: "Labour Day", arName: "عيد العمال", monthDay: "05-01" },
  { name: "Christmas", arName: "عيد الميلاد المجيد", monthDay: "12-25" },
  { name: "Jordan Independence Day", arName: "عيد استقلال الأردن", monthDay: "05-25" },
] as const;
export const HOLIDAY_PRESETS = [
  ...COMMON_HOLIDAYS,
  { name: "Eid al-Adha", arName: "عيد الأضحى", monthDay: null },
  { name: "Eid al-Fitr (Eid Iftar)", arName: "عيد الفطر", monthDay: null },
  { name: "Mawlid al-Nabawi", arName: "المولد النبوي الشريف", monthDay: null },
] as const;
export function holidayPresetForm(name: string, year: number) {
  const preset = HOLIDAY_PRESETS.find((h) => h.name === name);
  if (!preset || !Number.isInteger(year) || year < 2000 || year > 2200) return null;
  return {
    name: preset.name,
    date: preset.monthDay ? `${year}-${preset.monthDay}` : "",
    annual: preset.monthDay !== null,
  };
}
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

export function mergeHolidaySources(local: WorkforceHoliday[], google: WorkforceHoliday[]) {
  const merged = new Map<string, WorkforceHoliday>();
  for (const row of [...google, ...local]) {
    const key = `${row.holiday_date}:${row.name.trim().toLowerCase()}`;
    const provider = merged.get(key);
    merged.set(key, provider?.tentative ? { ...row, tentative: true } : row);
  }
  return [...merged.values()];
}
