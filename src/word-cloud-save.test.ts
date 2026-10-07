import assert from 'node:assert/strict';
import test from 'node:test';
import { saveWordWithVersion, supabaseWordStore, type WordCloudStore } from './word-cloud-save.ts';

const attempt = (id: string, discarded = false) => ({ id, at: 1, word: 'afspraak', chunk: 'een afspraak maken',
  outcome: 'needs-practice', source: 'conversation', discarded });
const row = (progress: unknown[] = [], version: string | null = null) => ({ user_id: 'learner', word: 'afspraak',
  word_data: { usage_progress: progress }, updated_at: version });
function memory(initial: ReturnType<typeof row> | null) {
  let saved: any = initial;
  const versions: Array<string | null> = [];
  const store: WordCloudStore = {
    read: async () => ({ data: structuredClone(saved), error: null }),
    insert: async value => saved ? { data: null, error: { code: '23505' } }
      : (saved = structuredClone(value), { data: saved, error: null }),
    update: async (value, version) => {
      versions.push(version);
      if (!saved || (saved.updated_at ?? null) !== version) return { data: null, error: null };
      saved = structuredClone(value); return { data: saved, error: null };
    },
  };
  return { store, versions, get: () => saved };
}
test('two independent clients preserve observations and dismissals across a CAS conflict', async () => {
  const db = memory(row([attempt('old')], '2026-01-01T00:00:00.000Z'));
  await Promise.all([
    saveWordWithVersion(db.store, () => row([attempt('old', true), attempt('a')]), () => true, () => 1),
    saveWordWithVersion(db.store, () => row([attempt('old'), attempt('b')]), () => true, () => 1),
  ]);
  const progress = db.get().word_data.usage_progress;
  assert.deepEqual(progress.map((a: any) => a.id).sort(), ['a', 'b', 'old']);
  assert.equal(progress.find((a: any) => a.id === 'old').discarded, true);
  assert.equal(db.versions.length, 3);
  assert.equal(db.get().updated_at, '2026-01-01T00:00:00.002Z');
});
test('concurrent first inserts retry the unique conflict without replacing evidence', async () => {
  const db = memory(null);
  await Promise.all(['a', 'b'].map(id => saveWordWithVersion(db.store, () => row([attempt(id)]), () => true)));
  assert.equal(db.get().word_data.usage_progress.length, 2);
});
test('legacy null versions are checked and advanced', async () => {
  const db = memory(row());
  await saveWordWithVersion(db.store, () => row([attempt('new')]), () => true, () => 100);
  assert.deepEqual(db.versions, [null]);
  assert.equal(db.get().updated_at, '1970-01-01T00:00:00.100Z');
});
test('owner changes after reading cancel writes', async () => {
  const db = memory(row()); let active = true;
  const read = db.store.read;
  db.store.read = async () => { const result = await read(); active = false; return result; };
  assert.equal(await saveWordWithVersion(db.store, () => row(), () => active), null);
  assert.equal(db.versions.length, 0);
});
test('permission errors stop immediately and repeated conflicts are bounded', async () => {
  const db = memory(row()); let calls = 0;
  db.store.update = async () => { calls++; return { data: null, error: { code: '42501' } }; };
  await assert.rejects(saveWordWithVersion(db.store, () => row(), () => true), { code: '42501' });
  assert.equal(calls, 1);
  calls = 0; db.store.update = async () => { calls++; return { data: null, error: null }; };
  await assert.rejects(saveWordWithVersion(db.store, () => row(), () => true), /concurrently/);
  assert.equal(calls, 5);
});
test('Supabase adapter scopes reads and atomic updates including null versions', async () => {
  const calls: unknown[][] = [];
  const query: any = {};
  for (const method of ['select', 'eq', 'is', 'update', 'insert']) query[method] = (...args: unknown[]) => {
    calls.push([method, ...args]); return query;
  };
  query.maybeSingle = async () => ({ data: null, error: null });
  const store = supabaseWordStore({ from: (table: string) => { calls.push(['from', table]); return query; } }, 'learner', 'afspraak');
  await store.read();
  assert.deepEqual(calls, [['from', 'user_words'], ['select', 'word_data,updated_at'], ['eq', 'user_id', 'learner'], ['eq', 'word', 'afspraak']]);
  calls.length = 0; await store.update(row(), null);
  assert.deepEqual(calls.slice(2), [['eq', 'user_id', 'learner'], ['eq', 'word', 'afspraak'], ['is', 'updated_at', null], ['select']]);
  calls.length = 0; await store.update(row(), 'version');
  assert.deepEqual(calls[4], ['eq', 'updated_at', 'version']);
});
test('each conflict re-reads both the server and latest local observation', async () => {
  const db = memory(row()); let local = row([attempt('before')]);
  const update = db.store.update; let first = true;
  db.store.update = async (value, version) => {
    if (first) { first = false; local = row([attempt('after')]); return { data: null, error: null }; }
    return update(value, version);
  };
  await saveWordWithVersion(db.store, () => local, () => true);
  assert.deepEqual(db.get().word_data.usage_progress.map((a: any) => a.id), ['after']);
});
test('latest remote definitions survive stale saves while missing usages are filled', async () => {
  const explanation = { word: 'afspraak', type: 'zelfstandig naamwoord', meaning_nl: 'Een afspraak.',
    meaning_en: 'appointment', examples: [{ nl: 'Mijn afspraak is morgen.', en: 'My appointment is tomorrow.' },
      { nl: 'Ik heb een afspraak.', en: 'I have an appointment.' }], tips: 'Use maken.', fun_fact: null };
  const use = { chunk: 'een afspraak maken', meaning_en: 'make an appointment', frame: 'Ik wil een afspraak maken.',
    example_nl: 'Ik wil een afspraak maken.', example_en: 'I want an appointment.', review_prompt: 'Arrange a time.' };
  const local = { ...row([attempt('local')]), word_data: { ...explanation, usage: [use], usage_progress: [attempt('local')] } };
  for (const usage of [undefined, []]) {
    const db = memory({ ...row(), word_data: { ...explanation, meaning_en: 'updated appointment', usage } } as any);
    await saveWordWithVersion(db.store, () => local, () => true);
    assert.equal(db.get().word_data.meaning_en, 'updated appointment');
    assert.deepEqual(db.get().word_data.usage, usage ?? [use]);
    assert.equal(db.get().word_data.usage_progress[0].id, 'local');
  }
});
test('read failures do not fall back to unprotected writes', async () => {
  const db = memory(row());
  db.store.read = async () => ({ data: null, error: { code: 'NETWORK' } });
  await assert.rejects(saveWordWithVersion(db.store, () => row(), () => true), { code: 'NETWORK' });
  assert.equal(db.versions.length, 0);
});
