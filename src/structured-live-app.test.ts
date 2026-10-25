import assert from 'node:assert/strict';
import test from 'node:test';
import { liveFixture } from './structured-live-fixture.ts';
import { answer, goodFeedback, scenario } from './structured-fixtures.ts';
import { advanceSession } from './structured-session.ts';
import { saveSession, sessionStorageKey } from './structured-store.ts';

test('spoken hints feedback and the one retry run in one live connection and persist separately', async t => {
  const f = await liveFixture(t);
  f.click('[data-action="start-practice-word"]');
  await f.wait(() => f.session()?.phase === 'answer');
  f.click('#voiceStartBtn');
  await f.wait(() => f.sent.some(e => e.event_id === 'encounter-opening'));
  f.caption('tutor', scenario.openingLine!); f.caption('user', 'Hint graag.');
  await f.wait(() => f.session()?.rounds[0].hintsUsed === 1);
  assert.ok(f.sent.some(e => String(e.content).includes(scenario.hints[0])));
  f.caption('tutor', scenario.hints[0]); f.caption('user', answer);
  f.caption('tutor', 'Wil je kort feedback?'); f.caption('user', 'Ja graag.');
  await f.wait(() => f.session()?.phase === 'feedback');
  assert.equal(f.attempts().length, 1); assert.equal(f.attempts()[0].outcome, 'supported');
  assert.equal(f.track.enabled, true);
  assert.ok(f.sent.some(e => String(e.content).includes('Wil je nog één variant')));
  f.caption('tutor', 'Wil je nog één variant proberen?'); f.caption('user', 'Nog een keer.');
  await f.wait(() => f.session()?.round === 1);
  f.caption('tutor', 'Morgen kan niet. Wanneer kun je wel?'); f.caption('user', answer.replace('morgen', 'vrijdag'));
  f.click('#voiceStartBtn'); f.click('#voiceStartBtn');
  await f.wait(() => f.session()?.phase === 'feedback');
  assert.equal(f.attempts().length, 2); assert.equal(f.attempts()[1].outcome, 'supported');
  assert.equal(f.sent.filter(e => e.event_id === 'encounter-opening').length, 1);
  f.click('[data-voice="finish"]');
  assert.equal(f.session()?.phase, 'complete');
  assert.equal(f.document.querySelector('[data-voice="retry"]'), null);
});

