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
