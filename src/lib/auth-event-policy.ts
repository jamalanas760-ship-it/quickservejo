/** Foreground SIGNED_IN and token refreshes keep the current account's UI cache. */
export function shouldRefreshAuthAccess(
  event: string,
  previousUserId: string | null | undefined,
  nextUserId: string | null,
): boolean {
  if (event === "INITIAL_SESSION") return false;
  return event === "SIGNED_OUT" || event === "USER_UPDATED"
    || (previousUserId !== undefined && previousUserId !== nextUserId)
    || (event === "SIGNED_IN" && previousUserId === undefined);
}