test('the study page presents a scene and passes its exposure into the spoken task', async t => {
  const f = await liveFixture(t);
  const input = f.document.getElementById('wordInput') as HTMLInputElement;
  input.value = 'afspraak'; f.click('#searchBtn');
  assert.ok(f.document.getElementById('content')!.textContent!.includes(scenario.situation));
  assert.ok(f.document.getElementById('content')!.textContent!.includes('Een kort gesprek'));
  f.click('[data-action="practice-word"]');
  await f.wait(() => f.session()?.delivery === 'voice' && f.session()?.phase === 'answer');
  assert.equal(f.session()?.supportUsed, true);
  assert.equal(f.session()?.studiedScenario.situation, scenario.situation);
  assert.equal(f.document.getElementById('voicePracticePanel')!.style.display, '');
});
test('switching from guided text examples into speech keeps the assistance provenance', async t => {
  const f = await liveFixture(t);
  f.click('[data-action="start-practice-word"]'); await f.wait(() => f.session()?.phase === 'answer');
  f.click('#textModeBtn'); await f.wait(() => f.session()?.phase === 'guide');
  f.click('#voiceModeBtn'); await f.wait(() => f.session()?.delivery === 'voice');
  assert.equal(f.session()?.supportUsed, true);
});
test('cancel during microphone setup neither releases the opening guard early nor records success', async t => {
  const f = await liveFixture(t);
  f.click('[data-action="start-practice-word"]'); await f.wait(() => f.session()?.phase === 'answer');
  f.click('#voiceStartBtn'); f.click('#voiceStartBtn');
  await new Promise(setImmediate);
  assert.equal(f.attempts().length, 0);
  assert.equal(f.session()?.phase, 'answer');
  assert.equal(f.sent.filter(e => e.event_id === 'encounter-opening').length, 0);
});
test('continuing after reconnect retains the old answer and adds only the new connection speech', async t => {
  const f = await liveFixture(t);
  f.click('[data-action="start-practice-word"]'); await f.wait(() => f.session()?.phase === 'answer');
  f.click('#voiceStartBtn'); await f.wait(() => f.sent.some(e => e.event_id === 'encounter-opening'));
  f.caption('user', answer); await f.wait(() => f.session()?.rounds[0].draft === answer);
  const id = f.session().id;
  f.click('#practiceBackBtn'); f.click('[data-action="start-practice-word"]');
  await f.wait(() => f.session()?.id === id); f.click('#voiceStartBtn');
  await f.wait(() => f.sent.filter(e => e.event_id === 'encounter-opening').length === 2);
  f.caption('user', 'Dat komt goed.');
  await f.wait(() => f.session()?.rounds[0].draft.includes('Dat komt goed.'));
  assert.ok(f.session().rounds[0].draft.includes(answer));
  assert.equal(f.session().rounds[0].turns.filter(t => t.role === 'user' && t.content === answer).length, 1);
});
test('asking for a hint while stuck mid-answer works without a tutor caption between the utterances', async t => {
  const f = await liveFixture(t);
  f.click('[data-action="start-practice-word"]'); await f.wait(() => f.session()?.phase === 'answer');
  f.click('#voiceStartBtn'); await f.wait(() => f.sent.some(e => e.event_id === 'encounter-opening'));
  f.caption('user', 'Ik wil graag… '); f.caption('user', 'Hint graag.');
  await f.wait(() => f.session()?.rounds[0].hintsUsed === 1);
  assert.ok(f.session().rounds[0].draft.includes('Ik wil graag'));
  assert.ok(!f.session().rounds[0].draft.includes('Hint'));
});
test('leaving immediately after a displayed caption flushes that answer as unsettled', async t => {
  const f = await liveFixture(t);
  f.click('[data-action="start-practice-word"]'); await f.wait(() => f.session()?.phase === 'answer');
  const id = f.session().id;
  f.click('#voiceStartBtn'); await f.wait(() => f.sent.some(e => e.event_id === 'encounter-opening'));
  f.caption('user', answer); f.click('#practiceBackBtn');
  f.click('[data-action="start-practice-word"]'); await f.wait(() => f.session()?.id === id);
  assert.equal(f.session().rounds[0].draft, answer);
  assert.equal(f.session().rounds[0].voiceSettled, false);
  assert.equal(f.attempts().length, 0);
});
test('roleplay acceptance remains in the answer after a later feedback confirmation', async t => {
  const f = await liveFixture(t);
  f.click('[data-action="start-practice-word"]'); await f.wait(() => f.session()?.phase === 'answer');
  f.click('#voiceStartBtn'); await f.wait(() => f.sent.some(e => e.event_id === 'encounter-opening'));
  f.caption('tutor', 'Wil je morgen komen?'); f.caption('user', 'Ja graag.');
  f.caption('tutor', 'Wat wil je afspreken?'); f.caption('user', answer);
  f.caption('tutor', 'Wil je kort feedback?'); f.caption('user', 'Ja graag.');
  await f.wait(() => f.session()?.phase === 'feedback');
  assert.equal(f.session().rounds[0].submitted, 'Ja graag.\n' + answer);
});
test('an unexpected server close saves received speech and allows immediate reconnection', async t => {
  const f = await liveFixture(t);
  f.click('[data-action="start-practice-word"]'); await f.wait(() => f.session()?.phase === 'answer');
  f.click('#voiceStartBtn'); await f.wait(() => f.sent.some(e => e.event_id === 'encounter-opening'));
  f.caption('user', answer); f.closeConnection();
  assert.equal(f.session().rounds[0].draft, answer);
  f.click('#voiceStartBtn'); await f.wait(() => f.sent.filter(e => e.event_id === 'encounter-opening').length === 2);
  assert.equal(f.attempts().length, 0);
});
test('another tab starting a retry disconnects old speech before it can enter the new round', async t => {
  const f = await liveFixture(t);
  f.click('[data-action="start-practice-word"]'); await f.wait(() => f.session()?.phase === 'answer');
  f.click('#voiceStartBtn'); await f.wait(() => f.sent.some(e => e.event_id === 'encounter-opening'));
  f.caption('user', answer); await f.wait(() => f.session()?.rounds[0].draft === answer);
  // A pending caption must also be discarded when the other tab owns the new state.
  f.caption('user', 'Oude woorden.');
  const old = f.session();
  const completed = saveSession({ ...old, phase: 'feedback', rounds: [{ ...old.rounds[0],
    submitted: answer, submittedAt: Date.now(), voiceSettled: true,
    feedback: goodFeedback(scenario.situation, answer) }] });
  const retry = saveSession(advanceSession(completed, 'retry'));
  const refresh = new Event('storage'); Object.assign(refresh, { key: sessionStorageKey() });
  f.events.dispatchEvent(refresh);
  assert.ok(f.sent.some(e => e.type === 'session.close'));
  assert.equal(f.document.getElementById('voiceTranscript')!.textContent, '');
  assert.equal(f.session().rounds[1].draft, '');
  assert.equal(f.session().revision, retry.revision);
  f.caption('user', 'Late oude woorden.');
  f.click('#voiceStartBtn'); await f.wait(() => f.sent.filter(e => e.event_id === 'encounter-opening').length === 2);
  const newAnswer = 'Vrijdag kan ik wel. Dan maak ik een afspraak.';
  f.caption('user', newAnswer); await f.wait(() => f.session()?.rounds[1].draft === newAnswer);
  f.click('#voiceStartBtn'); await f.wait(() => f.session()?.phase === 'feedback');
  assert.equal(f.session().rounds[1].submitted, newAnswer);
  assert.equal(f.session().rounds[0].submitted, answer);
});
