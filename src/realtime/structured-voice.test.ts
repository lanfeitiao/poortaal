import assert from 'node:assert/strict';
import test from 'node:test';
import { spokenEncounter, spokenFeedback, voiceAction, voiceFlowPolicy } from './structured-voice.ts';
import { createSession } from '../structured-session.ts';
import { answer, goodFeedback, practiceUsage, scenario } from '../structured-fixtures.ts';

test('control phrases do not confuse ordinary negative roleplay answers with ending the task', () => {
  assert.equal(voiceAction('Nee, bedankt.', false), null);
  assert.equal(voiceAction('Nee, bedankt.', true), 'finish');
  assert.equal(voiceAction('Kun je me een hint geven?', false), 'hint');
  assert.equal(voiceAction('Ik wil een afspraak maken.', false), null);
  assert.equal(voiceAction('Ja graag!', false), null);
  assert.equal(voiceAction('Ja graag!', false, true), 'feedback');
  assert.equal(voiceAction('Nog een keer.', true), 'retry');
  assert.equal(voiceAction('Klaar.', true), 'finish');
});
test('a voice task has one natural opening and no unsolicited lesson or third attempt', () => {
  const s = { ...createSession('guest', 'afspraak', practiceUsage, false, false), delivery: 'voice' as const,
    phase: 'answer' as const, scenario };
  const encounter = spokenEncounter(s);
  assert.equal(encounter.setup, scenario.situation); assert.equal(encounter.openingLine, scenario.openingLine);
  assert.ok(voiceFlowPolicy(s).includes('Never create a third round'));
  assert.ok(voiceFlowPolicy(s).includes('not repeating a lesson'));
  s.rounds[0] = { draft: answer, hintsUsed: 0, feedback: goodFeedback() };
  assert.ok(spokenFeedback(s).includes('Wil je nog één variant'));
  assert.throws(() => spokenEncounter({ ...s, scenario: { ...scenario, openingLine: undefined } }));
});
