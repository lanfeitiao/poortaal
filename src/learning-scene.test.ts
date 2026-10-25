import assert from 'node:assert/strict';
import test from 'node:test';
import { generateLearningScene, readLearningScene } from './learning-scene.ts';
import { renderLearningScene } from './learning-scene-view.ts';
import { validateWordExplanation } from './word-explanation.ts';
import { practiceUsage, scenario } from './structured-fixtures.ts';

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
  assert.ok(html.includes(scenario.situation)); assert.ok(html.includes('Een kort gesprek'));
  assert.ok(html.includes('play-example-tts')); assert.ok(html.includes(practiceUsage.chunk));
  assert.equal(readLearningScene(scene, { ...word, meaning_en: 'a different sense' }), undefined);
  assert.equal(readLearningScene(scene, { ...word, usage: [] }), undefined);
});
test('legacy words and malformed lessons retain definitions without inventing a scenario or collocation', () => {
  const saved = validateWordExplanation({ ...word, usage: [], scene: { scenario: 'broken' } });
  assert.equal(saved.scene, undefined); assert.deepEqual(saved.examples, word.examples);
  const html = renderLearningScene(saved, 'error');
  assert.ok(html.includes('retry-learning-scene')); assert.ok(!html.includes('Vaste combinatie'));
});
test('lesson text stays escaped and an ordinary expression is not labelled as a fixed combination', () => {
  const data = { ...word, usage: [], scene: { sense: word.meaning_en, usage: 'afspraak',
    scenario: { ...scenario, situation: '<img src=x onerror=alert(1)>' } } };
  const html = renderLearningScene(data);
  assert.ok(!html.includes('<img')); assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('Vaste combinatie'));
});
