import test from 'node:test';
import assert from 'node:assert/strict';
import { playAlertChime, unlockAlertSound } from '../src/lib/alert-audio.ts';

test('alert audio resumes before scheduling, recovers interruption and recreates closed contexts', async () => {
  const original = globalThis.window;
  const instances = [];
  class Audio {
    state = 'suspended'; currentTime = 10; sampleRate = 48000; destination = {}; notes = []; resumeCount = 0;
    constructor() { instances.push(this); }
    async resume() { this.resumeCount++; await Promise.resolve(); this.currentTime = 20; this.state = 'running'; }
    createBufferSource() { return { connect() {}, disconnect() {}, start() {} }; }
    createBuffer() { return {}; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: () => ({ }), disconnect() {} }; }
    createOscillator() { const audio = this; return { frequency: {}, connect: () => ({ connect() {} }), disconnect() {}, start(at) { assert.equal(audio.state, 'running'); audio.notes.push(at); }, stop() {} }; }
  }
  try {
    globalThis.window = { webkitAudioContext: Audio };
    await playAlertChime('soft', 60);
    assert.equal(instances.length, 1);
    assert.equal(instances[0].resumeCount, 1);
    assert.deepEqual(instances[0].notes, [20.025, 20.205]);
    instances[0].state = 'interrupted';
    await playAlertChime('bell', 30);
    assert.equal(instances[0].resumeCount, 2);
    instances[0].state = 'closed';
    await unlockAlertSound();
    assert.equal(instances.length, 2);
    await assert.rejects(playAlertChime('soft', 0), /muted/);
    instances[1].state = 'closed';
    globalThis.window = {};
    await assert.rejects(unlockAlertSound(), /unavailable/);
  } finally { globalThis.window = original; }
});

test('each selectable sound schedules a distinct bounded rhythm and timbre at the saved volume', async () => {
  const { ALERT_TONES } = await import('../src/lib/notification-preferences.ts');
  const original = globalThis.window;
  let audio;
  class Audio {
    state = 'running'; currentTime = 0; sampleRate = 48000; destination = {}; voices = []; gains = [];
    constructor() { audio = this; }
    async resume() { this.state = 'running'; }
    createBufferSource() { return { connect() {}, disconnect() {}, start() {} }; }
    createBuffer() { return {}; }
    createGain() {
      const envelope = [];
      this.gains.push(envelope);
      return { gain: {
        setValueAtTime(value, at) { envelope.push([value, at]); },
        exponentialRampToValueAtTime(value, at) { envelope.push([value, at]); },
      }, connect() {}, disconnect() {} };
    }
    createOscillator() {
      const voice = { frequency: {}, connect() { return { connect() {} }; }, disconnect() {},
        start(at) { this.startAt = at; }, stop(at) { this.stopAt = at; } };
      this.voices.push(voice);
      return voice;
    }
  }
  try {
    globalThis.window = { AudioContext: Audio };
    const signatures = [];
    for (const tone of ALERT_TONES) {
      await playAlertChime(tone.id, 40);
      const voices = audio.voices;
      assert.ok(voices.length >= 2);
      for (let i = 0; i < voices.length; i++) {
        const voice = voices[i], envelope = audio.gains[i];
        assert.ok(voice.frequency.value >= 200 && voice.frequency.value < 4000);
        assert.ok(voice.startAt >= .025 && voice.stopAt <= 1.1);
        assert.ok(envelope[1][1] > voice.startAt && envelope[2][1] > envelope[1][1]);
        assert.ok(envelope[1][0] > 0 && envelope[1][0] <= .12);
        assert.equal(envelope[2][0], .0001);
      }
      // Ignore pitch: even without transposition, rhythm/timbre/envelopes differ.
      signatures.push(JSON.stringify(voices.map((v, i) => [v.type, v.startAt, v.stopAt, audio.gains[i]])));
      audio.state = 'closed';
    }
    assert.equal(new Set(signatures).size, ALERT_TONES.length);
    await assert.rejects(playAlertChime('soft', NaN), /muted/);
    await assert.rejects(playAlertChime('soft', -10), /muted/);
    await playAlertChime('soft', 200);
    assert.equal(audio.gains[0][1][0], .3, 'values above 100 are clamped');
    audio.state = 'closed';
  } finally { globalThis.window = original; }
});
