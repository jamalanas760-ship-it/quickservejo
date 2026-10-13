import type { NotificationPreferences } from "./notification-preferences";

type SoundNote = {
  frequency: number;
  offset: number;
  wave: OscillatorType;
  attack: number;
  duration: number;
  strength: number;
};
/** Timbre, rhythm and envelope differ as well as pitch; IDs remain compatible. */
export const ALERT_SOUND_PROFILES: Record<NotificationPreferences["tone"], { notes: SoundNote[] }> =
  {
    soft: {
      notes: [
        { frequency: 660, offset: 0, wave: "sine", attack: 0.025, duration: 0.4, strength: 0.3 },
        { frequency: 990, offset: 0.18, wave: "sine", attack: 0.025, duration: 0.4, strength: 0.3 },
      ],
    },
    classic: {
      notes: [
        {
          frequency: 740,
          offset: 0,
          wave: "square",
          attack: 0.008,
          duration: 0.13,
          strength: 0.08,
        },
        {
          frequency: 740,
          offset: 0.24,
          wave: "square",
          attack: 0.008,
          duration: 0.13,
          strength: 0.08,
        },
      ],
    },
    bell: {
      notes: [
        { frequency: 784, offset: 0, wave: "sine", attack: 0.005, duration: 0.95, strength: 0.2 },
        {
          frequency: 2117,
          offset: 0,
          wave: "sine",
          attack: 0.005,
          duration: 0.45,
          strength: 0.065,
        },
      ],
    },
    glass: {
      notes: [
        { frequency: 1568, offset: 0, wave: "sine", attack: 0.004, duration: 0.3, strength: 0.14 },
        {
          frequency: 2349,
          offset: 0.09,
          wave: "sine",
          attack: 0.004,
          duration: 0.4,
          strength: 0.12,
        },
        {
          frequency: 3136,
          offset: 0.18,
          wave: "sine",
          attack: 0.004,
          duration: 0.55,
          strength: 0.08,
        },
      ],
    },
    marimba: {
      notes: [
        {
          frequency: 523,
          offset: 0,
          wave: "triangle",
          attack: 0.005,
          duration: 0.18,
          strength: 0.2,
        },
        {
          frequency: 659,
          offset: 0.15,
          wave: "triangle",
          attack: 0.005,
          duration: 0.18,
          strength: 0.2,
        },
        {
          frequency: 784,
          offset: 0.3,
          wave: "triangle",
          attack: 0.005,
          duration: 0.24,
          strength: 0.2,
        },
      ],
    },
    gentle: {
      notes: [
        { frequency: 330, offset: 0, wave: "sine", attack: 0.12, duration: 0.42, strength: 0.16 },
        {
          frequency: 330,
          offset: 0.55,
          wave: "sine",
          attack: 0.12,
          duration: 0.42,
          strength: 0.16,
        },
      ],
    },
    bright: {
      notes: [
        {
          frequency: 784,
          offset: 0,
          wave: "triangle",
          attack: 0.018,
          duration: 0.3,
          strength: 0.16,
        },
        {
          frequency: 988,
          offset: 0.1,
          wave: "triangle",
          attack: 0.018,
          duration: 0.3,
          strength: 0.16,
        },
        {
          frequency: 1175,
          offset: 0.2,
          wave: "triangle",
          attack: 0.018,
          duration: 0.45,
          strength: 0.16,
        },
      ],
    },
    service: {
      notes: [
        { frequency: 1175, offset: 0, wave: "sine", attack: 0.003, duration: 0.75, strength: 0.16 },
        { frequency: 1762, offset: 0, wave: "sine", attack: 0.003, duration: 0.5, strength: 0.065 },
        {
          frequency: 2467,
          offset: 0,
          wave: "sine",
          attack: 0.003,
          duration: 0.25,
          strength: 0.025,
        },
      ],
    },
  };

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
  const profile = ALERT_SOUND_PROFILES[tone] ?? ALERT_SOUND_PROFILES.soft;
  const notes = profile.notes;
  notes.forEach((note) => {
    const at = start + note.offset;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = note.wave;
    oscillator.frequency.value = note.frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(
      (Math.min(100, volume) / 100) * note.strength,
      at + note.attack,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, at + note.duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(at + note.duration + 0.05);
  });
}
