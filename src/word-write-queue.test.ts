import assert from 'node:assert/strict';
import test from 'node:test';
import { createWordWriteQueue } from './word-write-queue.ts';

test('dismissal cannot start until the earlier word write completes', async () => {
  const enqueue = createWordWriteQueue();
  const saved: boolean[] = [];
  let dismissed = false;
  let release!: () => void;
  const first = enqueue('owner', 'afspraak', async () => {
    const snapshot = dismissed;
    await new Promise<void>(resolve => { release = resolve; });
    saved.push(snapshot);
  });
  await Promise.resolve(); await Promise.resolve();
  dismissed = true;
  const second = enqueue('owner', ' Afspraak ', async () => { saved.push(dismissed); });
  await Promise.resolve();
  assert.deepEqual(saved, []);
  release(); await Promise.all([first, second]);
  assert.deepEqual(saved, [false, true]);
});
test('a failed write does not strand the later dismissal', async () => {
  const enqueue = createWordWriteQueue();
  const first = enqueue('owner', 'afspraak', async () => { throw new Error('offline'); });
  let saved = false;
  const second = enqueue('owner', 'afspraak', async () => { saved = true; });
  await assert.rejects(first, /offline/); await second;
  assert.equal(saved, true);
});
test('other words and other owners can write while one word is pending', async () => {
  const enqueue = createWordWriteQueue();
  let release!: () => void;
  const first = enqueue('owner', 'afspraak', () => new Promise<void>(resolve => { release = resolve; }));
  await Promise.resolve(); await Promise.resolve();
  let finished = 0;
  await Promise.all([
    enqueue('owner', 'tijd', async () => { finished++; }),
    enqueue('other', 'afspraak', async () => { finished++; }),
  ]);
  assert.equal(finished, 2); release(); await first;
});
