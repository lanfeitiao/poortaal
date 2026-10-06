import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForTranscriptIdle } from './transcript-settle.ts';

test('a late caption tail extends settling before a snapshot is taken', async () => {
  let now = 0; let last = 0;
  const settled = await waitForTranscriptIdle(() => last, () => true, () => now, async ms => {
    now += ms;
    if (now === 1100) last = now;
  });
  assert.equal(settled, true);
  assert.equal(now, 1800);
});
test('ongoing caption activity reaches a bounded uncertain result', async () => {
  let now = 0;
  const settled = await waitForTranscriptIdle(() => now, () => true, () => now, async ms => { now += ms; });
  assert.equal(settled, false);
  assert.equal(now, 3000);
});
test('leaving or replacing a session cancels its pending feedback snapshot', async () => {
  let now = 0;
  const settled = await waitForTranscriptIdle(() => 0, () => now < 400, () => now, async ms => { now += ms; });
  assert.equal(settled, false);
  assert.equal(now, 400);
});
