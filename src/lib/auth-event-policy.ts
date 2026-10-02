/** Foreground SIGNED_IN and token refreshes keep the current account's UI cache. */
export function shouldRefreshAuthAccess(
  event: string,
  previousUserId: string | null | undefined,
  nextUserId: string | null,
): boolean {
  if (event === "INITIAL_SESSION") return false;
  return (
    event === "SIGNED_OUT" ||
    event === "USER_UPDATED" ||
    (previousUserId !== undefined && previousUserId !== nextUserId) ||
    (event === "SIGNED_IN" && previousUserId === undefined)
  );
}

/** Only a new login or sign-out resets the default; foreground auth events do not. */
export function shouldResetThemeForAuth(
  event: string,
  previousUserId: string | null | undefined,
  nextUserId: string | null,
): boolean {
  return (
    event === "SIGNED_OUT" ||
    (event === "SIGNED_IN" && (previousUserId == null || previousUserId !== nextUserId))
  );
}
