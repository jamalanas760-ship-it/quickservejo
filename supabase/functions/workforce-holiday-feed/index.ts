import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { GOOGLE_JORDAN_FEED, parseGoogleJordanHolidays } from "./calendar.ts";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
let cached: {
  holidays: ReturnType<typeof parseGoogleJordanHolidays>;
  fetchedAt: string;
  availableYears: number[];
} | null = null;
let pending: Promise<NonNullable<typeof cached>> | null = null;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return json({ error: "Authentication required" }, 401);
    if (!cached || Date.now() - Date.parse(cached.fetchedAt) > 6 * 60 * 60 * 1000) {
      if (!pending)
        pending = (async () => {
          const response = await fetch(GOOGLE_JORDAN_FEED, {
            signal: AbortSignal.timeout(12000),
            redirect: "error",
          });
          if (!response.ok) throw new Error("Holiday provider unavailable");
          const text = await response.text();
          const holidays = parseGoogleJordanHolidays(text);
          return {
            holidays,
            fetchedAt: new Date().toISOString(),
            availableYears: [
              ...new Set(holidays.map((h) => Number(h.holiday_date.slice(0, 4)))),
            ].sort((a, b) => a - b),
          };
        })();
      try {
        cached = await pending;
      } finally {
        pending = null;
      }
    }
    return json({ ...cached, source: "Google Calendar · Holidays in Jordan" });
  } catch {
    // Do not label a failed refresh as fresh or silently serve obsolete dates.
    return json(
      {
        error:
          "Google holiday dates are temporarily unavailable. Saved workspace holidays are unchanged.",
      },
      502,
    );
  }
});
