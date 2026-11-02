import assert from 'node:assert/strict';
import test from 'node:test';
import { generateLearningScene, readLearningScene, rememberSceneExposure, recentlyViewedScene } from './learning-scene.ts';
import { renderLearningScene } from './learning-scene-view.ts';
import { validateWordExplanation } from './word-explanation.ts';
import { learningMoment, lessonScenario, practiceUsage } from './structured-fixtures.ts';
import { parseHTML } from 'linkedom';

const word = { word: 'afspraak', type: 'zelfstandig naamwoord', meaning_nl: 'Een plan.', meaning_en: 'appointment',
  examples: [{ nl: practiceUsage.example_nl, en: practiceUsage.example_en }], usage: [practiceUsage], tips: '', fun_fact: null };
const lessonReply = { scenario: lessonScenario, moment: learningMoment };
const savedScene = { version: 3 as const, generatedAt: 1, sense: word.meaning_en,
  usage: practiceUsage.chunk, ...lessonReply };

test('study shows a short exchange with only a useful notice; changed-context recall stays for later review', async () => {
  const scene = await generateLearningScene(word, async messages => {
    const input = JSON.parse(messages[1].content);
    assert.equal(input.meaning, word.meaning_en);
    assert.equal(input.kind, 'learning-moment');
    assert.ok(messages[0].content.includes('REAL spoken exchange'));
    return JSON.stringify(lessonReply);
  });
  const saved = validateWordExplanation({ ...word, scene });
  assert.deepEqual(saved.scene, scene);
  const { document } = parseHTML(renderLearningScene(saved));
  const text = document.querySelector('.learning-scene')!.textContent!;
  assert.ok(text.includes(lessonScenario.situation));
  assert.ok(text.includes(lessonScenario.openingLine!));
  assert.ok(text.includes(learningMoment.translation));
  assert.ok(!text.includes(learningMoment.transfer.situation));
  assert.ok(!text.includes(learningMoment.transfer.openingLine));
  assert.ok(!text.includes(learningMoment.transfer.example));
  assert.equal(document.querySelectorAll('.learning-you .example-nl').length, 1);
  assert.equal(document.querySelectorAll('.learning-transfer').length, 0);
  assert.equal(document.querySelector('.learning-transfer-answer'), null);
  assert.equal(document.querySelector('#learning-try-answer'), null);
  assert.ok(!text.includes('Your goal:'));
  assert.ok(!text.includes('One useful line'));
  assert.ok(!text.includes('More help'));
  assert.ok(!text.includes(practiceUsage.note));
  assert.equal(document.querySelector('.learning-notice'), null);
  assert.equal(document.querySelector('[data-action="practice-word"]')!.textContent, 'Start conversation');
  assert.equal(readLearningScene(scene, { ...word, meaning_en: 'a different sense' }), undefined);
  assert.equal(readLearningScene(scene, { ...word, usage: [] }), undefined);
});
test('a genuine notice appears once, and HTML or attribute injection is escaped', () => {
  const data = { ...word, scene: { ...savedScene, scenario: { ...lessonScenario,
    situation: '<img src=x onerror=alert(1)>' }, moment: {
    ...learningMoment, notice: 'The verb splits in a main clause.',
    transfer: { ...learningMoment.transfer, situation: '<script>alert(1)</script>' } } } };
  const html = renderLearningScene(data);
  const { document } = parseHTML(html);
  assert.equal(document.querySelector('.learning-notice p')!.textContent, 'The verb splits in a main clause.');
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('&lt;script'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('Vaste combinatie'));
});
test('an unrelated study line gets one repair attempt and cannot be saved', async () => {
  let calls = 0;
  const unrelated = { ...lessonScenario, expressions: ['Mijn laptop is kapot.'] };
  const scene = await generateLearningScene(word, async () =>
    JSON.stringify({ ...lessonReply, scenario: ++calls === 1 ? unrelated : lessonScenario }));
  assert.equal(calls, 2);
  assert.deepEqual(scene.scenario, lessonScenario);
  assert.equal(readLearningScene({ ...scene, scenario: unrelated }, word), undefined);
});
test('substrings, target only in partner, or transfer answer without target do not count', async () => {
  const unrelated = { ...lessonScenario, expressions: ['De afspraakjes zijn leuk.'] };
  await assert.rejects(generateLearningScene(word, async () =>
    JSON.stringify({ ...lessonReply, scenario: unrelated })));
  await assert.rejects(generateLearningScene(word, async () =>
    JSON.stringify({ ...lessonReply, scenario: { ...lessonScenario,
      openingLine: 'Heb je al een afspraak gemaakt?' } })));
  await assert.rejects(generateLearningScene(word, async () =>
    JSON.stringify({ ...lessonReply, moment: { ...learningMoment,
      transfer: { ...learningMoment.transfer, example: 'Ik ben er morgen.' } } })));
});
test('aandoen is allowed in a natural split form, without forcing the infinitive', async () => {
  const clothing = { ...word, word: 'aandoen', meaning_en: 'put on clothing', usage: [] };
  const scene = { ...lessonScenario,
    situation: 'You are leaving home and a friend is waiting.',
    task: 'Reply while putting on your coat.',
    openingLine: 'Kom je? We moeten gaan!',
    expressions: ['Ja, ik doe nog even mijn jas aan.'],
    hints: ['Je hebt nog je jas nodig.', 'Ja, ik doe…', 'Ja, ik doe nog even mijn jas aan.'] as [string, string, string] };
  const moment = { translation: "Yes, I'll just put on my coat.", notice: 'The verb splits: ik doe ... aan.',
    transfer: { situation: 'You are still putting on your shoes.',
      openingLine: 'Mama, ben je klaar?', example: 'Ik doe nog even mijn schoenen aan.' } };
  const generated = await generateLearningScene(clothing, async () => JSON.stringify({ scenario: scene, moment }));
  assert.equal(readLearningScene(generated, clothing)?.scenario.expressions[0], scene.expressions[0]);
  assert.ok(!renderLearningScene({ ...clothing, scene: generated }).includes('Ik doe nog even mijn schoenen aan.'));
  assert.equal(readLearningScene(generated, clothing)?.moment.transfer.example, 'Ik doe nog even mijn schoenen aan.');
});
test('afmaken can appear as maak ... af in an everyday child-pickup scene', async () => {
  const finishing = { ...word, word: 'afmaken', type: 'werkwoord', meaning_en: 'to finish', usage: [] };
  const scenario = { ...lessonScenario,
    situation: 'Two children are building a house at your home, and pickup is in five minutes.',
    task: 'Let them finish the roof, then ask them to tidy up.',
    openingLine: 'Maar we zijn nog niet klaar!',
    expressions: ['Maak het dak nog even af. Daarna ruimen we samen op.'],
    hints: ['Geef ze nog even tijd voor het dak, daarna opruimen.',
      'Maak het dak…', 'Maak het dak nog even af. Daarna ruimen we samen op.'] as [string, string, string] };
  const moment = { translation: 'Finish the roof first. Then we will tidy up together.',
    notice: 'Afmaken splits in a main clause: maak ... af.',
    transfer: { situation: 'Your child wants to finish a drawing before you leave.',
      openingLine: 'Mag ik nog even tekenen?', example: 'Je mag de tekening vanavond afmaken.' } };
  const scene = await generateLearningScene(finishing, async messages => {
    assert.match(messages[0].content, /The learner is an adult in the Netherlands/);
    assert.match(messages[0].content, /whether the response actually answers the partner/);
    return JSON.stringify({ scenario, moment });
  });
  assert.equal(readLearningScene(scene, finishing)?.scenario.expressions[0], scenario.expressions[0]);
  const { document } = parseHTML(renderLearningScene({ ...finishing, scene }));
  assert.match(document.querySelector('.learning-you')!.textContent!, /Maak het dak nog even af/);
  assert.ok(document.querySelector('.learning-notice')!.textContent!.includes('maak ... af.'));
  assert.ok(!document.querySelector('.learning-scene')!.textContent!.includes(moment.transfer.example));
});

