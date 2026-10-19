import assert from 'node:assert/strict';
import test from 'node:test';
import { generateWordExplanation, readSavedWordExplanation, InvalidWordExplanationError, WordExplanationRequestError, type WordExplanation } from './word-explanation.ts';
import { reviewWordUsage } from './usage-review.ts';
import { enrichWordUsage } from './usage-generation.ts';
import { renderWordExamples } from './word-card.ts';
import type { WordUsage } from './word-usage.ts';

const fragment: WordUsage = {
  chunk: 'hoewel het regent', meaning_en: 'although it rains', frame: 'Ik ga naar buiten, [hoewel het regent].',
  example_nl: 'Ik ga naar buiten, hoewel het regent.', example_en: 'I go outside, although it rains.',
  review_prompt: 'Explain going outside despite rain.',
};
const pattern: WordUsage = { ...fragment, kind: 'pattern', note: 'After hoewel, the verb goes at the end of its clause.',
  chunk: 'hoewel [onderwerp] ... [werkwoord]', frame: 'Ik ga naar buiten, hoewel het [weer] is.',
  example_nl: 'Ik ga naar buiten, hoewel het koud is.', example_en: 'I go outside, although it is cold.' };
const word: WordExplanation = { word: 'hoewel', type: 'voegwoord', meaning_nl: 'Ondanks het feit dat.', meaning_en: 'although',
  examples: [{ nl: fragment.example_nl, en: fragment.example_en }], tips: '', fun_fact: null, usage: [fragment] };

test('a fresh lookup displays the reviewed clause pattern instead of the screenshot fragment', async () => {
  let calls = 0;
  const result = await generateWordExplanation('hoewel', async messages => {
    if (++calls === 1) return JSON.stringify(word);
    const input = JSON.parse(messages[1].content);
    assert.equal(input.type, 'voegwoord');
    assert.deepEqual(input.candidates, [fragment]);
    return JSON.stringify({ usage: [pattern] });
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.usage, [pattern]);
  assert.equal(result.examples[0].nl, pattern.example_nl);
  const html = renderWordExamples(result);
  assert.ok(html.includes('Zinsbouw') && html.includes(pattern.note!));
  assert.ok(!html.includes('Vaste combinatie') && !html.includes(fragment.frame));
});

test('a rejected free phrase leaves a normal example and does not regenerate an empty result', async () => {
  let calls = 0;
  const result = await generateWordExplanation('hoewel', async () => JSON.stringify(++calls === 1 ? word : { usage: [] }));
  assert.equal(calls, 2);
  assert.deepEqual(result.usage, []);
  assert.deepEqual(result.examples, word.examples);
  assert.ok(!renderWordExamples(result).includes('example-pattern'));
  assert.equal(await enrichWordUsage(result, async () => { throw new Error('Do not retry empty results'); }), result);
});

test('review accepts a bare empty array as a legitimate rejection without retrying', async () => {
  let calls = 0;
  assert.deepEqual(await reviewWordUsage(word, async () => { calls++; return '[]'; }), []);
  assert.equal(calls, 1);
  assert.deepEqual(await reviewWordUsage({ ...word, usage: [] }, async () => { throw new Error('Unnecessary review'); }), []);
});

test('legacy fragments refresh while meanings, examples and successful empty results survive', async () => {
  const restored = readSavedWordExplanation(word)!;
  assert.equal(restored.usage, undefined);
  assert.deepEqual(restored.examples, word.examples);
  assert.deepEqual(readSavedWordExplanation({ ...word, usage: [] })?.usage, []);
  let calls = 0;
  const result = await enrichWordUsage(restored, async () => JSON.stringify({ usage: [++calls === 1 ? fragment : pattern] }));
  assert.equal(calls, 2);
  assert.deepEqual(result, { ...restored, usage: [pattern] });
  assert.deepEqual(readSavedWordExplanation(result), result);
});

test('an unavailable or malformed review never publishes the unchecked candidate', async () => {
  for (const response of ['not json', JSON.stringify({ usage: [fragment] }),
    JSON.stringify({ usage: [{ ...fragment, kind: 'collocation', note: 'A wrong justification.' }] }),
    JSON.stringify({ usage: [{ ...pattern, chunk: fragment.chunk }] })]) {
    await assert.rejects(reviewWordUsage(word, async () => response));
  }
  let calls = 0;
  await assert.rejects(generateWordExplanation('hoewel', async () => {
    if (++calls === 1) return JSON.stringify(word);
    throw new Error('Review unavailable');
  }), WordExplanationRequestError);
  assert.equal(calls, 2);
  assert.deepEqual(word.usage, [fragment]);
});

test('malformed review output retries the lookup once, including invalid usage objects', async () => {
  for (const invalid of ['not json', JSON.stringify({ usage: [fragment] })]) {
    let calls = 0;
    const result = await generateWordExplanation('hoewel', async () => {
      calls++;
      return calls % 2 ? JSON.stringify(word) : calls === 2 ? invalid : JSON.stringify({ usage: [pattern] });
    });
    assert.equal(calls, 4);
    assert.deepEqual(result.usage, [pattern]);
    calls = 0;
    await assert.rejects(generateWordExplanation('hoewel', async () => {
      calls++;
      return calls % 2 ? JSON.stringify(word) : invalid;
    }), InvalidWordExplanationError);
    assert.equal(calls, 4);
  }
});
