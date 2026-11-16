import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { build } from 'vite';

test('Review continues with card ten and then thirteen after two cloud updates', async t => {
  const { document, window: dom } = parseHTML(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  const words = ['een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien',
    'elf', 'twaalf', 'dertien', 'veertien', 'vijftien', 'zestien', 'zeventien', 'achttien', 'negentien', 'twintig'];
  const history = words.map(word => ({ word, timestamp: 1, wordData: {
    word, type: 'telwoord', meaning_nl: word, meaning_en: 'number',
    examples: [{ nl: `Ik tel tot ${word}.`, en: 'I am counting.' }], usage: [],
  } }));
  const rows = history.map(({ word, wordData }) => ({ word, last_seen: 1, reviews: [], word_data: wordData }));
  const cloudHistory = Promise.withResolvers<{ data: { word: string; timestamp: number; word_data: object }[]; error: null }>();
  const historyRequested = Promise.withResolvers<void>();
  const delayedSave = Promise.withResolvers<void>();
  const wordRead = { eq: () => wordRead, maybeSingle: async () => ({ data: null, error: null }) };
  const events = new EventTarget();
  const location = { hash: '#review', href: 'http://localhost/poortaal/#review' };
  Object.assign(events, { location, supabase: { createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'learner' } } }), onAuthStateChange: () => {} },
    from: (table: string) => table === 'user_words' ? {
      select: (columns: string) => columns === '*' ? { eq: async () => ({ data: rows, error: null }) } : wordRead,
      insert: (data: { word: string; word_data: object }) => ({ select: () => ({ maybeSingle: async () => {
        if (data.word !== 'twaalf') return { data, error: null };
        await delayedSave.promise;
        return { data: { ...data, word_data: { ...data.word_data, meaning_en: 'twelve' } }, error: null };
      } }) }),
    } : { select: () => ({ eq: () => { historyRequested.resolve(); return cloudHistory.promise; } }) },
  }) } });
  const storage = new Map([
    ['poortaal_history', JSON.stringify(history)],
    ['poortaal_word_stats', JSON.stringify(Object.fromEntries(rows.map(({ word, last_seen, reviews }) =>
      [word, { lookups: 1, practices: 0, level: 0, lastSeen: last_seen, reviews }])))],
  ]);
  for (const [key, value] of Object.entries({ document, window: events, MutationObserver: dom.MutationObserver,
    CSS: { escape: (value: string) => value },
    localStorage: { getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) } })) {
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json([]));
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false } });
  const output = Array.isArray(result) ? result[0].output : 'output' in result ? result.output : [];
  const code = output.find(chunk => chunk.type === 'chunk');
  assert.ok(code && 'code' in code);
  await import(`data:text/javascript;base64,${Buffer.from(code.code).toString('base64')}`);
  document.dispatchEvent(new dom.Event('DOMContentLoaded'));
  await historyRequested.promise;

  const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
  const assertCard = (card: number) => {
    assert.equal(document.getElementById('reviewHomeSection')!.style.display, 'none');
    assert.equal(document.getElementById('reviewSessionSection')!.style.display, '');
    assert.equal(document.querySelector('.review-progress-text')?.textContent, `${card} / 20`);
    assert.equal(document.querySelector('.review-card-word')?.textContent, words[card - 1]);
  };
  const gradeCards = (first: number, last: number) => {
    for (let card = first; card <= last; card++) {
      assertCard(card);
      click('#reviewFrontCard');
      click('#reviewBtnKnow');
    }
  };
  click('[data-action="start-review"]');
  gradeCards(1, 9);
  assertCard(10);
  // Let the writes finish before releasing a download that predates those grades.
  await new Promise(setImmediate);
  cloudHistory.resolve({ data: history.map(({ word, timestamp, wordData }) => ({ word, timestamp, word_data: wordData })), error: null });
  await new Promise(setImmediate);
  assert.ok(!document.getElementById('syncIndicator')!.classList.contains('syncing'));
  assertCard(10);

  gradeCards(10, 12);
  assertCard(13);
  delayedSave.resolve();
  await new Promise(setImmediate);
  assert.equal(JSON.parse(storage.get('poortaal_word_cache_v4')!).twaalf.meaning_en, 'twelve');
  assertCard(13);
  const stats = JSON.parse(storage.get('poortaal_word_stats')!);
  assert.ok(words.slice(0, 12).every(word => stats[word].reviews.length === 1));

  location.hash = '#home'; events.dispatchEvent(new Event('hashchange'));
  location.hash = '#review'; events.dispatchEvent(new Event('hashchange'));
  assertCard(13);
});