test('v2 scenes regenerate; malformed lessons retain the base word instead of inventing a scene', () => {
  assert.equal(readLearningScene({ ...savedScene, version: 2 }, word), undefined);
  const saved = validateWordExplanation({ ...word, scene: { scenario: 'broken' } });
  assert.equal(saved.scene, undefined); assert.deepEqual(saved.examples, word.examples);
  const html = renderLearningScene(saved, 'error');
  assert.ok(html.includes('retry-learning-scene')); assert.ok(!html.includes('Vaste combinatie'));
});
test('exposure remains scoped to learner and sense and expires for independent recall', () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => storage.get(k) || null, setItem: (k: string, v: string) => storage.set(k, v) } });
  const data = { ...word, scene: savedScene };
  rememberSceneExposure(data, 'one', 100);
  assert.equal(recentlyViewedScene(data, 'one', 200), true);
  assert.equal(recentlyViewedScene(data, 'two', 200), false);
  assert.equal(recentlyViewedScene(data, 'one', 100 + 30 * 60_000), false);
  assert.equal(recentlyViewedScene({ ...data, meaning_en: 'another sense' }, 'one', 200), false);
});
test('changing a scene passes the previous context and validates the newly generated lesson', async () => {
  const newScenario = { ...lessonScenario, situation: 'A school appointment has to move to Friday.' };
  const scene = await generateLearningScene(word, async messages => {
    assert.deepEqual(JSON.parse(messages[1].content).previous, ['A school appointment.']);
    return JSON.stringify({ scenario: newScenario, moment: learningMoment });
  }, ['A school appointment.']);
  assert.equal(scene.version, 3);
  assert.equal(readLearningScene(scene, word)?.scenario.situation, newScenario.situation);
  const { version: _legacy, ...old } = scene;
  assert.equal(readLearningScene(old, word), undefined);
});
