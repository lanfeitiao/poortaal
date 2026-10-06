import assert from 'node:assert/strict';
import test from 'node:test';
import { clearPracticeContext, getPracticeContext, markPracticeHelp, practiceUsageInstructions, setPracticeContext } from './practice-context.ts';
import { recordWordAttempt } from './learning-store.ts';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value) }, configurable: true });
Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
const use = { chunk: 'een afspraak maken', meaning_en: 'make an appointment', frame: 'Ik wil een afspraak maken voor [tijd].', example_nl: 'Ik wil een afspraak maken.', example_en: 'I want an appointment.', review_prompt: 'Arrange an appointment.' };
test.beforeEach(() => { storage.clear(); clearPracticeContext(); });

test('dismissed feedback is excluded from instructions for the next conversation', () => {
  recordWordAttempt({ id: 'bad', at: 1, word: 'afspraak', chunk: use.chunk, source: 'conversation', outcome: 'needs-practice', discarded: true, explanation: 'Dismissed criticism' });
  setPracticeContext({ word: 'afspraak', usage: [use] });
  assert.ok(!practiceUsageInstructions().includes('Dismissed criticism'));
  assert.equal(getPracticeContext()?.usage, use);
});
test('showing help persists for the whole context and choosing a visible usage counts as help', () => {
  setPracticeContext({ word: 'afspraak', usage: [use] });
  assert.equal(getPracticeContext()?.helpUsed, false);
  markPracticeHelp();
  assert.equal(getPracticeContext()?.helpUsed, true);
  setPracticeContext({ word: 'afspraak', usage: [use] }, 0, 0);
  assert.equal(getPracticeContext()?.helpUsed, true);
});
