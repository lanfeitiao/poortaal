import assert from 'node:assert/strict';
import test from 'node:test';
import { liveFixture } from './structured-live-fixture.ts';
import { scenario, studyTurn } from './structured-fixtures.ts';

test('an earlier cached scene is regenerated for the new prompt without losing the word', async t => {
  const f = await liveFixture(t);
  const cache = JSON.parse(f.storage.get('poortaal_word_cache_v4')!);
  cache.afspraak.scene.version = 5;
  cache.afspraak.scene.scenario = { ...scenario, situation: 'An old generic scene.' };
  f.storage.set('poortaal_word_cache_v4', JSON.stringify(cache));
  (f.document.getElementById('wordInput') as HTMLInputElement).value = 'afspraak';
  f.click('#searchBtn');
  await f.wait(() => JSON.parse(f.storage.get('poortaal_word_cache_v4')!).afspraak.scene?.version === 6);
  const saved = JSON.parse(f.storage.get('poortaal_word_cache_v4')!).afspraak;
  assert.equal(saved.meaning_en, 'appointment');
  assert.equal(saved.scene.scenario.situation, scenario.situation);
  assert.ok(!f.document.getElementById('content')!.textContent!.includes('An old generic scene.'));
});

test('a five-line conversation with the target only in a child line reaches practice without claiming mastery', async t => {
  const f = await liveFixture(t);
  const cache = JSON.parse(f.storage.get('poortaal_word_cache_v4')!);
  const study = { situation: 'Your child asks about a dentist appointment.', task: 'Explain when you will collect them.', dialogue: [
    studyTurn('partner', 'Heb je de afspraak al gemaakt?', 'Have you made the appointment yet?', 'Child'),
    studyTurn('learner', 'Ja, voor vrijdagmiddag.', 'Yes, for Friday afternoon.'),
    studyTurn('partner', 'Moet ik dan eerder weg van school?', 'Do I have to leave school early then?', 'Child'),
    studyTurn('learner', 'Ja, ik haal je om twee uur op.', 'Yes, I will pick you up at two.'),
    studyTurn('partner', 'Dan leg ik mijn tas alvast klaar.', 'Then I will get my bag ready.', 'Child'),
  ] };
  cache.afspraak.scene.scenario = study;
  f.storage.set('poortaal_word_cache_v4', JSON.stringify(cache));
  (f.document.getElementById('wordInput') as HTMLInputElement).value = 'afspraak';
  f.click('#searchBtn');
  assert.equal(f.document.querySelectorAll('.learning-bubble').length, 5);
  assert.ok(f.document.querySelector('.learning-partner')!.textContent!.includes('Child'));
  f.click('[data-action="practice-word"]');
  await f.wait(() => f.session()?.phase === 'answer');
  assert.deepEqual(f.session().studiedScenario, study);
  assert.equal(f.session().supportUsed, true);
  assert.equal(f.attempts().length, 0);
});
