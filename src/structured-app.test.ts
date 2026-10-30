import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'vite';
import { parseHTML } from 'linkedom';
import { answer, goodFeedback, practiceUsage, scenario } from './structured-fixtures.ts';

test('bundled application boots with the real DOM and preserves word stats across text and voice navigation', async t => {
  const { document, window: dom } = parseHTML(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  const events = new EventTarget() as EventTarget & Record<string, unknown>;
  events.location = { hash: '#practice', href: 'http://localhost/poortaal/#practice' };
  events.supabase = { createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => {} } }) };
  const word = { word: 'afspraak', type: 'zelfstandig naamwoord', meaning_nl: 'Een plan om iemand te zien.', meaning_en: 'appointment',
    examples: [{ nl: practiceUsage.example_nl, en: practiceUsage.example_en }], tips: '', fun_fact: null, usage: [practiceUsage] };
  const storage = new Map<string, string>([
    ['poortaal_word_cache_v4', JSON.stringify({ afspraak: word })],
    ['poortaal_history', JSON.stringify([{ word: 'afspraak', timestamp: 1, wordData: word }])],
  ]);
  for (const [key, value] of Object.entries({ document, window: events, MutationObserver: dom.MutationObserver,
    CSS: { escape: (v: string) => v }, localStorage: { getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) } })) {
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url === 'words.json') return Response.json([]);
    assert.ok(String(url).endsWith('/openai'));
    const input = JSON.parse(JSON.parse(init!.body as string).messages[1].content);
    return Response.json({ choices: [{ message: { content: JSON.stringify(input.answer ? goodFeedback(input.situation, input.answer) : scenario) } }] });
  });
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false } });
  const output = Array.isArray(result) ? result[0].output : 'output' in result ? result.output : [];
  const code = output.find(chunk => chunk.type === 'chunk'); assert.ok(code && 'code' in code);
  await import(`data:text/javascript;base64,${Buffer.from(code.code).toString('base64')}`);
  document.dispatchEvent(new dom.Event('DOMContentLoaded'));
  const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
  const wait = async (check: () => boolean) => {
    for (let n = 0; !check() && n < 50; n++) await new Promise(setImmediate);
    assert.ok(check());
  };
  const panel = document.getElementById('structuredPractice')!;
  const spoken = document.getElementById('voicePracticeSteps')!;
  click('[data-action="start-practice-word"]');
  assert.equal((document.getElementById('voiceModeBtn') as HTMLButtonElement).disabled, true);
  await wait(() => spoken.textContent!.includes(scenario.situation));
  assert.equal(document.getElementById('voicePracticePanel')!.style.display, '');
  assert.ok(!spoken.textContent!.includes(scenario.expressions[0]));
  assert.equal((document.getElementById('voiceModeBtn') as HTMLButtonElement).disabled, false);
  click('#textModeBtn'); await wait(() => panel.textContent!.includes('One useful line'));
  click('[data-structured="continue"]');
  const input = document.getElementById('structuredAnswer') as HTMLTextAreaElement;
  input.value = answer; input.dispatchEvent(new dom.Event('input', { bubbles: true }));
  click('[data-structured="request"]'); await wait(() => !!panel.querySelector('[data-structured="skip"]'));
  click('[data-structured="skip"]'); click('[data-structured="done"]');
  assert.equal(document.getElementById('practiceChatSection')!.style.display, 'none');
  assert.equal(JSON.parse(storage.get('poortaal_word_stats')!).afspraak.practices, 1);
  click('[data-action="start-practice-word"]');
  assert.equal((document.getElementById('voiceModeBtn') as HTMLButtonElement).disabled, true);
  await wait(() => spoken.textContent!.includes(scenario.situation));
  click('#textModeBtn'); await wait(() => !!document.getElementById('structuredAnswer'));
  assert.ok(!panel.textContent!.includes(scenario.expressions[0]));
  click('#voiceModeBtn'); assert.equal(document.getElementById('voicePracticePanel')!.style.display, '');
  click('#textModeBtn'); assert.equal(document.getElementById('voicePracticePanel')!.style.display, 'none');
  click('#practiceBackBtn'); assert.equal(JSON.parse(storage.get('poortaal_word_stats')!).afspraak.practices, 1);
  assert.equal(JSON.parse(storage.get('poortaal_word_learning:guest')!).afspraak.length, 1);
});
