import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceSession, createSession, practiceOutcome, structuredAttempts } from './structured-session.ts';
import { restoreSession } from './structured-restore.ts';
import { answer, goodFeedback, practiceUsage, scenario } from './structured-fixtures.ts';

function assessed(guided: boolean) {
  return { ...createSession('guest', 'afspraak', practiceUsage, guided, false), scenario, phase: 'feedback' as const,
    rounds: [{ draft: answer, submitted: answer, submittedAt: 10, hintsUsed: 0, feedback: goodFeedback() }] };
}
test('guided success is supported while a fresh unassisted recall can be independent', () => {
  assert.equal(practiceOutcome(assessed(true)), 'supported');
  const recall = assessed(false); assert.equal(practiceOutcome(recall), 'independent');
  recall.rounds[0].hintsUsed = 1; assert.equal(practiceOutcome(recall), 'supported');
  recall.rounds[0].feedback.target = 'not-used'; assert.equal(practiceOutcome(recall), 'needs-practice');
});
test('one retry is supported, restores with its feedback, and cannot lead to a third attempt', () => {
  let s = advanceSession(assessed(false), 'retry');
  const situation = s.rounds[0]!.feedback!.retry.situation;
  s = { ...s, phase: 'feedback', rounds: [s.rounds[0]!, { draft: answer, hintsUsed: 0,
    submitted: answer, submittedAt: 20, feedback: goodFeedback(situation) }] };
  assert.equal(practiceOutcome(s), 'supported');
  assert.deepEqual(restoreSession(s, 'guest'), s);
  assert.throws(() => advanceSession(s, 'retry'));
  s = advanceSession(s, 'finish');
  assert.equal(s.phase, 'complete'); assert.equal(structuredAttempts(s).length, 2);
});
test('restoration rejects another owner, malformed state, and feedback without learner evidence', () => {
  const s = assessed(true);
  for (const bad of [{ ...s, owner: 'other' }, { ...s, round: 1 }, { ...s, phase: 'answer' },
    { ...s, rounds: [{ draft: '', hintsUsed: 5 }] }]) assert.throws(() => restoreSession(bad, 'guest'));
});
