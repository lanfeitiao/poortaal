import assert from 'node:assert/strict';
import test from 'node:test';
import { StructuredPractice } from './structured-controller.ts';
import { getWordAttempts, setLearningOwner } from './learning-store.ts';
import { activeSession, readSessions } from './structured-store.ts';
import { answer, goodFeedback, practiceUsage, scenario } from './structured-fixtures.ts';
import type { ChatMessage } from './word-explanation.ts';

const data = new Map<string, string>();
const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => data.delete(k) };
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
test.beforeEach(() => { data.clear(); setLearningOwner(null); });
const noop = () => {};
function chat(messages: ChatMessage[]) {
  const input = JSON.parse(messages[1].content);
  return Promise.resolve(JSON.stringify(input.answer ? goodFeedback(input.situation, input.answer) : scenario));
}
test('guided, optional retry, completion, refresh and subsequent recall preserve separate learning evidence', async () => {
  const p = new StructuredPractice(noop, chat);
  await p.start('afspraak', practiceUsage); assert.equal(p.session?.phase, 'guide');
  p.advance('continue'); p.draft(answer); await p.request();
  assert.equal(getWordAttempts('afspraak')[0].outcome, 'supported');
  p.advance('retry'); p.draft(answer.replace('morgen', 'vrijdag')); await p.request(); p.advance('finish');
  assert.equal(p.session?.phase, 'complete');
  const restored = new StructuredPractice(noop, chat); assert.equal(restored.restore(), true);
  assert.equal(getWordAttempts('afspraak').length, 2);
  restored.stop(true); await restored.start('afspraak', practiceUsage);
  assert.equal(restored.session?.mode, 'recall'); assert.equal(restored.session?.phase, 'answer');
  restored.draft(answer); await restored.request(); restored.advance('skip');
  assert.equal(getWordAttempts('afspraak').at(-1)?.outcome, 'independent');
  assert.equal(restored.session?.skippedRetry, true);
});
test('double submit creates one request; interrupted refresh waits for an explicit retry', async () => {
  let finish!: (raw: string) => void; let calls = 0;
  const p = new StructuredPractice(noop, async m => {
    calls++; return calls === 1 ? chat(m) : new Promise(resolve => { finish = resolve; });
  });
  await p.start('afspraak', practiceUsage); p.advance('continue'); p.draft(answer);
  const pending = p.request(); await p.request();
  assert.equal(calls, 2); assert.equal(activeSession()?.pending, 'feedback');
  p.stop();
  const restored = new StructuredPractice(noop, chat); restored.restore();
  assert.equal(calls, 2); assert.equal(restored.session?.rounds[0].submitted, answer);
  finish(JSON.stringify(goodFeedback())); await pending;
  assert.equal(getWordAttempts('afspraak').length, 0);
  await restored.request(); assert.equal(getWordAttempts('afspraak').length, 1);
});
test('help is retained and changing accounts while waiting cannot save another learner answer', async () => {
  let finish!: (raw: string) => void;
  const p = new StructuredPractice(noop, chat);
  await p.start('afspraak', practiceUsage); p.advance('continue'); p.hint();
  assert.equal(activeSession()?.rounds[0].hintsUsed, 1);
  const later = new StructuredPractice(noop, () => new Promise(resolve => { finish = resolve; }));
  later.restore(); later.draft(answer); const pending = later.request();
  setLearningOwner('different-account'); finish(JSON.stringify(goodFeedback())); await pending;
  assert.deepEqual(getWordAttempts('afspraak'), []); assert.equal(activeSession(), undefined);
  assert.equal(readSessions('guest').sessions[0]?.pending, 'feedback');
});
test('storage failure before submission blocks the AI call and keeps the typed answer visible', async t => {
  let calls = 0;
  const p = new StructuredPractice(noop, async m => { calls++; return chat(m); });
  await p.start('afspraak', practiceUsage); p.advance('continue');
  t.mock.method(storage, 'setItem', () => { throw new Error('quota'); });
  p.draft(answer); await p.request();
  assert.equal(calls, 1); assert.equal(p.session?.rounds[0].draft, answer); assert.ok(p.error);
});
test('saved feedback replays a failed Learning Store write exactly once after refresh', async t => {
  const p = new StructuredPractice(noop, chat);
  await p.start('afspraak', practiceUsage); p.advance('continue'); p.draft(answer);
  const original = storage.setItem;
  const mock = t.mock.method(storage, 'setItem', (key, value) => {
    if (key.startsWith('poortaal_word_learning:')) throw new Error('quota');
    original(key, value);
  });
  await p.request();
  assert.equal(activeSession()?.phase, 'feedback'); assert.ok(p.error);
  mock.mock.restore();
  const restored = new StructuredPractice(noop, chat); restored.restore(); restored.syncProgress();
  assert.equal(getWordAttempts('afspraak').length, 1); assert.equal(restored.error, '');
});
test('a stale tab cannot submit over a newer draft or hint record', async () => {
  const first = new StructuredPractice(noop, chat);
  await first.start('afspraak', practiceUsage); first.advance('continue'); first.draft(answer);
  let calls = 0;
  const second = new StructuredPractice(noop, async m => { calls++; return chat(m); }); second.restore();
  first.hint(); await second.request();
  assert.equal(calls, 0); assert.ok(second.error);
  second.refresh(); assert.equal(second.session?.rounds[0].hintsUsed, 1);
  await second.request(); assert.equal(calls, 1);
});
