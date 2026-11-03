import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateWordExplanation,
  InvalidWordExplanationError,
  WordExplanationRequestError,
  type WordExplanation,
  validateWordExplanation,
} from './word-explanation.ts';

const validExplanation: WordExplanation = {
  word: 'gezellig',
  type: 'bijvoeglijk naamwoord',
  meaning_nl: 'Gezellig betekent dat iets prettig en fijn aanvoelt.',
  meaning_en: 'cosy; pleasant; convivial',
  examples: [
    { nl: 'Het was gezellig op school.', en: 'It was pleasant at school.' },
  ],
  tips: 'Gezellig can describe a place, atmosphere, activity, or person.',
  fun_fact: null,
  usage: [],
};

test('optional tips and memory clues normalize without filler content', () => {
  const { tips, fun_fact, ...base } = validExplanation;
  for (const optional of [{}, { tips: null, fun_fact: null }, { tips: ' ', fun_fact: null }]) {
    const result = validateWordExplanation({ ...base, ...optional });
    assert.equal(result.tips, '');
    assert.equal(result.fun_fact, null);
  }
});
test('fresh lookups accept missing optional usages without retrying', async () => {
  const { usage, ...legacy } = validExplanation;
  // Older saved cards still keep the missing-usage marker for later enrichment.
  assert.equal(validateWordExplanation(legacy).usage, undefined);
  let calls = 0;
  const result = await generateWordExplanation('gezellig', async () => {
    calls++;
    return JSON.stringify(legacy);
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.usage, []);
});

test('vervoer remains usable when the AI returns malformed optional usage', async () => {
  let calls = 0;
  const result = await generateWordExplanation('vervoer', async () => {
    calls++;
    return JSON.stringify({
      ...validExplanation,
      word: 'vervoer',
      meaning_nl: 'Vervoer betekent mensen of spullen van de ene plek naar de andere brengen.',
      meaning_en: 'transport',
      examples: [{ nl: 'We gaan met het openbaar vervoer.', en: 'We are taking public transport.' }],
      usage: [{ chunk: 'openbaar vervoer' }], // invalid: missing required usage fields
    });
  });
  assert.equal(calls, 1);
  assert.equal(result.word, 'vervoer');
  assert.equal(result.meaning_en, 'transport');
  assert.deepEqual(result.usage, []);
  assert.equal(result.examples[0].nl, 'We gaan met het openbaar vervoer.');
});

test('returns a validated word explanation for valid JSON', async () => {
  const result = await generateWordExplanation(
    'gezellig',
    async () => JSON.stringify(validExplanation),
  );

  assert.deepEqual(result, validExplanation);
});
test('fresh examples use the same sentences as attached patterns', async () => {
  const use = { kind: 'collocation' as const, note: 'Use maken to describe making a place feel cosy.', chunk: 'het gezellig maken', meaning_en: 'make it cosy', frame: 'Ik maak het gezellig met [iets].', example_nl: 'Ik maak het gezellig met kaarsen.', example_en: 'I make it cosy with candles.', review_prompt: 'Describe making a room feel cosy.' };
  const result = await generateWordExplanation('gezellig', async () => JSON.stringify({ ...validExplanation, usage: [use] }));
  assert.deepEqual(result.examples[0], { nl: use.example_nl, en: use.example_en });
  assert.equal(result.examples.length, 1);
});
test('one-example words and legacy two-example words remain readable', () => {
  assert.equal(validateWordExplanation(validExplanation).examples.length, 1);
  const legacy = { ...validExplanation, examples: [validExplanation.examples[0], { nl: 'Het is gezellig.', en: 'It is pleasant.' }] };
  assert.equal(validateWordExplanation(legacy).examples.length, 2);
  for (const examples of [[], [...legacy.examples, legacy.examples[0]]]) {
    assert.throws(() => validateWordExplanation({ ...validExplanation, examples }), InvalidWordExplanationError);
  }
});
test('fresh lookups retain only one use and example even if the model pads its response', async () => {
  const use = { kind: 'collocation' as const, note: 'Use maken to describe making a place feel cosy.', chunk: 'het gezellig maken', meaning_en: 'make it cosy', frame: 'Ik maak het gezellig met [iets].', example_nl: 'Ik maak het gezellig met kaarsen.', example_en: 'I make it cosy with candles.', review_prompt: 'Describe making a room feel cosy.' };
  const result = await generateWordExplanation('gezellig', async messages => {
    assert.ok(messages[0].content.includes('ZERO or ONE'));
    assert.ok(messages[0].content.includes('ordinary free combination'));
    return JSON.stringify({ ...validExplanation, examples: [validExplanation.examples[0], validExplanation.examples[0]], usage: [use, { ...use, chunk: 'gezellig maken' }] });
  });
  assert.equal(result.examples.length, 1);
  assert.deepEqual(result.usage, [use]);
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
  const { meaning_nl: _meaning, ...withoutMeaning } = validExplanation;
  let calls = 0;

  const result = await generateWordExplanation('gezellig', async () => {
    calls++;
    return calls === 1
      ? JSON.stringify(withoutMeaning)
      : JSON.stringify(validExplanation);
  });

  assert.deepEqual(result, validExplanation);
  assert.equal(calls, 2);
});
