import { supabase } from "@/integrations/supabase/client";
import { readNotificationPreferences } from "@/lib/notification-preferences";

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}
export async function disableDevicePush() {
  const registration = await navigator.serviceWorker?.getRegistration();
  await (await registration?.pushManager.getSubscription())?.unsubscribe();
}
export async function enableDevicePush(restaurantId: string, userId: string, ask = false) {
  if (!pushSupported())
    throw new Error("Add QuickServe to your Home Screen to enable notifications.");
  // Request immediately in the button handler; iOS requires a user gesture.
  const permission = ask ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted")
    throw new Error("Allow notifications in your device settings, then try again.");
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  if (!registration.active)
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Notification service is starting. Please try again.")),
          8000,
        ),
      ),
    ]);
  let subscription = await registration.pushManager.getSubscription();
  const owner = localStorage.getItem("quickserve.push-owner");
  if (subscription && owner !== userId) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    const { data: key, error } = await (supabase as any).rpc("push_public_key");
    if (error || !key)
      throw new Error("Notification setup is temporarily unavailable. Please try again.");
    const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(raw, (c: string) => c.charCodeAt(0));
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    });
  }
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys.auth) throw new Error("Please try enabling notifications again.");
  const { error } = await (supabase as any).from("push_subscriptions").upsert(
    {
      user_id: userId,
      restaurant_id: restaurantId,
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      preferences: readNotificationPreferences(userId),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,restaurant_id,endpoint" },
  );
  if (error) throw new Error("Could not save notification settings. Please try again.");
  localStorage.setItem("quickserve.push-owner", userId);
  return registration;
}
