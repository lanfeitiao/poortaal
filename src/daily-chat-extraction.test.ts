import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeDailyChat, type ChatTurn, type DailyChatAnalysis, type DailyFeedback } from './daily-chat-feedback.ts';

test('Daily Chat uses the Hoiland extraction model and retains a supplied Dutch recast', async t => {
  const turns: ChatTurn[] = [
    { role: 'user', content: 'Mijn dochter ook mee komen?' },
    { role: 'assistant', content: 'Je kunt zeggen: Mag mijn dochter ook meekomen?' },
  ];
  const card: DailyFeedback = {
    speaker: 'partner', kind: 'naturalness', quote: 'Mag mijn dochter ook meekomen?',
    dutch: 'Mag mijn dochter ook meekomen?', explanation: 'Ask permission with mag.',
    english: 'Can my daughter come along too?',
  };
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.equal(body.model, 'gpt-5.6-terra');
    assert.equal(body.reasoning_effort, 'low');
    assert.match(body.messages[0].content, /English translation of the exact sentence in dutch/);
    assert.deepEqual(JSON.parse(body.messages[1].content), turns);
    return Response.json({ choices: [{ message: { content: JSON.stringify([card]) } }] });
  });
  assert.deepEqual(await analyzeDailyChat('https://example.test', turns), [card]);
});

test('Daily Chat rechecks empty and unusable results with the same transcript', async t => {
  const turns: ChatTurn[] = [{ role: 'user', content: 'Ik ga naar huis.' }];
  const card: DailyFeedback = {
    kind: 'useful', quote: turns[0].content, dutch: 'Ik ga naar huis.',
    explanation: 'Heading home.', situation: 'Tell someone you are heading to school.',
  };
  const invalid = [{ ...card, quote: 'An invented quote' }];
  const responses: unknown[] = [[], [card], invalid, [card], {}, [card], [], [], invalid, invalid, {}, {}];
  const prompts: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.deepEqual(JSON.parse(body.messages[1].content), turns);
    prompts.push(body.messages[0].content);
    return Response.json({ choices: [{ message: { content: JSON.stringify(responses.shift()) } }] });
  });
  const reports: DailyChatAnalysis[] = [];
  const report = (analysis: DailyChatAnalysis) => { reports.push(analysis); };
  assert.deepEqual(await analyzeDailyChat('https://example.test', turns, report), [card]);
  assert.deepEqual(await analyzeDailyChat('https://example.test', turns, report), [card]);
  assert.deepEqual(await analyzeDailyChat('https://example.test', turns, report), [card]);
  assert.deepEqual(await analyzeDailyChat('https://example.test', turns), []);
  await assert.rejects(analyzeDailyChat('https://example.test', turns, report), /could not be grounded/);
  await assert.rejects(analyzeDailyChat('https://example.test', turns), /Expected a list/);
  assert.deepEqual(reports.map(item => item.retained), [0, 1, 0, 1, 1, 0, 0]);
  assert.ok(prompts[1].includes('Look again for a correction'));
  assert.equal(responses.length, 0);
});
