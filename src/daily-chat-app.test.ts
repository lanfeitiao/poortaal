import assert from 'node:assert/strict';
import test from 'node:test';
import { liveFixture } from './structured-live-fixture.ts';
import { renderCards } from './daily-chat-cards.ts';

test('Daily Chat credits a partner expression to Poortaal', async t => {
  const f = await liveFixture(t);
  const panel = f.document.getElementById('dailyChatBody')!;
  renderCards(panel, [{
    speaker: 'partner', kind: 'naturalness', quote: 'Ik werk op het kantoor.',
    dutch: 'Ik werk op kantoor.', explanation: 'Omit het for the general workplace.',
    situation: 'Tell someone where you normally study.',
  }], 'owner');
  assert.ok(panel.textContent?.includes('Poortaal said “Ik werk op het kantoor.”'));
  assert.ok(!panel.textContent?.includes('You said'));
});

test('Daily Chat can retry feedback, save individual cards and resume Review', async t => {
  const f = await liveFixture(t);
  const quote = 'Mag mijn dochter ook mee komen?';
  const dutch = 'Mag mijn dochter ook meekomen?';
  const situation = 'Ask a parent if your son can come to the picnic.';
  const secondDutch = 'Dat komt helemaal goed.';
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
    const feedback = { kind: 'correction', quote, dutch, situation, explanation: 'Write meekomen as one word here.' };
    const second = { kind: 'useful', speaker: 'partner', quote: secondDutch, dutch: secondDutch,
      explanation: 'Reassure someone.', situation: 'Tell someone that the arrangements will work out.' };
    const response = ++analysis <= 2 ? [{ ...feedback, quote: 'Not in this conversation' }] : [feedback, second];
    return Response.json({ choices: [{ message: { content: JSON.stringify(response) } }] });
  });
  const navigate = (hash: string) => {
    (f.events.location as { hash: string }).hash = hash;
    f.events.dispatchEvent(new Event('hashchange'));
  };
  const button = (root: string, label: string) => [...f.document.querySelectorAll<HTMLButtonElement>(root + ' button')]
    .find(item => item.textContent === label);
  t.after(() => navigate('#practice'));
  assert.equal(f.document.querySelector('#view-practice a.daily-chat-entry[href="#daily-chat"]')
    ?.querySelector('.daily-chat-entry-title')?.textContent, 'Daily Chat');
  navigate('#review');
  await f.wait(() => Boolean(f.document.querySelector('[data-action="start-review"]')));
  f.click('[data-action="start-review"]');
  f.click('#reviewFrontCard');
  const checkpoint = f.storage.get('poortaal_review_session:guest');
  assert.ok(checkpoint);
  const build = f.document.createElement('meta');
  build.name = 'poortaal-build'; build.content = '6644838'; f.document.head.append(build);
  navigate('#daily-chat');
  assert.equal(f.document.querySelector('.daily-chat-version')?.textContent,
    'Build 6644838 · Analysis model: gpt-5.6-terra');
  button('#dailyChatBody', 'Start conversation')!.click();
  await f.wait(() => Boolean(button('#dailyChatBody', 'Try again')));
  assert.ok(!f.document.getElementById('dailyChatBody')?.textContent?.includes('No clear expressions'));
  button('#dailyChatBody', 'Try again')!.click();
  await f.wait(() => Boolean(button('#dailyChatBody', 'End conversation')));
  assert.equal(f.document.querySelector('#dailyChatBody [role="status"]')?.textContent,
    'Microphone on. Tell me about your day.');
  assert.equal(f.track.enabled, true, 'Daily Chat can hear the learner before any greeting');
  f.caption('user', quote);
  f.caption('tutor', secondDutch);
  const transcript = f.document.querySelector('[aria-label="Conversation transcript"]')!;
  assert.equal(transcript.querySelector('.tutor .daily-chat-speaker')?.textContent, 'Poortaal');
  assert.equal(transcript.querySelector('.user .daily-chat-speaker')?.textContent, 'You');
  assert.equal(transcript.querySelector('.user p')?.textContent, quote);
  button('#dailyChatBody', 'End conversation')!.click();
  await f.wait(() => Boolean(button('#dailyChatBody', 'Retry feedback')));
  assert.ok(f.document.getElementById('dailyChatBody')?.textContent?.includes('Model proposed 1 · Kept 0'));
  button('#dailyChatBody', 'Retry feedback')!.click();
  await f.wait(() => Boolean(button('#dailyChatBody', 'Save to Review')));
  assert.equal(f.document.querySelector('.daily-chat-version')?.textContent,
    'Build 6644838 · Analysis model: gpt-5.6-terra');
  const details = f.document.querySelector('#dailyChatBody details')!;
  assert.ok(details.textContent?.includes('Your turns: 1 · Poortaal turns: 1'));
  assert.ok(details.textContent?.includes('Model proposed 2 · Kept 2'));
  assert.ok(details.textContent?.includes(quote));
  const first = '#dailyChatBody article:nth-of-type(1)';
  const second = '#dailyChatBody article:nth-of-type(2)';
  const saved = () => JSON.parse(f.storage.get('poortaal_daily_chat_review:guest') || '[]')
    .map((entry: { card: { dutch: string } }) => entry.card.dutch);
  const blockedWrite = t.mock.method(localStorage, 'setItem', () => { throw new Error('Storage unavailable'); });
  button(first, 'Save to Review')!.click();
  assert.equal(f.document.querySelector(`${first} [role="status"]`)?.textContent, 'Could not save this sentence. Try again.');
  assert.equal(button(first, 'Save to Review')?.disabled, false);
  assert.deepEqual(saved(), []);
  blockedWrite.mock.restore();
  button(first, 'Save to Review')!.click();
  assert.equal(button(first, 'Saved to Review')?.disabled, true);
  assert.equal(button(second, 'Save to Review')?.disabled, false);
  assert.deepEqual(saved(), [dutch]);
  const badge = f.document.getElementById('navReviewBadge')!;
  assert.equal(badge.textContent, '2');
  button('#dailyChatBody', 'Analyze again')!.click();
  await f.wait(() => Boolean(button(first, 'Saved to Review')));
  assert.equal(analysis, 4);
  assert.equal(connections, 2);
  button(second, 'Save to Review')!.click();
  assert.deepEqual(saved(), [dutch, secondDutch]);
  assert.equal(badge.textContent, '3');
  const reviewLink = f.document.querySelector(`${first} a`)!;
  assert.equal(reviewLink.textContent, 'Open Review');
  assert.equal(reviewLink.getAttribute('href'), '#review');
  navigate(reviewLink.getAttribute('href')!);
  assert.ok(f.document.getElementById('reviewCardAnswer')?.classList.contains('revealed'));
  assert.equal(f.storage.get('poortaal_review_session:guest'), checkpoint);

  f.events.confirm = () => true;
  f.click('[data-action="exit-review"]');
  assert.equal(f.document.querySelector('.review-count-num')?.textContent, '3');
  f.click('[data-action="start-review"]');
  assert.equal(f.document.querySelector('.review-progress-text')?.textContent, '1 / 3');
  assert.equal(f.document.querySelector('.review-card-word')?.textContent, 'afspraak');
  f.click('#reviewFrontCard');
  f.click('#reviewBtnKnow');

  assert.equal(f.document.querySelector('.review-progress-text')?.textContent, '2 / 3');
  assert.equal(f.document.querySelector('.review-card-task')?.textContent, situation);
  assert.ok(!f.document.getElementById('reviewCardAnswer')?.classList.contains('revealed'));
  assert.ok(f.document.getElementById('reviewBtnKnow')?.hasAttribute('disabled'));
  f.click('#reviewFrontCard');
  assert.equal(f.document.querySelector('#reviewCardAnswer.revealed .answer-nl')?.textContent, dutch);
  assert.equal(f.document.querySelector('#reviewCardAnswer .answer-en')?.textContent, 'Write meekomen as one word here.');
  f.click('#reviewBtnKnow');
  assert.equal(f.document.querySelector('.review-progress-text')?.textContent, '3 / 3');
  f.click('#reviewFrontCard');
  assert.equal(f.document.querySelector('#reviewCardAnswer.revealed .answer-nl')?.textContent, secondDutch);
  f.click('#reviewBtnAgain');

  assert.deepEqual([...f.document.querySelectorAll('.review-summary-stat')].map(stat => stat.textContent),
    ['🌳 2 wist je', '🥀 1 opnieuw']);
  const expressions = JSON.parse(f.storage.get('poortaal_daily_chat_review:guest')!);
  assert.equal(expressions[0].level, 1);
  assert.equal(expressions[1].level, 0);
  assert.ok(expressions.every((item: { dueAt: number }) => item.dueAt > Date.now()));
  assert.ok(badge.hidden);
  f.click('[data-action="end-review"]');
  assert.equal(f.document.querySelector('.review-empty-title')?.textContent, 'Alles fris voor vandaag');

  expressions[1].dueAt = 0;
  f.storage.set('poortaal_daily_chat_review:guest', JSON.stringify(expressions));
  navigate('#review?daily-chat');
  assert.equal(f.document.querySelector('.review-count-num')?.textContent, '1');
  f.click('[data-action="start-review"]');
  assert.equal(f.document.querySelector('.review-progress-text')?.textContent, '1 / 1');
  assert.equal(f.document.querySelector('.review-card-task')?.textContent, expressions[1].card.situation);
});
