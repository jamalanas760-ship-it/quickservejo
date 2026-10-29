import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { DEFAULT_PASSWORD_POLICY, passwordPolicyErrors, type PasswordPolicy } from "./policy.ts";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) return json({ error: "Service unavailable" }, 503);
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  const client = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !data.user?.email) return json({ error: "Authentication required" }, 401);
    const raw = await req.text();
    if (raw.length > 16000) return json({ error: "Request too large" }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid request" }, 400);
    }
    if (!body || typeof body !== "object") return json({ error: "Invalid request" }, 400);
    if (
      typeof body.password !== "string" ||
      typeof body.currentPassword !== "string" ||
      body.currentPassword.length > 1024
    )
      return json({ error: "Both passwords are required" }, 400);
    const memberships = await client
      .from("staff")
      .select("restaurant_id")
      .eq("auth_user_id", data.user.id)
      .eq("is_active", true);
    if (memberships.error) return json({ error: "Could not load workspace rules" }, 503);
    const ids = [...new Set((memberships.data ?? []).map((x) => x.restaurant_id).filter(Boolean))];
    let policies: PasswordPolicy[] = [];
    if (ids.length) {
      const result = await client
        .from("workspace_password_policies")
        .select("*")
        .in("restaurant_id", ids);
      if (result.error) return json({ error: "Could not load workspace rules" }, 503);
      policies = (result.data ?? []) as PasswordPolicy[];
    }
    if (policies.length < ids.length || !policies.length) policies.push(DEFAULT_PASSWORD_POLICY);
    const violations = [
      ...new Set(
        policies.flatMap((policy) => passwordPolicyErrors(body.password, policy, data.user.email!)),
      ),
    ];
    if (violations.length) return json({ error: violations.join(". ") }, 400);
    // Verify the current password without replacing the caller's original (possibly MFA) session.
    const verifier = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const verified = await verifier.auth.signInWithPassword({
      email: data.user.email,
      password: body.currentPassword,
    });
    if (verified.error || verified.data.user?.id !== data.user.id)
      return json({ error: "Current password is incorrect" }, 400);
    if (verified.data.session) await verifier.auth.signOut({ scope: "local" });
    const updated = await fetch(`${url}/auth/v1/user`, {
      method: "PUT",
      headers: { apikey: key, Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ password: body.password, current_password: body.currentPassword }),
    });
    if (!updated.ok)
      return json(
        {
          error:
            "Password could not be changed. Check your session and authentication requirements.",
        },
        400,
      );
    return json({ ok: true });
  } catch {
    return json({ error: "Password service unavailable. Please try again." }, 503);
  }
});
