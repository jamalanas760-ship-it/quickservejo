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
