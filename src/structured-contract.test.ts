import assert from 'node:assert/strict';
import test from 'node:test';
import { validateScenario, validateStructuredFeedback } from './structured-contract.ts';
import { answer, goodFeedback, scenario } from './structured-fixtures.ts';

test('scenario contract bounds teaching material and progressive hints', () => {
  assert.deepEqual(validateScenario(scenario), scenario);
  for (const bad of [{ ...scenario, expressions: [] }, { ...scenario, dialogue: ['wrong'] },
    { ...scenario, tip: ['two reminders'] }, { ...scenario, hints: ['answer'] }, { ...scenario, task: ' '.repeat(3) }]) {
    assert.throws(() => validateScenario(bad));
  }
});
test('feedback accepts one optional naturalness improvement without calling valid target usage incorrect', () => {
  const feedback = { ...goodFeedback(), naturalness: 'understandable', improvement: {
    kind: 'naturalness', quote: 'Kan ik morgen komen?', better: 'Kan ik morgen langskomen?', explanation: 'Dat klinkt ook natuurlijk.' } };
  const result = validateStructuredFeedback(feedback, answer, scenario.situation);
  assert.equal(result.target, 'correct'); assert.equal(result.improvement?.kind, 'naturalness');
});
test('feedback refuses invented evidence, multiple corrections and an unchanged retry', () => {
  const f = goodFeedback();
  for (const bad of [{ ...f, evidence: 'tutor words' }, { ...f, strength: { text: 'Good!', quote: 'imaginary' } },
    { ...f, improvement: [{ kind: 'error' }] }, { ...f, retry: { ...f.retry, situation: scenario.situation } },
    { ...f, task: 'excellent' }, { ...f, evidence: '' }]) {
    assert.throws(() => validateStructuredFeedback(bad, answer, scenario.situation));
  }
});
