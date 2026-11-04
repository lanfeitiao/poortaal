import assert from 'node:assert/strict';
import test from 'node:test';
import { generateLearningScene, readLearningScene } from './learning-scene.ts';
import { validateLearningExchange } from './learning-scene-quality.ts';
import { approvedLearningReview, lessonScenario } from './structured-fixtures.ts';

const word = { word: 'onderdeel', type: 'zelfstandig naamwoord', meaning_nl: 'Een deel van een groter geheel.',
  meaning_en: 'part of an object', examples: [{ nl: 'Er ontbreekt een onderdeel.', en: 'A part is missing.' }],
  usage: [], tips: '', fun_fact: null };
const draft = {
  scenario: { ...lessonScenario, situation: 'Your vacuum cleaner is still being repaired.',
    task: 'Explain why the repair is delayed.', openingLine: 'Is de stofzuiger al gemaakt?',
    expressions: ['Nog niet, ik wacht op een onderdeel.'],
    hints: ['Leg uit waarom het nog niet klaar is.', 'Nog niet, ik wacht…', 'Nog niet, ik wacht op een onderdeel.'] },
  moment: { translation: "Not yet, I'm waiting for a part.", notice: null,
    transfer: { situation: 'The bike shop has to order a part before repairing your bike.',
      openingLine: 'Kun je je fiets vandaag ophalen?', example: 'Nee, ze moeten nog een onderdeel bestellen.' } },
};
const echo = { ...draft, scenario: { ...draft.scenario,
  situation: 'Children are building with Lego and a piece is missing.',
  openingLine: 'We hebben een stuk nodig voor de Lego.',
  expressions: ['We hebben een onderdeel nodig voor de Lego.'],
  hints: ['Zeg wat er ontbreekt.', 'We hebben een…', 'We hebben een onderdeel nodig voor de Lego.'] } };

test('the reported Lego synonym echo is repaired before review and cannot reappear from cache', async () => {
  let generations = 0, reviews = 0;
  const scene = await generateLearningScene(word, async messages => {
    if (JSON.parse(messages[1].content).kind === 'learning-moment-review') {
      reviews++; return JSON.stringify(approvedLearningReview);
    }
    if (++generations === 2) assert.match(messages.at(-1)!.content, /merely repeats the partner/);
    return JSON.stringify(generations === 1 ? echo : draft);
  });
  assert.equal(generations, 2); assert.equal(reviews, 1);
  assert.equal(scene.scenario.expressions[0], draft.scenario.expressions[0]);
  assert.ok(readLearningScene(scene, word));
  assert.equal(readLearningScene({ ...scene, scenario: echo.scenario }, word), undefined);
});

test('the same echo guard covers hidden transfer replies without rejecting ordinary responses', async () => {
  for (const [opening, reply] of [['Kom je mee?', 'Ja, ik kom mee.'],
    ['Is hij al gemaakt?', 'Nog niet, ik wacht op een onderdeel.']]) {
    assert.doesNotThrow(() => validateLearningExchange(opening, reply));
  }
  assert.throws(() => validateLearningExchange('Hallo!', 'hallo.'), /merely repeats/);
  let calls = 0;
  const badTransfer = { ...draft, moment: { ...draft.moment,
    transfer: { ...draft.moment.transfer, openingLine: echo.scenario.openingLine, example: echo.scenario.expressions[0] } } };
  await assert.rejects(generateLearningScene(word, async () => {
    calls++; return JSON.stringify(badTransfer);
  }), /merely repeats/);
  assert.equal(calls, 2);
});
