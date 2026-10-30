import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { getWordAttempts, recordWordAttempt, setLearningOwner } from './learning-store.ts';
import { answer, goodFeedback, practiceUsage, scenario } from './structured-fixtures.ts';
import { activeSession } from './structured-store.ts';

const { document, window: dom } = parseHTML('<html><body><section id="structuredPractice"></section></body></html>');
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) }, configurable: true });
const { connectStructuredPractice, structuredPractice: p } = await import('./structured-ui.ts');
let finished = 0; connectStructuredPractice(() => { finished++; });
const panel = document.getElementById('structuredPractice')!;
function click(action: string) { panel.querySelector<HTMLElement>(`[data-structured="${action}"]`)!.click(); }
function type(value: string) {
  const input = document.getElementById('structuredAnswer') as HTMLTextAreaElement;
  input.value = value; input.dispatchEvent(new dom.Event('input', { bubbles: true })); return input;
}
async function settled() { for (let i = 0; p.busy && i < 30; i++) await new Promise(setImmediate); assert.equal(p.busy, false); }
test.beforeEach(t => {
  storage.clear(); setLearningOwner(null); p.stop(); finished = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const input = JSON.parse(JSON.parse(init!.body as string).messages[1].content);
    const content = JSON.stringify(input.answer ? goodFeedback(input.situation, input.answer) : scenario);
    return Response.json({ choices: [{ message: { content } }] });
  });
});
test('real DOM buttons move from teaching to answer feedback one retry and completion', async () => {
  await p.start('afspraak', practiceUsage);
  assert.ok(panel.textContent!.includes('One useful line'));
  assert.ok(!panel.textContent!.includes(scenario.expressions[1]));
  assert.equal(panel.querySelector('.structured-dialogue'), null);
  click('continue'); assert.ok(!panel.textContent!.includes(scenario.expressions[0]));
  type(answer); click('request'); click('request'); await settled();
  assert.equal(panel.querySelectorAll('dl dt').length, 3);
  assert.ok(panel.textContent!.includes('Used with help'));
  click('retry'); assert.ok(panel.textContent!.includes('What changed?'));
  assert.equal(panel.querySelector('[data-structured="skip"]'), null);
  type(answer.replace('morgen', 'vrijdag')); click('request'); await settled();
  click('finish'); assert.ok(panel.textContent!.includes('Practice complete'));
  click('done'); assert.equal(finished, 1); assert.equal(getWordAttempts('afspraak').length, 2);
});
test('recall hides references, reveals hints in order, and keeps typing in the same textarea', async () => {
  recordWordAttempt({ id: 'prior', word: 'afspraak', chunk: practiceUsage.chunk, at: 1, source: 'conversation', outcome: 'supported' });
  await p.start('afspraak', practiceUsage);
  assert.ok(!panel.textContent!.includes(scenario.expressions[0]));
  const input = type(answer + ' ');
  assert.equal(document.getElementById('structuredAnswer'), input);
  assert.equal(activeSession()?.rounds[0].draft, answer + ' ');
  click('hint'); assert.ok(panel.textContent!.includes(scenario.hints[0]));
  assert.ok(!panel.textContent!.includes(scenario.hints[1]));
  click('request'); await settled(); click('skip');
  assert.equal(getWordAttempts('afspraak').at(-1)?.outcome, 'supported');
  assert.equal(p.session?.phase, 'complete');
});
