import { workforceInputTimestamp } from "./workforce-hours.ts";

export function validateMissingPunch(
  clockIn: string,
  clockOut: string,
  breakInput: string,
  reason: string,
  timeZone: string,
  now = Date.now(),
) {
  const start = workforceInputTimestamp(clockIn, timeZone);
  const end = workforceInputTimestamp(clockOut, timeZone);
  const durationMinutes = Math.floor((end - start) / 60000);
  const breakMinutes = Number(breakInput);
  const issue =
    !clockIn || !clockOut
      ? "missing_times"
      : !Number.isFinite(start) || !Number.isFinite(end)
        ? "invalid_times"
        : durationMinutes <= 0
          ? "order"
          : durationMinutes > 2160
            ? "too_long"
            : !Number.isFinite(breakMinutes) ||
                !Number.isInteger(breakMinutes) ||
                breakMinutes < 0 ||
                breakMinutes >= durationMinutes
              ? "break"
              : start > now + 300000 || end > now + 300000
                ? "future"
                : reason.trim().length < 3
                  ? "reason"
                  : null;
  return { issue, valid: issue === null, durationMinutes, breakMinutes };
}
