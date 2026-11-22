import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { build } from 'vite';
import { practiceUsage } from './structured-fixtures.ts';
import { liveFixture } from './structured-live-fixture.ts';

test('Review continues with card ten and then thirteen after two cloud updates', async t => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const words = ['een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien',
    'elf', 'twaalf', 'dertien', 'veertien', 'vijftien', 'zestien', 'zeventien', 'achttien', 'negentien', 'twintig'];
  const history = words.map(word => ({ word, timestamp: 1, wordData: {
    word, type: 'telwoord', meaning_nl: word, meaning_en: 'number',
    examples: [{ nl: `Ik tel tot ${word}.`, en: 'I am counting.' }], usage: [],
  } }));
  const rows = history.map(({ word, wordData }) => ({ word, last_seen: 1, reviews: [] as number[], word_data: wordData }));
  const cloudHistory = Promise.withResolvers<{ data: { word: string; timestamp: number; word_data: object }[]; error: null }>();
  const historyRequested = Promise.withResolvers<void>();
  const delayedSave = Promise.withResolvers<void>();
  const wordRead = { eq: () => wordRead, maybeSingle: async () => ({ data: null, error: null }) };
  const signedIn = { data: { user: { id: 'learner' } } };
  let auth = Promise.resolve(signedIn);
  const location = { hash: '#review', href: 'http://localhost/poortaal/#review' };
  const supabase = { createClient: () => ({
    auth: { getUser: () => auth, onAuthStateChange: () => {} },
    from: (table: string) => table === 'user_words' ? {
      select: (columns: string) => columns === '*' ? { eq: async () => ({ data: rows, error: null }) } : wordRead,
      insert: (data: { word: string; word_data: object }) => ({ select: () => ({ maybeSingle: async () => {
        if (data.word !== 'twaalf') return { data, error: null };
        await delayedSave.promise;
        return { data: { ...data, word_data: { ...data.word_data, meaning_en: 'twelve' } }, error: null };
      } }) }),
    } : { select: () => ({ eq: () => { historyRequested.resolve(); return cloudHistory.promise; } }) },
  }) };
  const storage = new Map([
    ['poortaal_history', JSON.stringify(history)],
    ['poortaal_word_stats', JSON.stringify(Object.fromEntries(rows.map(({ word, last_seen, reviews }) =>
      [word, { lookups: 1, practices: 0, level: 0, lastSeen: last_seen, reviews }])))],
  ]);
  t.mock.method(globalThis, 'fetch', async () => Response.json([]));
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false } });
  const output = Array.isArray(result) ? result[0].output : 'output' in result ? result.output : [];
  const code = output.find(chunk => chunk.type === 'chunk');
  assert.ok(code && 'code' in code);
  const appModule = `data:text/javascript;base64,${Buffer.from(code.code).toString('base64')}`;

  async function bootReview() {
    const { document, window: dom } = parseHTML(html);
    const events = Object.assign(new EventTarget(), { location, supabase });
    for (const [key, value] of Object.entries({ document, window: events, MutationObserver: dom.MutationObserver,
      CSS: { escape: (value: string) => value },
      localStorage: { getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) } })) {
      Object.defineProperty(globalThis, key, { value, configurable: true });
    }
    await import(`${appModule}#${crypto.randomUUID()}`);
    document.dispatchEvent(new dom.Event('DOMContentLoaded'));
    return { document, events };
  }

  let { document, events } = await bootReview();
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

  click('#reviewFrontCard');
  for (const row of rows) {
    row.reviews = stats[row.word].reviews;
    row.last_seen = stats[row.word].lastSeen;
  }
  const pendingAuth = Promise.withResolvers<typeof signedIn>();
  auth = pendingAuth.promise;
  ({ document, events } = await bootReview());
  assert.ok(!document.querySelector('[data-action="start-review"]'), 'Review waits for the checkpoint owner');
  pendingAuth.resolve(signedIn);
  await new Promise(setImmediate);
  assertCard(13);
  assert.ok(document.getElementById('reviewCardAnswer')!.classList.contains('revealed'));
  gradeCards(13, 20);
  assert.ok(document.querySelector('.review-summary-stat')?.textContent?.includes('20 wist je'));
  click('[data-action="end-review"]');
  assert.ok(!storage.has('poortaal_review_session:learner'));
  await new Promise(setImmediate);
});

test('Review plays the complete example sentence and keeps the current card', async t => {
  const f = await liveFixture(t);
  const speech: Record<string, string>[] = [];
  let played = false;
  t.mock.method(globalThis, 'fetch', async url => {
    const { pathname, searchParams } = new URL(String(url));
    speech.push({ path: pathname, ...Object.fromEntries(searchParams) });
    return new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: class {
    onended?: () => void;
    async play() { played = true; this.onended?.(); }
  } });
  t.after(() => Reflect.deleteProperty(globalThis, 'Audio'));
  f.storage.set('poortaal_word_stats', JSON.stringify({ afspraak: { level: 1, lastSeen: 1, reviews: [1] } }));
  (f.events.location as { hash: string }).hash = '#review';
  f.events.dispatchEvent(new Event('hashchange'));
  await f.wait(() => Boolean(f.document.querySelector('[data-action="start-review"]')));
  f.click('[data-action="start-review"]');
  const answer = f.document.getElementById('reviewCardAnswer')!;
  assert.ok(!answer.classList.contains('revealed'));
  f.click('#reviewFrontCard');
  assert.equal(answer.querySelector('.review-example span')?.textContent, practiceUsage.example_nl);
  assert.ok(!answer.textContent?.includes('One possible answer'));

  const card = f.document.getElementById('reviewFrontCard')!;
  let captured = false;
  card.setPointerCapture = () => { captured = true; };
  const speaker = answer.querySelector<HTMLButtonElement>('.review-example button')!;
  speaker.dispatchEvent(new f.document.defaultView!.Event('pointerdown', { bubbles: true }));
  assert.equal(captured, false);
  Object.defineProperty(f.document, 'activeElement', { value: speaker });
  for (const key of ['Enter', ' ']) {
    const activate = Object.assign(new Event('keydown', { cancelable: true }), { key });
    f.events.dispatchEvent(activate);
    assert.equal(activate.defaultPrevented, false);
  }
  speaker.click();
  await f.wait(() => played);
  assert.deepEqual(speech, [{ path: '/tts', q: practiceUsage.example_nl, tl: 'nl' }]);
  assert.ok(answer.classList.contains('revealed'));
  assert.equal(f.document.getElementById('reviewFrontCard'), card);
});
