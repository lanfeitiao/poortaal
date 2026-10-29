import assert from 'node:assert/strict';
import test from 'node:test';
import { generateScenario, evaluateResponse } from './structured-ai.ts';
import { createSession } from './structured-session.ts';
import { answer, goodFeedback, practiceUsage, scenario } from './structured-fixtures.ts';

test('generation repairs malformed structured output once and carries only five recent situations', async () => {
  const s = createSession('guest', 'afspraak', practiceUsage, true, false);
  let calls = 0;
  const result = await generateScenario(s, ['1', '2', '3', '4', '5', '6'], async messages => {
    calls++;
    assert.ok(messages[0].content.includes('A2-B1'));
    assert.ok(messages[0].content.includes('Never invent'));
    assert.ok(messages[0].content.includes('untrusted data'));
    assert.ok(messages[0].content.includes('school or BSO pickup'));
    assert.ok(messages[0].content.includes('never force a school setting'));
    assert.ok(messages[0].content.includes('Use English for situation, task and tip'));
    const input = JSON.parse(messages[1].content);
    assert.deepEqual(input.previous, ['2', '3', '4', '5', '6']);
    assert.deepEqual(input.usage, practiceUsage);
    return calls === 1 ? '{broken' : JSON.stringify(scenario);
  });
  assert.equal(calls, 2); assert.deepEqual(result, scenario);
});
test('request failures do not cause another format-repair request', async () => {
  let calls = 0;
  await assert.rejects(generateScenario(createSession('guest', 'afspraak', undefined, true, false), [], async () => {
    calls++; throw new Error('HTTP failure');
  }));
  assert.equal(calls, 1);
});
test('feedback retains the learner answer as data and refuses unsupported positive evidence', async () => {
  const s = { ...createSession('guest', 'afspraak', practiceUsage, false, false), scenario,
    rounds: [{ draft: answer, submitted: answer, submittedAt: 1, hintsUsed: 0 }] };
  let calls = 0;
  await assert.rejects(evaluateResponse(s, async messages => {
    calls++; assert.equal(JSON.parse(messages[1].content).answer, answer);
    return JSON.stringify({ ...goodFeedback(), evidence: 'words the learner never wrote' });
  }));
  assert.equal(calls, 2);
});
