export type TeamPunch = { staff_id: string; clock_in: string; clock_out: string | null };

// A full day without a clock-out needs review, not an indefinitely running
// live-presence timer. Keep the original punch intact for timesheet correction.
export const MAX_LIVE_PUNCH_MS = 24 * 60 * 60 * 1000;

export function isLiveTeamPunch(entry: TeamPunch, now: number): boolean {
  const started = Date.parse(entry.clock_in);
  return !entry.clock_out && Number.isFinite(started) && started <= now && now - started < MAX_LIVE_PUNCH_MS;
}

export function teamPunchesByStaff<T extends TeamPunch>(entries: readonly T[], now: number) {
  const latest = new Map<string, T>();
  for (const entry of entries) {
    const started = Date.parse(entry.clock_in);
    if (!Number.isFinite(started) || started > now) continue;
    const previous = latest.get(entry.staff_id);
    // A closed latest session supersedes an older unclosed record.
    if (!previous || started > Date.parse(previous.clock_in) ||
        (started === Date.parse(previous.clock_in) && entry.clock_out)) latest.set(entry.staff_id, entry);
  }
  const live = new Map<string, T>();
  const missingClockOut = new Map<string, T>();
  for (const [staffId, entry] of latest) {
    if (isLiveTeamPunch(entry, now)) live.set(staffId, entry);
    else if (!entry.clock_out) missingClockOut.set(staffId, entry);
  }
  return { live, missingClockOut };
}
