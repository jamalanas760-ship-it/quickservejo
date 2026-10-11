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
  const profiles: Record<NotificationPreferences["tone"], { notes: number[]; wave: OscillatorType; spacing: number; decay: number; strength: number }> = {
    soft: { notes: [660, 990], wave: "sine", spacing: .18, decay: .4, strength: .3 },
    classic: { notes: [880, 1320], wave: "sine", spacing: .18, decay: .4, strength: .3 },
    bell: { notes: [1046, 1568], wave: "sine", spacing: .18, decay: .4, strength: .3 },
    glass: { notes: [1318, 1976], wave: "sine", spacing: .12, decay: .65, strength: .22 },
    marimba: { notes: [523, 659, 784], wave: "triangle", spacing: .12, decay: .25, strength: .22 },
    gentle: { notes: [392, 523], wave: "sine", spacing: .24, decay: .55, strength: .2 },
    bright: { notes: [784, 988, 1175], wave: "sine", spacing: .11, decay: .35, strength: .24 },
    service: { notes: [1175, 1760, 2350], wave: "sine", spacing: .035, decay: .7, strength: .13 },
  };
  const profile = profiles[tone] ?? profiles.soft;
  const notes = profile.notes;
  notes.forEach((frequency, index) => {
    const at = start + index * profile.spacing;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = profile.wave;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime((Math.min(100, volume) / 100) * profile.strength, at + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + profile.decay);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(at + profile.decay + .05);
  });
}
