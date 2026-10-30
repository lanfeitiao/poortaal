import assert from 'node:assert/strict';
import test from 'node:test';
import { generateScenario, evaluateResponse, validateGeneratedHintLadder } from './structured-ai.ts';
import { createSession } from './structured-session.ts';
import { answer, goodFeedback, scenario } from './structured-fixtures.ts';

const disconnected: [string, string, string] = ['Wat vind je van Italiaans eten?',
  'Ik heb een restaurant dat ik je...', 'Je moet dit restaurant echt proberen!'];
const coherent: [string, string, string] = ['Zeg dat je een tip voor een restaurant hebt.',
  'Ik heb een…', 'Ik heb een aanbeveling voor een goed Italiaans restaurant.'];

test('the screenshot ladder is rejected while a starter completed by the same answer is accepted', () => {
  assert.throws(() => validateGeneratedHintLadder({ ...scenario, hints: disconnected }));
  assert.doesNotThrow(() => validateGeneratedHintLadder({ ...scenario, hints: coherent }));
  for (const starter of ['', '...', coherent[2], 'Ik heb een aanbeveling voor een goed Italiaans restaurant…']) {
    assert.throws(() => validateGeneratedHintLadder({ ...scenario, hints: [coherent[0], starter, coherent[2]] }));
  }
});
test('generation repairs unrelated starters once with specific feedback, then stops on repeated failure', async () => {
  const session = createSession('guest', 'aanbeveling', undefined, false, false);
  let calls = 0;
  const result = await generateScenario(session, [], async messages => {
    if (++calls === 2) assert.ok(messages.at(-1)!.content.includes('Repair the hint ladder'));
    return JSON.stringify({ ...scenario, hints: calls === 1 ? disconnected : coherent });
  });
  assert.equal(calls, 2); assert.deepEqual(result.hints, coherent);
  calls = 0;
  await assert.rejects(generateScenario(session, [], async () => {
    calls++; return JSON.stringify({ ...scenario, hints: disconnected });
  }));
  assert.equal(calls, 2);
});
test('retry hints must also complete the same starter instead of introducing a different answer', async () => {
  const session = { ...createSession('guest', 'afspraak', undefined, false, false), scenario,
    rounds: [{ draft: answer, submitted: answer, hintsUsed: 0 }] };
  let calls = 0;
  const result = await evaluateResponse(session, async () => {
    const f = goodFeedback(); calls++;
    return JSON.stringify({ ...f, retry: { ...f.retry, hints: calls === 1 ? disconnected : f.retry.hints } });
  });
  assert.equal(calls, 2); assert.deepEqual(result.retry.hints, goodFeedback().retry.hints);
});
