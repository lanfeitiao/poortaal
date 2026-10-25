import assert from 'node:assert/strict';
import test from 'node:test';
import { spokenEncounter, spokenFeedback, voiceAction, voiceFlowPolicy, voiceControl, answerFragments } from './structured-voice.ts';
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
test('a help request after a paused answer is a control even without opposite-role captions', () => {
  const fragments = [
    { role: 'user' as const, text: 'Ik wil graag… ', startMs: 0, endMs: 500, sequence: 0 },
    { role: 'user' as const, text: 'Hint', startMs: 1800, endMs: 2200, sequence: 1 },
    { role: 'user' as const, text: ' graag.', startMs: 2200, endMs: 2500, sequence: 2 },
  ];
  assert.equal(voiceControl(fragments, false)?.action, 'hint');
  assert.equal(answerFragments(fragments).map(f => f.text).join(''), 'Ik wil graag… ');
  assert.equal(fragments.length, 3);
});
test('one caption can contain answer text followed by a control without losing the answer prefix', () => {
  const fragments = [{ role: 'user' as const, text: 'Ik wil een afspraak maken. Feedback graag.', startMs: 0, endMs: 1000, sequence: 0 }];
  assert.equal(voiceControl(fragments, false)?.action, 'feedback');
  assert.equal(answerFragments(fragments)[0].text, 'Ik wil een afspraak maken. ');
  assert.equal(fragments[0].text, 'Ik wil een afspraak maken. Feedback graag.');
  assert.equal(voiceControl([{ ...fragments[0], text: 'Ik heb een hint voor mijn vriend.' }], false), null);
});
test('feedback acceptance is scoped to the offer and cannot remove earlier roleplay affirmatives', () => {
  const fragments = [
    { role: 'tutor' as const, text: 'Wil je morgen komen?', startMs: 0, endMs: 500, sequence: 0 },
    { role: 'user' as const, text: 'Ja graag.', startMs: 600, endMs: 900, sequence: 1 },
    { role: 'tutor' as const, text: 'Wil je kort feedback?', startMs: 1000, endMs: 1500, sequence: 2 },
    { role: 'user' as const, text: 'Ja graag.', startMs: 1600, endMs: 1900, sequence: 3 },
  ];
  const answer = answerFragments(fragments, { sequence: 2, endMs: 1500 });
  assert.deepEqual(answer.filter(f => f.role === 'user').map(f => f.sequence), [1]);
  const lateCaption = { ...fragments[1], sequence: 4 };
  assert.equal(answerFragments([lateCaption], { sequence: 2, endMs: 1500 }).length, 1);
});
