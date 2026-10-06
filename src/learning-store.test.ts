import assert from 'node:assert/strict';
import test from 'node:test';
import { clearWordLearning, cloudWordLearning, discardWordAttempt, getWordAttempts, recordWordAttempt, setLearningOwner } from './learning-store.ts';
import type { UsageAttempt } from './word-learning.ts';

const data = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) }, configurable: true });
Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
const attempt: UsageAttempt = { id: 'one', word: 'afspraak', chunk: 'een afspraak maken', at: 10, outcome: 'needs-practice', source: 'conversation' };
test.beforeEach(() => { data.clear(); setLearningOwner(null); });

test('anonymous learning follows the first sign-in but not a later different account', () => {
  recordWordAttempt(attempt);
  setLearningOwner('account-one');
  assert.deepEqual(getWordAttempts('afspraak'), [attempt]);
  setLearningOwner(null); setLearningOwner('account-two');
  assert.deepEqual(getWordAttempts('afspraak'), []);
  setLearningOwner('account-one');
  assert.deepEqual(getWordAttempts('afspraak'), [attempt]);
});
test('cloud merge accepts only this owner and this word', () => {
  setLearningOwner('account-one');
  assert.equal(cloudWordLearning('afspraak', { usage_progress: [attempt] }, 'account-two'), false);
  assert.deepEqual(getWordAttempts('afspraak'), []);
  cloudWordLearning('afspraak', { usage_progress: [attempt, { ...attempt, id: 'other', word: 'tijd' }] }, 'account-one');
  assert.deepEqual(getWordAttempts('afspraak'), [attempt]);
});
test('a dismissal remains a tombstone through cloud reconciliation', () => {
  setLearningOwner('account-one'); recordWordAttempt(attempt);
  discardWordAttempt('afspraak', attempt.id);
  assert.equal(cloudWordLearning('afspraak', { usage_progress: [attempt] }, 'account-one'), true);
  assert.equal(getWordAttempts('afspraak')[0].discarded, true);
});
test('deleting a word clears its attached learning evidence', () => {
  recordWordAttempt(attempt); clearWordLearning('afspraak');
  assert.deepEqual(getWordAttempts('afspraak'), []);
});
