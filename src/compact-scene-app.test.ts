import assert from 'node:assert/strict';
import test from 'node:test';
import { liveFixture } from './structured-live-fixture.ts';
import { scenario } from './structured-fixtures.ts';

const changed = { ...scenario, situation: 'You need to move a meeting with your child’s teacher.',
  task: 'Ask for an appointment on Friday.', expressions: ['Kan ik vrijdag een afspraak maken?'], dialogue: [] };

test('changing a scene prevents duplicate requests and passes the chosen task into speech without another lesson', async t => {
  let resolve!: (value: unknown) => void;
  const requests: Record<string, unknown>[] = [];
  const f = await liveFixture(t, input => {
    requests.push(input);
    return input.studiedScenario ? { ...changed, situation: changed.situation + ' Only the morning is available.' }
      : new Promise(done => { resolve = done; });
  });
  (f.document.getElementById('wordInput') as HTMLInputElement).value = 'afspraak';
  f.click('#searchBtn'); f.click('[data-action="change-learning-scene"]');
  f.click('[data-action="change-learning-scene"]'); f.click('[data-action="practice-word"]');
  await f.wait(() => requests.length === 1);
  assert.equal(f.document.getElementById('practiceChatSection')!.style.display, 'none');
  assert.ok(f.document.getElementById('content')!.textContent!.includes(scenario.situation));
  assert.deepEqual(requests[0].previous, [scenario.situation]);
  resolve(changed);
  await f.wait(() => f.document.getElementById('content')!.textContent!.includes(changed.situation));
  assert.equal(f.document.querySelectorAll('#content [data-action="practice-word"]').length, 1);
  assert.equal(f.document.querySelectorAll('#content details[open]').length, 0);
  const cache = JSON.parse(f.storage.get('poortaal_word_cache_v4')!);
  assert.equal(cache.afspraak.scene.scenario.situation, changed.situation);
  f.click('[data-action="practice-word"]');
  await f.wait(() => f.session()?.phase === 'answer');
  assert.equal(f.session().studiedScenario.situation, changed.situation);
  assert.equal(f.session().supportUsed, true);
  assert.deepEqual(requests[1].studiedScenario, cache.afspraak.scene.scenario);
  f.click('#voiceStartBtn'); await f.wait(() => f.sent.some(e => e.event_id === 'encounter-opening'));
  assert.equal(f.document.getElementById('voiceTranscript')!.textContent, '');
  assert.equal(f.attempts().length, 0);
});

test('a failed scene change keeps the current lesson and allows practice after a bounded repair', async t => {
  let calls = 0;
  const f = await liveFixture(t, () => { calls++; return scenario; });
  (f.document.getElementById('wordInput') as HTMLInputElement).value = 'afspraak';
  f.click('#searchBtn'); f.click('[data-action="change-learning-scene"]');
  await f.wait(() => f.document.getElementById('content')!.textContent!.includes('Could not change the situation'));
  assert.equal(calls, 2);
  assert.ok(f.document.getElementById('content')!.textContent!.includes(scenario.situation));
  assert.equal(f.document.querySelector('[data-action="practice-word"]')!.hasAttribute('disabled'), false);
  f.click('[data-action="practice-word"]');
  await f.wait(() => f.session()?.phase === 'answer');
  assert.equal(f.session().studiedScenario.situation, scenario.situation);
});
