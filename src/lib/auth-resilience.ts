import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export function isAuthNetworkError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|network|load failed|fetch failed|econn|enotfound|timeout|dns|temporarily unavailable/i.test(raw);
}

/**
 * Resolve the authenticated user without destroying a valid locally persisted
 * session when the Supabase backend is temporarily unreachable.
 *
 * A successful getUser() response is preferred because it validates the JWT
 * against Auth. If Auth cannot be reached, the already-issued session user is
 * used as a temporary fallback. Explicit authentication failures still return
 * null and force the normal sign-in flow.
 */
export async function getResilientAuthenticatedUser(): Promise<User | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) return null;

  const sessionUser = sessionData.session.user;
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (!userError && userData.user) return userData.user;
  if (userError && isAuthNetworkError(userError)) return sessionUser;

  return null;
}
