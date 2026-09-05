import assert from 'node:assert/strict';
import test from 'node:test';

import { findKnownCriticalFactFailures } from './critical-fact-checks.ts';
import type { WordExplanation } from '../src/word-explanation.ts';

function explanation(tips: string): WordExplanation {
  return {
    word: 'test',
    type: 'werkwoord',
    meaning_nl: 'Testbetekenis.',
    meaning_en: 'Test meaning.',
    examples: [
      { nl: 'Dit is een test.', en: 'This is a test.' },
      { nl: 'Nog een test.', en: 'Another test.' },
    ],
    tips,
    fun_fact: null,
  };
}

test('detects the original bezighouden inseparability failure', () => {
  const output = explanation(
    "Remember that 'bezighouden' is an inseparable verb, so you won't split it.",
  );

  const findings = findKnownCriticalFactFailures('bezighouden-separability', output);

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.id, 'bezighouden-marked-inseparable');
});

test('does not confuse negated inseparable wording with the wrong claim', () => {
  const output = explanation(
    "Bezighouden is not inseparable; it is a separable verb.",
  );

  assert.deepEqual(
    findKnownCriticalFactFailures('bezighouden-separability', output),
    [],
  );
});

test('detects vervangen being incorrectly called separable', () => {
  const output = explanation("Vervangen is a separable verb.");

  const findings = findKnownCriticalFactFailures('vervangen-separability', output);

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.id, 'vervangen-marked-separable');
});

test('does not flag the correct vervangen classification', () => {
  const output = explanation("Vervangen is an inseparable verb.");

  assert.deepEqual(
    findKnownCriticalFactFailures('vervangen-separability', output),
    [],
  );
});

test('does not pretend to judge cases without deterministic rules', () => {
  const output = explanation('Gezellig has several context-dependent meanings.');

  assert.deepEqual(findKnownCriticalFactFailures('gezellig-context', output), []);
});
