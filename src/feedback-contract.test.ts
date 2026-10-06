import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFeedback, feedbackAttempt, type PracticeSnapshot } from './feedback-contract.ts';
import { analysePractice } from './feedback-analysis.ts';

const usage = { chunk: 'een afspraak maken', meaning_en: 'make an appointment', frame: 'Ik wil een afspraak maken voor [tijd].', example_nl: 'Ik wil een afspraak maken voor donderdag.', example_en: 'I want to make an appointment for Thursday.', review_prompt: 'Arrange an appointment.' };
const sentence = 'Ik heb een afspraak gemaakt voor donderdag.';
const snapshot: PracticeSnapshot = { id: 'session', owner: 'guest', word: 'afspraak', usage, recent: [], helpUsed: false, supportUsed: false, settled: true,
  turns: [{ role: 'assistant', content: 'Kan ik je afspraak verzetten?' }, { role: 'user', content: sentence }] };
const response = { strength: 'You arranged a time clearly.', strength_quote: sentence, assessment: 'independent', evidence: sentence,
  correction: null, retry_prompt: 'Arrange an appointment for Friday.', retry_example: 'Ik wil een afspraak maken voor vrijdag.' };

test('a conjugated use is accepted without matching the literal chunk string', () => {
  const result = validateFeedback(response, snapshot);
  assert.equal(result.assessment, 'independent');
  assert.equal(feedbackAttempt(snapshot, result, 100)?.chunk, usage.chunk);
});
test('tutor sentences and invented learner quotes cannot become feedback evidence', () => {
  assert.throws(() => validateFeedback({ ...response, evidence: snapshot.turns[0].content }, snapshot));
  assert.throws(() => validateFeedback({ ...response, strength_quote: 'Ik kan op maandag.' }, snapshot));
  assert.throws(() => validateFeedback({ ...response, correction: { kind: 'error', quote: 'Ik doe een afspraak.', better: 'Ik maak een afspraak.', explanation: 'Use maken.' } }, snapshot));
});
test('hiding a previously seen hint cannot turn supported output into independence', () => {
  const result = validateFeedback(response, { ...snapshot, supportUsed: true });
  assert.equal(result.assessment, 'supported');
});
test('unstable transcript feedback cannot save a mistake or mastery claim', () => {
  const incomplete = { ...snapshot, settled: false };
  const result = validateFeedback({ ...response, correction: { kind: 'error', quote: sentence, better: 'Een andere zin.', explanation: 'A change.' } }, incomplete);
  assert.equal(result.assessment, 'uncertain');
  assert.equal(result.correction, null);
  assert.equal(feedbackAttempt(incomplete, result), null);
});
test('a naturalness suggestion does not label a valid use as an error', () => {
  const result = validateFeedback({ ...response, correction: { kind: 'naturalness', quote: sentence, better: 'Mijn afspraak staat op donderdag.', explanation: 'Another way to say it.' } }, snapshot);
  assert.equal(result.assessment, 'independent');
});
test('not-used and uncertain assessments cannot become progress evidence', () => {
  for (const assessment of ['not-used', 'uncertain']) {
    const result = validateFeedback({ ...response, assessment, evidence: '' }, snapshot);
    assert.equal(feedbackAttempt(snapshot, result), null);
  }
});
test('the analysis sends role-labelled conversation data and validates its answer', async () => {
  const result = await analysePractice(snapshot, async messages => {
    const input = JSON.parse(messages[1].content);
    assert.equal(input.word, 'afspraak');
    assert.deepEqual(input.turns, snapshot.turns);
    return JSON.stringify(response);
  });
  assert.equal(result.assessment, 'independent');
});
