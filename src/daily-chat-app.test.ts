import assert from 'node:assert/strict';
import test from 'node:test';
import { liveFixture } from './structured-live-fixture.ts';

test('a word-free Daily Chat can retry feedback and save a spoken recall card', async t => {
  const f = await liveFixture(t);
  const quote = 'Mag mijn dochter ook mee komen?';
  const dutch = 'Mag mijn dochter ook meekomen?';
  const situation = 'Ask a parent if your son can come to the picnic.';
  let connections = 0, analysis = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).endsWith('/live-session')) {
      connections++;
      assert.equal(JSON.parse(init!.body as string).word, '');
      if (connections === 1) return new Response(null, { status: 502 });
      return Response.json({ transport: { type: 'webrtc', sdp: 'answer' } });
    }
    assert.ok(String(url).endsWith('/openai'));
    const turns = JSON.parse(JSON.parse(init!.body as string).messages[1].content);
    assert.ok(turns.some((turn: { role: string; content: string }) => turn.role === 'user' && turn.content === quote));
    const response = ++analysis === 1 ? {} : [{ kind: 'correction', quote, dutch, situation, explanation: 'Write meekomen as one word here.' }];
    return Response.json({ choices: [{ message: { content: JSON.stringify(response) } }] });
  });
  const navigate = (hash: string) => {
    (f.events.location as { hash: string }).hash = hash;
    f.events.dispatchEvent(new Event('hashchange'));
  };
  const button = (root: string, label: string) => [...f.document.querySelectorAll<HTMLButtonElement>(root + ' button')]
    .find(item => item.textContent === label);
  t.after(() => navigate('#practice'));
  assert.ok(f.document.querySelector('#view-practice a[href="#daily-chat"]'));
  navigate('#daily-chat');
  button('#dailyChatBody', 'Start conversation')!.click();
  await f.wait(() => Boolean(button('#dailyChatBody', 'Try again')));
  assert.ok(!f.document.getElementById('dailyChatBody')?.textContent?.includes('No clear expressions'));
  button('#dailyChatBody', 'Try again')!.click();
  await f.wait(() => Boolean(button('#dailyChatBody', 'End conversation')));
  f.caption('user', quote);
  button('#dailyChatBody', 'End conversation')!.click();
  await f.wait(() => Boolean(button('#dailyChatBody', 'Retry feedback')));
  button('#dailyChatBody', 'Retry feedback')!.click();
  await f.wait(() => Boolean(button('#dailyChatBody', 'Save to Review')));
  assert.equal(connections, 2);
  button('#dailyChatBody', 'Save to Review')!.click();
  navigate('#review');
  const review = f.document.getElementById('reviewHomeSection')!;
  assert.ok(review.textContent?.includes(situation));
  assert.ok(!review.textContent?.includes(dutch));
  button('#reviewHomeSection', 'Reveal a possible reply')!.click();
  assert.ok(review.textContent?.includes(dutch));
  button('#reviewHomeSection', 'Got it')!.click();
  assert.ok(review.textContent?.includes('No expressions due right now.'));
});
