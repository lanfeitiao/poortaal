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

test('classifies request failures as WordExplanationRequestError', async () => {
  const originalError = new TypeError('fetch failed');

  await assert.rejects(
    () => generateWordExplanation('gezellig', async () => {
      throw originalError;
    }),
    (error: unknown) => {
      assert.ok(error instanceof WordExplanationRequestError);
      assert.equal(error.originalError, originalError);
      return true;
    },
  );
});

test('classifies malformed JSON as InvalidWordExplanationError', async () => {
  await assert.rejects(
    () => generateWordExplanation('gezellig', async () => 'not-json'),
    (error: unknown) => {
      assert.ok(error instanceof InvalidWordExplanationError);
      assert.equal(error.message, 'AI response was not valid JSON');
      return true;
    },
  );
});

test('classifies a missing required field as InvalidWordExplanationError', async () => {
  const { tips: _tips, ...withoutTips } = validExplanation;

  await assert.rejects(
    () => generateWordExplanation(
      'gezellig',
      async () => JSON.stringify(withoutTips),
    ),
    (error: unknown) => {
      assert.ok(error instanceof InvalidWordExplanationError);
      assert.equal(error.message, 'Invalid or missing field: tips');
      return true;
    },
  );
});
