import assert from 'node:assert/strict';
import test from 'node:test';
import { getPracticeContext, setPracticeContext } from './practice-context.ts';
import { getWordAttempts, setLearningOwner } from './learning-store.ts';
import type { PracticeSnapshot } from './feedback-contract.ts';

const storage = new Map<string, string>();
const actions = new Map<string, () => void>();
const retryInput = { value: '', focus: () => {} };
const panel = { hidden: true, content: '', get innerHTML() { return this.content; }, set innerHTML(value: string) { this.content = value; },
  get textContent() { return this.content; }, set textContent(value: string) { this.content = value; },
  querySelector: (selector: string) => selector === '.feedback-input' ? retryInput : selector.startsWith('[data-feedback=')
    ? { addEventListener: (_: string, action: () => void) => actions.set(selector, action) } : null, append: () => {} };
Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
Object.defineProperty(globalThis, 'document', { value: { getElementById: () => panel }, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }, configurable: true });
const { finishPracticeFeedback, resetPracticeFeedback } = await import('./practice-feedback.ts');
const use = { chunk: 'een afspraak maken', meaning_en: 'make an appointment', frame: 'Ik wil een afspraak maken voor [tijd].', example_nl: 'Ik wil een afspraak maken voor donderdag.', example_en: 'I want to make an appointment for Thursday.', review_prompt: 'Arrange a time.' };
const sentence = use.example_nl;
function snapshot(id: string): PracticeSnapshot {
  return { ...getPracticeContext()!, id, owner: 'guest', supportUsed: false, settled: true, turns: [{ role: 'user', content: sentence }] };
}
function response(label: string): Response {
  return Response.json({ choices: [{ message: { content: JSON.stringify({ strength: label, strength_quote: sentence, assessment: 'independent', evidence: sentence, correction: null, retry_prompt: '', retry_example: '' }) } }] });
}
test.beforeEach(() => {
  storage.clear(); setLearningOwner(null); resetPracticeFeedback();
  actions.clear(); retryInput.value = '';
  setPracticeContext({ word: 'afspraak', usage: [use] });
});

test('retry replaces its original error and dismissal cannot revive it', { timeout: 5000 }, async t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => ++now);
  const original = 'Ik wil een afspraak doen';
  let retryFinished!: () => void;
  const done = new Promise<void>(resolve => { retryFinished = resolve; });
  const onLearning = () => {
    if (getWordAttempts('afspraak')[0]?.outcome === 'supported') retryFinished();
  };
  window.addEventListener('poortaal:word-learning', onLearning);
  t.after(() => window.removeEventListener('poortaal:word-learning', onLearning));
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => ++requests === 1
    ? Response.json({ choices: [{ message: { content: JSON.stringify({ strength: '', strength_quote: '',
      assessment: 'needs-practice', evidence: original,
      correction: { kind: 'error', quote: original, better: sentence, explanation: 'Gebruik maken.' },
      retry_prompt: 'Probeer opnieuw.', retry_example: sentence }) } }] })
    : response('Retry feedback'));
  await finishPracticeFeedback({ ...snapshot('session'), turns: [{ role: 'user', content: original }] });
  assert.equal(getWordAttempts('afspraak')[0]?.outcome, 'needs-practice');
  retryInput.value = sentence;
  actions.get('[data-feedback="send"]')!();
  await done;
  assert.deepEqual(getWordAttempts('afspraak').map(a => [a.id, a.outcome]), [['session', 'supported']]);
  actions.get('[data-feedback="discard"]')!();
  assert.equal(getWordAttempts('afspraak').length, 1);
  assert.equal(getWordAttempts('afspraak')[0]?.discarded, true);
});

test('a superseded feedback request cannot overwrite or save over the newer result', async t => {
  const pending: Array<(value: Response) => void> = [];
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => pending.push(resolve)));
  const first = finishPracticeFeedback(snapshot('first'));
  const second = finishPracticeFeedback(snapshot('second'));
  pending[1](response('Newest feedback')); await second;
  pending[0](response('Old feedback')); await first;
  assert.ok(panel.innerHTML.includes('Newest feedback'));
  assert.ok(!panel.innerHTML.includes('Old feedback'));
  assert.deepEqual(getWordAttempts('afspraak').map(a => a.id), ['second']);
});
test('leaving practice during an analysis cancels its screen and history writes', async t => {
  let finish!: (value: Response) => void;
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { finish = resolve; }));
  const request = finishPracticeFeedback(snapshot('left'));
  resetPracticeFeedback(); finish(response('Late feedback')); await request;
  assert.equal(panel.hidden, true);
  assert.deepEqual(getWordAttempts('afspraak'), []);
});
test('changing accounts during analysis cannot save the previous learner transcript', async t => {
  let finish!: (value: Response) => void;
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { finish = resolve; }));
  const request = finishPracticeFeedback(snapshot('old-owner'));
  setLearningOwner('new-owner'); finish(response('Previous owner')); await request;
  assert.equal(panel.hidden, true);
  assert.deepEqual(getWordAttempts('afspraak'), []);
});
