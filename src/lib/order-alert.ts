import { supabase } from "@/integrations/supabase/client";
import { readNotificationPreferences } from "@/lib/notification-preferences";
import { playAlertChime } from "@/lib/alert-audio";
export { playAlertChime, unlockAlertSound } from "@/lib/alert-audio";

/** Background alerts remain quiet if audio has not been permitted on this device. */
export async function playOrderAlert(): Promise<void> {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const prefs = readNotificationPreferences(data.session?.user.id);
  if (!prefs.sound || !prefs.newOrders || !prefs.orderSounds || prefs.volume <= 0) return;
  await playAlertChime(prefs.tone, prefs.volume).catch(() => undefined);
}
