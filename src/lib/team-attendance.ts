export type TeamPunch = {
  staff_id: string;
  clock_in: string;
  clock_out: string | null;
  review_status?: string | null;
};

// A full day without a clock-out needs review, not an indefinitely running
// live-presence timer. Keep the original punch intact for timesheet correction.
export const MAX_LIVE_PUNCH_MS = 24 * 60 * 60 * 1000;

export function isLiveTeamPunch(entry: TeamPunch, now: number): boolean {
  const started = Date.parse(entry.clock_in);
  return (
    entry.review_status !== "rejected" &&
    !entry.clock_out &&
    Number.isFinite(started) &&
    started <= now &&
    now - started < MAX_LIVE_PUNCH_MS
  );
}

export function teamPunchesByStaff<T extends TeamPunch>(entries: readonly T[], now: number) {
  const latest = new Map<string, T>();
  for (const entry of entries) {
    const started = Date.parse(entry.clock_in);
    if (entry.review_status === "rejected" || !Number.isFinite(started) || started > now) continue;
    const previous = latest.get(entry.staff_id);
    // A closed latest session supersedes an older unclosed record.
    if (
      !previous ||
      started > Date.parse(previous.clock_in) ||
      (started === Date.parse(previous.clock_in) && entry.clock_out)
    )
      latest.set(entry.staff_id, entry);
  }
  const live = new Map<string, T>();
  const missingClockOut = new Map<string, T>();
  for (const [staffId, entry] of latest) {
    if (isLiveTeamPunch(entry, now)) live.set(staffId, entry);
    else if (!entry.clock_out) missingClockOut.set(staffId, entry);
  }
  return { live, missingClockOut };
}

/** Prefer the latest session overlapping this shift; ignore stale/future records. */
export function matchingShiftPunch<T extends TeamPunch>(
  entries: readonly T[],
  staffId: string,
  start: number,
  end: number,
  now: number,
): T | undefined {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined;
  return entries
    .filter((entry) => {
      const clockIn = Date.parse(entry.clock_in);
      const clockOut = entry.clock_out ? Date.parse(entry.clock_out) : now;
      return (
        entry.review_status !== "rejected" &&
        entry.staff_id === staffId &&
        Number.isFinite(clockIn) &&
        Number.isFinite(clockOut) &&
        clockIn <= now &&
        clockOut > clockIn &&
        (Boolean(entry.clock_out) || isLiveTeamPunch(entry, now)) &&
        clockIn < end &&
        clockOut > start
      );
    })
    .sort((a, b) => Date.parse(b.clock_in) - Date.parse(a.clock_in))[0];
}

export function preferTeamShift(
  candidate: { phase: string; distance: number },
  current: { phase: string; distance: number },
) {
  const priority: Record<string, number> = {
    active: 0,
    late: 1,
    upcoming: 2,
    completed: 3,
    missed: 4,
  };
  const nextRank = priority[candidate.phase] ?? 5,
    previousRank = priority[current.phase] ?? 5;
  return (
    nextRank < previousRank || (nextRank === previousRank && candidate.distance < current.distance)
  );
}
