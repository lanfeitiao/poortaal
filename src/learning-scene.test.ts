import assert from 'node:assert/strict';
import test from 'node:test';
import { generateLearningScene, readLearningScene, rememberSceneExposure, recentlyViewedScene } from './learning-scene.ts';
import { renderLearningScene } from './learning-scene-view.ts';
import { validateWordExplanation } from './word-explanation.ts';
import { practiceUsage, scenario } from './structured-fixtures.ts';
import { parseHTML } from 'linkedom';

const word = { word: 'afspraak', type: 'zelfstandig naamwoord', meaning_nl: 'Een plan.', meaning_en: 'appointment',
  examples: [{ nl: practiceUsage.example_nl, en: practiceUsage.example_en }], usage: [practiceUsage], tips: '', fun_fact: null };
test('a lesson ties one sense and verified use to a situation, spoken expressions and dialogue', async () => {
  const scene = await generateLearningScene(word, async messages => {
    assert.equal(JSON.parse(messages[1].content).meaning, word.meaning_en);
    return JSON.stringify(scenario);
  });
  const saved = validateWordExplanation({ ...word, scene });
  assert.deepEqual(saved.scene, scene);
  const html = renderLearningScene(saved);
  const { document } = parseHTML(html);
  assert.ok(html.includes(scenario.situation)); assert.ok(html.includes(scenario.task));
  assert.equal(document.querySelectorAll('.learning-scene > .example-nl').length, 1);
  assert.equal(document.querySelectorAll('details[open]').length, 0);
  assert.ok(document.querySelector('details')!.textContent!.includes(scenario.expressions[1]));
  assert.equal(document.querySelector('.structured-dialogue'), null);
  assert.equal(document.querySelector('[data-action="practice-word"]')!.textContent, 'Start conversation');
  assert.equal(readLearningScene(scene, { ...word, meaning_en: 'a different sense' }), undefined);
  assert.equal(readLearningScene(scene, { ...word, usage: [] }), undefined);
});
test('scene-only expressions are repaired before a lesson is displayed', async () => {
  let calls = 0;
  const unrelated = { ...scenario, expressions: ['Mijn laptop is kapot.', 'Kun je mij helpen?'] };
  const scene = await generateLearningScene(word, async messages => {
    assert.ok(messages[0].content.includes('EVERY expression'));
    return JSON.stringify(++calls === 1 ? unrelated : scenario);
  });
  assert.equal(calls, 2); assert.deepEqual(scene.scenario, scenario);
  assert.equal(readLearningScene({ ...scene, scenario: unrelated }, word), undefined);
});
test('a target substring or target only in the dialogue cannot validate unrelated examples', async () => {
  const invalid = { ...scenario, expressions: ['De afspraakjes zijn leuk.', 'Mijn laptop werkt weer.'] };
  await assert.rejects(generateLearningScene(word, async () => JSON.stringify(invalid)));
  await assert.rejects(generateLearningScene(word, async () => JSON.stringify({ ...scenario,
    dialogue: [{ speaker: 'Jij', line: 'Hallo.' }, { speaker: 'Ander', line: 'Dag.' }] })));
});
test('legacy words and malformed lessons retain definitions without inventing a scenario or collocation', () => {
  const saved = validateWordExplanation({ ...word, usage: [], scene: { scenario: 'broken' } });
  assert.equal(saved.scene, undefined); assert.deepEqual(saved.examples, word.examples);
  const html = renderLearningScene(saved, 'error');
  assert.ok(html.includes('retry-learning-scene')); assert.ok(!html.includes('Vaste combinatie'));
});
test('lesson text stays escaped and an ordinary expression is not labelled as a fixed combination', () => {
  const data = { ...word, usage: [], scene: { version: 2 as const, sense: word.meaning_en, usage: 'afspraak',
    scenario: { ...scenario, situation: '<img src=x onerror=alert(1)>' } } };
  const html = renderLearningScene(data);
  assert.ok(!html.includes('<img')); assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('Vaste combinatie'));
});
test('recent example exposure follows this owner and sense but expires for later independent recall', () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => storage.get(k) || null, setItem: (k: string, v: string) => storage.set(k, v) } });
  const data = { ...word, scene: { version: 2 as const, sense: word.meaning_en, usage: practiceUsage.chunk, scenario } };
  rememberSceneExposure(data, 'one', 100);
  assert.equal(recentlyViewedScene(data, 'one', 200), true);
  assert.equal(recentlyViewedScene(data, 'two', 200), false);
  assert.equal(recentlyViewedScene(data, 'one', 100 + 30 * 60_000), false);
  assert.equal(recentlyViewedScene({ ...data, meaning_en: 'another sense' }, 'one', 200), false);
});
test('old lessons are regenerated and compact lessons retain the previous situation when changing scenes', async () => {
  const compact = { ...scenario, expressions: scenario.expressions.slice(0, 1), dialogue: [] };
  const scene = await generateLearningScene(word, async messages => {
    assert.deepEqual(JSON.parse(messages[1].content).previous, ['A school appointment.']);
    return JSON.stringify(compact);
  }, ['A school appointment.']);
  assert.equal(scene.version, 2);
  assert.deepEqual(readLearningScene(scene, word)?.scenario, compact);
  const { version: _legacy, ...old } = scene;
  assert.equal(readLearningScene(old, word), undefined);
  assert.deepEqual(validateWordExplanation({ ...word, scene: old }).examples, word.examples);
});
