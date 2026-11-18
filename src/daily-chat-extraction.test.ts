import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeDailyChat, type ChatTurn, type DailyFeedback } from './daily-chat-feedback.ts';

test('Daily Chat uses the Hoiland extraction model and retains a supplied Dutch recast', async t => {
  const turns: ChatTurn[] = [
    { role: 'user', content: 'Mijn dochter ook mee komen?' },
    { role: 'assistant', content: 'Je kunt zeggen: Mag mijn dochter ook meekomen?' },
  ];
  const card: DailyFeedback = {
    speaker: 'partner', kind: 'naturalness', quote: 'Mag mijn dochter ook meekomen?',
    dutch: 'Mag mijn dochter ook meekomen?', explanation: 'Ask permission with mag.',
    situation: 'Ask whether your son can join the picnic.',
  };
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.equal(body.model, 'gpt-5.6-terra');
    assert.equal(body.reasoning_effort, 'low');
    assert.deepEqual(JSON.parse(body.messages[1].content), turns);
    return Response.json({ choices: [{ message: { content: JSON.stringify([card]) } }] });
  });
  assert.deepEqual(await analyzeDailyChat('https://example.test', turns), [card]);
});

test('discarded candidates fail for retry while a genuine empty selection remains valid', async t => {
  const turns: ChatTurn[] = [{ role: 'user', content: 'Ik ga naar huis.' }];
  const responses = [[{
    kind: 'useful', quote: 'An invented quote', dutch: 'Ik ga naar huis.',
    explanation: 'Heading home.', situation: 'Tell someone you are heading to school.',
  }], [], {}];
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    choices: [{ message: { content: JSON.stringify(responses.shift()) } }],
  }));
  await assert.rejects(analyzeDailyChat('https://example.test', turns), /could not be grounded/);
  assert.deepEqual(await analyzeDailyChat('https://example.test', turns), []);
  await assert.rejects(analyzeDailyChat('https://example.test', turns), /Expected a list/);
});
