import type { NotificationPreferences } from "./notification-preferences";

let context: AudioContext | null = null;
function getContext(): AudioContext {
  if (typeof window === "undefined") throw new Error("Audio is unavailable");
  const Constructor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) throw new Error("Audio is unavailable");
  if (!context || context.state === "closed") context = new Constructor();
  return context;
}

/** Invoke directly from a click/pointer gesture, before any network or timer work. */
export async function unlockAlertSound(): Promise<void> {
  const audio = getContext();
  // Safari can enter "interrupted" after a phone call or switching apps.
  if (audio.state !== "running") await audio.resume();
  if (audio.state !== "running") throw new Error("Audio playback is blocked");
  // A silent buffer primes the output on mobile WebKit without an audible alert.
  const buffer = audio.createBufferSource();
  buffer.buffer = audio.createBuffer(1, 1, audio.sampleRate);
  buffer.connect(audio.destination);
  buffer.onended = () => buffer.disconnect();
  buffer.start();
}

export async function playAlertChime(
  tone: NotificationPreferences["tone"] = "soft",
  volume = 60,
): Promise<void> {
  if (!Number.isFinite(volume) || volume <= 0) throw new Error("Volume is muted");
  const audio = getContext();
  // Resume synchronously within the gesture; schedule notes only after it resolves.
  await unlockAlertSound();
  const start = audio.currentTime + 0.025;
  const notes = tone === "bell" ? [1046, 1568] : tone === "classic" ? [880, 1320] : [660, 990];
  notes.forEach((frequency, index) => {
    const at = start + index * 0.18;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime((Math.min(100, volume) / 100) * 0.3, at + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(at + 0.45);
  });
}
