type TokenSession = { access_token: string; expires_at?: number };
type SessionResult = { data: { session: TokenSession | null }; error: unknown };
type AuthSource = { getSession(): Promise<SessionResult>; refreshSession(): Promise<SessionResult> };

export function safeSessionRedirect(value?: string): string {
  return value && value.startsWith("/") && !/^\/[/\\]|[\u0000-\u0020\\]/.test(value) && !/^\/auth(?:[/?#]|$)/.test(value) ? value : "/dashboard";
}

export async function resolveSessionUser<User>(auth: {
  getSession(): Promise<{ data: { session: { user: User } | null }; error: unknown }>;
  getUser(): Promise<{ data: { user: User | null }; error: unknown }>;
}): Promise<User | null> {
  let current;
  try { current = await auth.getSession(); }
  catch (error) { if (isTransientAuthError(error)) throw error; return null; }
  if (current.error && isTransientAuthError(current.error)) throw current.error;
  if (current.error || !current.data.session) return null;
  try {
    const result = await auth.getUser();
    if (!result.error && result.data.user) return result.data.user;
    return isTransientAuthError(result.error) ? current.data.session.user : null;
  } catch (error) { return isTransientAuthError(error) ? current.data.session.user : null; }
}

export function isTransientAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: number; name?: string; message?: string };
  return value.name === "AuthRetryableFetchError" || (typeof value.status === "number" && (value.status >= 500 || value.status === 429)) ||
    /failed to fetch|network|load failed|fetch failed|econn|enotfound|timeout|dns|temporarily unavailable/i.test(value.message ?? "");
}

/** Coalesce concurrent requests; never replay the protected operation itself. */
export function createAccessTokenResolver(auth: AuthSource, now = Date.now) {
  let pending: Promise<string | null> | null = null;
  const expired = () => new Error("Your session expired. Sign in again, then retry.");
  const unavailable = () => new Error("Authentication is temporarily unavailable. Your changes have not been sent. Please retry shortly.");
  async function resolve(): Promise<string | null> {
    let current: SessionResult;
    try { current = await auth.getSession(); }
    catch (error) { throw isTransientAuthError(error) ? unavailable() : error; }
    if (current.error) throw isTransientAuthError(current.error) ? unavailable() : expired();
    const session = current.data.session;
    // Public server functions (for example PIN sign-in) still need to run.
    // Protected functions reject an absent token in their server middleware.
    if (!session?.access_token) return null;
    if (session.expires_at && session.expires_at * 1000 > now() + 30_000) return session.access_token;
    try {
      const refreshed = await auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      if (!refreshed.data.session?.access_token) throw expired();
      return refreshed.data.session.access_token;
    } catch (error) {
      if (!isTransientAuthError(error)) throw expired();
      // A brief outage must not discard a token that has not expired yet.
      // Server-side getUser still validates every protected request.
      if (session.expires_at && session.expires_at * 1000 > now()) return session.access_token;
      throw unavailable();
    }
  }
  return () => {
    if (!pending) pending = resolve().finally(() => { pending = null; });
    return pending;
  };
}
