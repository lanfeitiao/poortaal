import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseWordUsage, mergeAttempts, needsUsageReview, wordReview, type UsageAttempt } from './word-learning.ts';
import type { WordExplanation } from './word-explanation.ts';

const make = { chunk: 'een afspraak maken', meaning_en: 'make an appointment', frame: 'Ik wil een afspraak maken voor [tijd].', example_nl: 'Ik wil een afspraak maken voor donderdag.', example_en: 'I want to make an appointment for Thursday.', review_prompt: 'Arrange a time for an appointment.' };
const move = { ...make, chunk: 'een afspraak verzetten', meaning_en: 'reschedule an appointment', frame: 'Kan ik mijn afspraak verzetten naar [tijd]?', example_nl: 'Kan ik mijn afspraak verzetten naar donderdag?', review_prompt: 'Move your Wednesday appointment to Thursday.' };
const word: WordExplanation = { word: 'afspraak', type: 'zelfstandig naamwoord', meaning_nl: 'Een afgesproken tijd.', meaning_en: 'appointment', examples: [{ nl: 'Ik heb een afspraak.', en: 'I have an appointment.' }, { nl: 'Mijn afspraak is morgen.', en: 'My appointment is tomorrow.' }], tips: 'Use maken.', fun_fact: null, usage: [make, move] };
const attempt = (id: string, chunk: string, outcome: UsageAttempt['outcome'], at: number, source: UsageAttempt['source'] = 'conversation'): UsageAttempt => ({ id, word: word.word, chunk, outcome, at, source });

test('words without attached uses keep their original meaning review', () => {
  assert.equal(wordReview({ ...word, usage: undefined }, 2, 4, []).kind, 'meaning');
  assert.equal(wordReview(word, 0, 0, []).kind, 'meaning');
});
test('familiar words move from collocation recall to a situation without separate entries', () => {
  assert.equal(wordReview(word, 1, 1, []).kind, 'chunk');
  const review = wordReview(word, 2, 2, []);
  assert.equal(review.kind, 'output');
  assert.equal(review.usage?.chunk, make.chunk);
  assert.equal(review.prompt, make.review_prompt);
});
test('a weak use takes priority over a use already produced independently', () => {
  const history = [attempt('one', make.chunk, 'independent', 10), attempt('two', move.chunk, 'needs-practice', 20)];
  assert.equal(chooseWordUsage(word, history)?.chunk, move.chunk);
  assert.equal(wordReview(word, 0, 0, history).prompt, move.review_prompt);
});
test('self-graded review is not evidence of independent production', () => {
  const history = [attempt('one', move.chunk, 'needs-practice', 10), attempt('review', move.chunk, 'self-reviewed', 20, 'review')];
  assert.equal(chooseWordUsage(word, history)?.chunk, move.chunk);
  assert.equal(needsUsageReview(word, history, 21), false);
  assert.equal(needsUsageReview(word, history, 20 + 86400000), true);
});
test('a later independent use clears the old problem and lets another use be practised', () => {
  const history = [attempt('one', move.chunk, 'needs-practice', 10), attempt('two', move.chunk, 'independent', 30)];
  assert.equal(chooseWordUsage(word, history)?.chunk, make.chunk);
  assert.equal(needsUsageReview(word, history, 40), false);
});
test('retrying feedback cannot count the same session as multiple mistakes', () => {
  const first = attempt('session', move.chunk, 'needs-practice', 10);
  const second = attempt('session', move.chunk, 'supported', 20);
  assert.deepEqual(mergeAttempts([first], [second]), [second]);
});
test('dismissed recognition errors stay dismissed when old cloud data returns', () => {
  const record = attempt('session', move.chunk, 'needs-practice', 10);
  const dismissed = { ...record, discarded: true };
  const merged = mergeAttempts([dismissed], [{ ...record, at: 20 }]);
  assert.equal(merged[0].discarded, true);
  assert.equal(needsUsageReview(word, merged), false);
});
test('usage evidence from another word cannot influence this word', () => {
  const history = [{ ...attempt('other', make.chunk, 'needs-practice', 10), word: 'tijd' }];
  assert.equal(needsUsageReview(word, history), false);
});
