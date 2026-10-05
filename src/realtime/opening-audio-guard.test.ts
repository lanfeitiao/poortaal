import assert from 'node:assert/strict';
import test from 'node:test';
import { OpeningAudioGuard } from './opening-audio-guard.ts';

function microphone() {
  const track = { enabled: true };
  const stream = { getAudioTracks: () => [track] } as unknown as MediaStream;
  return { track, stream };
}

test('opening audio cannot enter the mic; initial silence and question pauses keep it guarded', () => {
  const { track, stream } = microphone();
  let released = 0;
  const guard = new OpeningAudioGuard(stream, () => { released++; });
  assert.equal(track.enabled, false);
  guard.start();
  guard.observe(0, 6000);
  assert.equal(track.enabled, false);
  guard.observe(0.1, 6100);
  guard.observe(0, 6750);
  assert.equal(track.enabled, false);
  guard.observe(0.1, 6800);
  guard.observe(0, 7499);
  assert.equal(track.enabled, false);
  guard.observe(0, 7500);
  assert.equal(track.enabled, true);
  assert.equal(released, 1);
  // Later tutor responses keep normal two-way audio; duplicate startup is harmless.
  guard.start();
  guard.observe(0.1, 7600);
  assert.equal(track.enabled, true);
  assert.equal(released, 1);
});

test('disposing a stopped encounter never unmutes its microphone later', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { track, stream } = microphone();
  let released = 0;
  const guard = new OpeningAudioGuard(stream, () => { released++; });
  guard.start();
  guard.observe(0.1, 1000);
  guard.dispose();
  guard.observe(0, 5000);
  t.mock.timers.tick(25_000);
  assert.equal(track.enabled, false);
  assert.equal(released, 0);
});

test('a missing greeting has a bounded fallback instead of trapping the microphone', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'warn', () => {});
  const { track, stream } = microphone();
  const guard = new OpeningAudioGuard(stream, () => {});
  guard.start();
  t.mock.timers.tick(19_999);
  assert.equal(track.enabled, false);
  t.mock.timers.tick(1);
  assert.equal(track.enabled, true);
});
