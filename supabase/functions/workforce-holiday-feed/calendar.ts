export const GOOGLE_JORDAN_FEED =
  "https://calendar.google.com/calendar/ical/en.jo%23holiday%40group.v.calendar.google.com/public/basic.ics";
export type GoogleHoliday = {
  id: string;
  name: string;
  holiday_date: string;
  annual: false;
  source: "google";
  tentative: boolean;
};
const names = [
  [/^Eid al-Fitr(?: Holiday)?$/i, "Eid al-Fitr (Eid Iftar)"],
  [/^Eid al-Adha(?: Holiday)?$/i, "Eid al-Adha"],
  [/^Prophet['’]s Birthday$/i, "Mawlid al-Nabawi"],
  [/^Independence Day$/i, "Jordan Independence Day"],
  [/^New Year['’]s Day$/i, "New Year"],
  [/^Labou?r Day$/i, "Labour Day"],
  [/^Christmas Day$/i, "Christmas"],
] as const;
function dateValue(value: string | undefined) {
  if (!value || !/^\d{8}$/.test(value)) return null;
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}
export function parseGoogleJordanHolidays(text: string): GoogleHoliday[] {
  if (
    text.length > 2_000_000 ||
    !text.includes("BEGIN:VCALENDAR") ||
    !/X-WR-CALNAME:.*Jordan/i.test(text)
  )
    throw new Error("Invalid Jordan holiday feed");
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const result = new Map<string, GoogleHoliday>();
  for (const block of unfolded.split("BEGIN:VEVENT\n").slice(1)) {
    const event = block.split("END:VEVENT")[0];
    const fields = new Map<string, string>();
    for (const line of event.split("\n")) {
      const colon = line.indexOf(":");
      if (colon > 0) fields.set(line.slice(0, colon), line.slice(colon + 1));
    }
    const summary = fields.get("SUMMARY") ?? "";
    const description = fields.get("DESCRIPTION") ?? "";
    if (fields.get("STATUS") === "CANCELLED" || !/^Public holiday(?:\\n|$)/i.test(description))
      continue;
    const name = names.find(([pattern]) =>
      pattern.test(summary.replace(/\s*\(tentative\)/gi, "").trim()),
    )?.[1];
    const date = dateValue(fields.get("DTSTART;VALUE=DATE"));
    if (!name || !date) continue;
    const end = dateValue(fields.get("DTEND;VALUE=DATE"));
    const count = end ? (Date.parse(end) - Date.parse(date)) / 86400000 : 1;
    if (!Number.isInteger(count) || count < 1 || count > 14) continue;
    for (let day = 0; day < count; day++) {
      const holiday_date = new Date(Date.parse(date) + day * 86400000).toISOString().slice(0, 10);
      const id = `google:${holiday_date}:${name}`;
      result.set(id, {
        id,
        name,
        holiday_date,
        annual: false,
        source: "google",
        tentative: /tentative|estimated/i.test(summary + " " + description),
      });
    }
  }
  if (!result.size) throw new Error("No supported Jordan holidays in feed");
  return [...result.values()].sort(
    (a, b) => a.holiday_date.localeCompare(b.holiday_date) || a.name.localeCompare(b.name),
  );
}
