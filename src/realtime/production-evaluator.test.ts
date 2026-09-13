import assert from 'node:assert/strict';
import test from 'node:test';
import { detectsTargetProduction } from './production-evaluator.ts';

test('detects exact target word', () => {
  assert.equal(detectsTargetProduction('afspreken', 'We kunnen morgen afspreken.'), true);
});

test('detects separable past tense for tegenvallen', () => {
  assert.equal(detectsTargetProduction('tegenvallen', 'De taart viel een beetje tegen.'), true);
});

test('detects tegengevallen participle', () => {
  assert.equal(detectsTargetProduction('tegenvallen', 'Het is me tegengevallen.'), true);
});

test('does not count unrelated use of tegen', () => {
  assert.equal(detectsTargetProduction('tegenvallen', 'Ik ben tegen dat plan.'), false);
});
