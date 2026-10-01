import { supabase } from "@/integrations/supabase/client";
import {
  readNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notification-preferences";

/**
 * Kitchen alert sound. Uses the Web Audio API so no asset is needed and the
 * chime can be unlocked by the first user gesture on the page.
 */
let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

/** Call from a user gesture so browsers allow later programmatic playback. */
export async function unlockAlertSound(): Promise<void> {
  const audio = audioContext();
  if (audio && audio.state === "suspended") await audio.resume();
}

/** Two-tone chime; safe to call repeatedly. */
export async function playOrderAlert(): Promise<void> {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const prefs = readNotificationPreferences(data.session?.user.id);
  if (!prefs.sound || !prefs.newOrders || !prefs.orderSounds) return;
  playAlertChime(prefs.tone, prefs.volume);
}

export function playAlertChime(tone: NotificationPreferences["tone"] = "soft", volume = 60): void {
  if (!Number.isFinite(volume) || volume <= 0) return;
  const audio = audioContext();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();

  const start = audio.currentTime;
  [
    { freq: tone === "bell" ? 1046 : tone === "soft" ? 660 : 880, at: 0 },
    { freq: tone === "bell" ? 1568 : tone === "soft" ? 990 : 1320, at: 0.18 },
  ].forEach(({ freq, at }) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, (Math.min(100, Math.max(0, volume)) / 100) * 0.25),
      start + at + 0.02,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.35);
    osc.connect(gain).connect(audio.destination);
    osc.start(start + at);
    osc.stop(start + at + 0.4);
  });
}
