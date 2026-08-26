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
export function playOrderAlert(): void {
  const audio = audioContext();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();

  const start = audio.currentTime;
  [
    { freq: 880, at: 0 },
    { freq: 1320, at: 0.18 },
  ].forEach(({ freq, at }) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(0.25, start + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.35);
    osc.connect(gain).connect(audio.destination);
    osc.start(start + at);
    osc.stop(start + at + 0.4);
  });
}
