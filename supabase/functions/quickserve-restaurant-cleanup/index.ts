import { createClient } from "npm:@supabase/supabase-js@2.112.4";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = req.headers.get("x-quickserve-worker");
  if (!secret) return json({ error: "Unauthorized" }, 401);
  try {
    const key =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default;
    if (!key) return json({ error: "Server configuration unavailable" }, 503);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, key, {
      auth: { persistSession: false },
    });
    const auth = await admin.rpc("restaurant_cleanup_worker_authorized", { _secret: secret });
    if (auth.error || auth.data !== true) return json({ error: "Unauthorized" }, 401);
    const jobs = await admin.rpc("claim_restaurant_cleanup");
    if (jobs.error) throw jobs.error;
    let completed = 0;
    for (const job of jobs.data || []) {
      try {
        // Bounded batches, API deletion (never delete storage metadata directly).
        for (let batch = 0; batch < 8; batch++) {
          const objects = await admin.rpc("restaurant_cleanup_objects", {
            _restaurant_id: job.restaurant_id,
          });
          if (objects.error) throw objects.error;
          if (!objects.data?.length) {
            const done = await admin
              .from("restaurant_media_cleanup")
              .delete()
              .eq("restaurant_id", job.restaurant_id);
            if (done.error) throw done.error;
            completed++;
            break;
          }
          for (const bucket of ["restaurant-media", "menu-pdfs"]) {
            const paths = objects.data
              .filter((o: { bucket_id: string }) => o.bucket_id === bucket)
              .map((o: { name: string }) => o.name);
            if (paths.length) {
              const removed = await admin.storage.from(bucket).remove(paths);
              if (removed.error) throw removed.error;
            }
          }
        }
      } catch {
        console.error("Restaurant cleanup batch failed", job.restaurant_id);
      }
    }
    return json({ completed });
  } catch {
    return json({ error: "Cleanup unavailable; queued jobs will retry" }, 500);
  }
});
