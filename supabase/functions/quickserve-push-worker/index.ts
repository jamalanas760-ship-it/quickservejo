import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import webpush from "npm:web-push@3.6.7";
import { notificationCopy, notificationHref } from "../../../src/lib/notification-feed.ts";

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function allowedEndpoint(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname === "web.push.apple.com" ||
        u.hostname.endsWith(".push.apple.com"))
    );
  } catch {
    return false;
  }
}
Deno.serve(async (req) => {
  try {
    const serverKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default;
    if (!serverKey) return response({ error: "Server configuration unavailable" }, 503);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serverKey, {
      auth: { persistSession: false },
    });
    const { data: config, error: configError } = await admin.rpc("push_worker_config");
    if (configError || !config?.worker_secret)
      return response({ error: "Push configuration unavailable" }, 503);
    if (req.method !== "POST" || req.headers.get("x-quickserve-worker") !== config.worker_secret)
      return response({ error: "Unauthorized" }, 401);
    webpush.setVapidDetails(
      "https://quickservejo.lovable.app",
      config.public_key,
      config.private_key,
    );
    const { data: jobs, error } = await admin.rpc("claim_push_jobs");
    if (error) throw error;
    let delivered = 0;
    await Promise.all(
      (jobs || []).map(async (job) => {
        try {
          const { data: notification, error: notificationError } = await admin
            .from("in_app_notifications")
            .select("*")
            .eq("id", job.notification_id)
            .single();
          if (notificationError) throw notificationError;
          const { data: staff, error: staffError } = await admin
            .from("staff")
            .select("id,auth_user_id,role,permission_overrides")
            .eq("restaurant_id", notification.restaurant_id)
            .eq("is_active", true);
          if (staffError) throw staffError;
          const ids = (staff || [])
            .filter(
              (s) =>
                notification.staff_id === s.id ||
                (notification.target_role && notification.target_role === s.role),
            )
            .map((s) => s.auth_user_id);
          const { data: subscriptions, error: subscriptionError } = ids.length
            ? await admin
                .from("push_subscriptions")
                .select("*")
                .eq("restaurant_id", notification.restaurant_id)
                .in("user_id", ids)
            : { data: [], error: null };
          if (subscriptionError) throw subscriptionError;
          for (const sub of subscriptions || []) {
            if (
              notification.source_type === "order" &&
              (sub.preferences.newOrders === false ||
                (staff || []).find((s) => s.auth_user_id === sub.user_id)?.permission_overrides
                  ?.view_orders === false)
            )
              continue;
            if (notification.source_type !== "order" && sub.preferences.system === false) continue;
            if (!allowedEndpoint(sub.endpoint)) {
              await admin.from("push_subscriptions").delete().eq("id", sub.id);
              continue;
            }
            try {
              const copy = notificationCopy(notification);
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                JSON.stringify({
                  title: copy.title,
                  body: copy.body,
                  tag: notification.id,
                  url: notificationHref(notification),
                }),
                { TTL: 300, timeout: 10000 },
              );
              delivered++;
            } catch (err) {
              if ([404, 410].includes((err as { statusCode?: number }).statusCode ?? 0))
                await admin.from("push_subscriptions").delete().eq("id", sub.id);
              else throw err;
            }
          }
          await admin
            .from("push_delivery_jobs")
            .update({ delivered_at: new Date().toISOString(), last_error: null })
            .eq("notification_id", job.notification_id);
        } catch {
          await admin
            .from("push_delivery_jobs")
            .update({
              last_error: "Push delivery failed; retry scheduled",
              next_attempt_at: new Date(
                Date.now() + 60000 * Math.min(job.attempts, 5),
              ).toISOString(),
            })
            .eq("notification_id", job.notification_id);
        }
      }),
    );
    return response({ processed: jobs?.length || 0, delivered });
  } catch {
    return response({ error: "Push worker failed" }, 500);
  }
});
