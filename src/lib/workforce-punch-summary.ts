import { type TeamPunch } from "./team-attendance.ts";

/** Actual event times in a workplace-local day; never invent midnight punches. */
export function dailyPunchSummary(
  entries: readonly TeamPunch[],
  start: number,
  end: number,
  now: number,
) {
  let firstIn: string | null = null;
  let lastOut: string | null = null;
  for (const entry of entries) {
    const punchIn = Date.parse(entry.clock_in);
    const punchOut = entry.clock_out ? Date.parse(entry.clock_out) : NaN;
    // These are recorded events, not proof that a long session is live.
    if (
      entry.review_status === "rejected" ||
      !Number.isFinite(punchIn) ||
      punchIn > now ||
      (entry.clock_out && (!Number.isFinite(punchOut) || punchOut > now || punchOut <= punchIn))
    )
      continue;
    if (punchIn >= start && punchIn < end && (!firstIn || punchIn < Date.parse(firstIn)))
      firstIn = entry.clock_in;
    if (punchOut >= start && punchOut < end && (!lastOut || punchOut > Date.parse(lastOut)))
      lastOut = entry.clock_out;
  }
  return { firstIn, lastOut };
}
