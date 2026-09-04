import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateWordExplanation,
  InvalidWordExplanationError,
  WordExplanationRequestError,
  type WordExplanation,
} from './word-explanation.ts';

const validExplanation: WordExplanation = {
  word: 'gezellig',
  type: 'bijvoeglijk naamwoord',
  meaning_nl: 'Gezellig betekent dat iets prettig en fijn aanvoelt.',
  meaning_en: 'cosy; pleasant; convivial',
  examples: [
    { nl: 'Het was gezellig op school.', en: 'It was pleasant at school.' },
    { nl: 'We maken het thuis gezellig.', en: 'We make it cosy at home.' },
  ],
  tips: 'Gezellig can describe a place, atmosphere, activity, or person.',
  fun_fact: null,
};

test('returns a validated word explanation for valid JSON', async () => {
  const result = await generateWordExplanation(
    'gezellig',
    async () => JSON.stringify(validExplanation),
  );

  assert.deepEqual(result, validExplanation);
});

test('accepts a JSON response wrapped in a markdown code fence', async () => {
  const result = await generateWordExplanation(
    'gezellig',
    async () => `\`\`\`json\n${JSON.stringify(validExplanation)}\n\`\`\``,
  );

  assert.deepEqual(result, validExplanation);
});

test('does not regenerate after a request failure', async () => {
  const originalError = new TypeError('fetch failed');
  let calls = 0;

  await assert.rejects(
    () => generateWordExplanation('gezellig', async () => {
      calls++;
      throw originalError;
    }),
    (error: unknown) => {
      assert.ok(error instanceof WordExplanationRequestError);
      assert.equal(error.originalError, originalError);
      return true;
    },
  );

  assert.equal(calls, 1);
});

test('regenerates once after malformed JSON and accepts the second response', async () => {
  let calls = 0;
  const result = await generateWordExplanation('gezellig', async () => {
    calls++;
    return calls === 1 ? 'not-json' : JSON.stringify(validExplanation);
  });

  assert.deepEqual(result, validExplanation);
  assert.equal(calls, 2);
});

test('stops after one regeneration when JSON stays malformed', async () => {
  let calls = 0;

  await assert.rejects(
    () => generateWordExplanation('gezellig', async () => {
      calls++;
      return 'not-json';
    }),
    (error: unknown) => {
      assert.ok(error instanceof InvalidWordExplanationError);
      assert.equal(error.message, 'AI response was not valid JSON');
      return true;
    },
  );

  assert.equal(calls, 2);
});

test('regenerates once when a required field is missing', async () => {
  const { tips: _tips, ...withoutTips } = validExplanation;
  let calls = 0;

  const result = await generateWordExplanation('gezellig', async () => {
    calls++;
    return calls === 1
      ? JSON.stringify(withoutTips)
      : JSON.stringify(validExplanation);
  });

  assert.deepEqual(result, validExplanation);
  assert.equal(calls, 2);
});
