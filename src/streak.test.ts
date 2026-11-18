import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceStreak, mergeStreak, migrateLegacyStreak, readStreak, streakDay, syncStreak, writeStreak } from './streak.ts';

function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
test('Amsterdam days preserve a restored streak through midnight and DST', () => {
  assert.equal(streakDay(new Date('2026-11-18T23:10:00Z')), '2026-11-19');
  assert.equal(streakDay(new Date('2026-07-01T22:10:00Z')), '2026-07-02');
  const saved = { lastDate: '2026-11-18', count: 52 };
  assert.equal(advanceStreak(saved, '2026-11-18').count, 52);
  assert.equal(advanceStreak(saved, '2026-11-19').count, 53);
  assert.equal(advanceStreak(saved, '2026-11-20').count, 1);
});
test('legacy data is retained and can migrate to only one account', () => {
  const s = storage();
  s.setItem('poortaal_streak', JSON.stringify({ lastDate: '2026-11-18', count: 52 }));
  migrateLegacyStreak('a', s); migrateLegacyStreak('b', s);
  assert.equal(readStreak('a', s).count, 52);
  assert.equal(readStreak('b', s).count, 0);
  assert.equal(readStreak(null, s).count, 0);
  assert.ok(s.getItem('poortaal_streak'));
});
test('offline streak ranges merge in either upload order without bridging a missed day', () => {
  const older = { lastDate: '2026-11-17', count: 50 };
  const offline = { lastDate: '2026-11-19', count: 2 };
  const expected = { lastDate: '2026-11-19', count: 52 };
  assert.deepEqual(mergeStreak(older, offline), expected);
  assert.deepEqual(mergeStreak(offline, older), expected);
  const missed = { lastDate: '2026-11-20', count: 1 };
  assert.deepEqual(mergeStreak(older, missed), missed);
});
test('a fresh browser restores the cloud count without replacing it with zero', async () => {
  const s = storage();
  const client = { rpc: async (name: string, args: unknown) => {
    assert.equal(name, 'sync_learning_streak');
    assert.deepEqual(args, { p_local_date: null, p_local_count: 0, p_practice: false });
    return { data: { user_id: 'a', last_date: '2026-11-18', count: 52 }, error: null };
  } };
  await syncStreak(client, 'a', () => true, false, s);
  assert.equal(readStreak('a', s).count, 52);
});
test('switching accounts during a request cannot leak the response into local storage', async () => {
  const s = storage(); let active = true;
  const client = { rpc: async () => { active = false;
    return { data: { user_id: 'a', last_date: '2026-11-18', count: 52 }, error: null }; } };
  await syncStreak(client, 'a', () => active, false, s);
  assert.equal(readStreak('a', s).count, 0);
});
test('offline errors preserve local progress and older replies cannot erase newer activity', async () => {
  const s = storage(); const newer = { lastDate: '2026-11-19', count: 53 };
  writeStreak('a', newer, s);
  await assert.rejects(syncStreak({ rpc: async () => ({ error: new Error('offline') }) }, 'a', () => true, true, s));
  assert.deepEqual(readStreak('a', s), newer);
  assert.deepEqual(mergeStreak(newer, { lastDate: '2026-11-18', count: 52 }), newer);
});
