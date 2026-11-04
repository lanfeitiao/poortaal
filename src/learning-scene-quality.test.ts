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
    ['We vertrekken om twee uur?', 'We vertrekken om drie uur.'],
    ['We vertrekken om twee uur.', 'Nee, we vertrekken om drie uur.'],
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

test('each editorial dimension can reject a draft and its feedback reaches the bounded rewrite', async t => {
  for (const check of ['naturalDutch', 'coherentExchange', 'wordFitsContext']) {
    await t.test(check, async () => {
      let generations = 0, reviews = 0;
      const feedback = 'Choose a context where a replacement part is actually needed.';
      const forced = { ...draft, scenario: { ...draft.scenario, situation: echo.scenario.situation,
        openingLine: 'Wat missen we nog?', expressions: ['We hebben nog een onderdeel nodig.'],
        hints: ['Zeg wat er ontbreekt.', 'We hebben nog…', 'We hebben nog een onderdeel nodig.'] } };
      const scene = await generateLearningScene(word, async (messages, temperature, model) => {
        assert.equal(model, 'gpt-6.1-sol');
        const input = JSON.parse(messages[1].content);
        if (input.kind === 'learning-moment-review') {
          assert.equal(messages.length, 2); assert.equal(temperature, 0);
          assert.equal(input.word, word.word); assert.equal(input.meaning, word.meaning_en);
          assert.equal(input.study.learnerReply, generations === 1 ? forced.scenario.expressions[0] : draft.scenario.expressions[0]);
          assert.equal(input.transfer.partnerLine, draft.moment.transfer.openingLine);
          assert.equal(input.transfer.learnerReply, draft.moment.transfer.example);
          return JSON.stringify(++reviews === 1 ? { ...approvedLearningReview, [check]: false, feedback } : approvedLearningReview);
        }
        if (++generations === 2) assert.ok(messages.at(-1)!.content.includes(feedback));
        return JSON.stringify(generations === 1 ? forced : draft);
      });
      assert.equal(generations, 2); assert.equal(reviews, 2);
      assert.equal(scene.scenario.situation, draft.scenario.situation);
    });
  }
});

test('rejected or malformed reviews never save a scene and stop after two drafts', async t => {
  for (const verdict of [{ ...approvedLearningReview, coherentExchange: false, feedback: 'The reply does not answer the question.' },
    { ...approvedLearningReview, study: { ...approvedLearningReview.study, coherent: false }, feedback: 'Study roles are swapped.' },
    { ...approvedLearningReview, transfer: { ...approvedLearningReview.transfer, coherent: false }, feedback: 'Transfer roles are swapped.' },
    { ...approvedLearningReview, naturalDutch: 'true' }, { naturalDutch: true }, 'not JSON']) {
    await t.test(JSON.stringify(verdict), async () => {
      const calls: string[] = [];
      await assert.rejects(generateLearningScene(word, async messages => {
        const kind = JSON.parse(messages[1].content).kind; calls.push(kind);
        return kind === 'learning-moment-review' ? (typeof verdict === 'string' ? verdict : JSON.stringify(verdict)) : JSON.stringify(draft);
      }), /Scene quality/);
      assert.deepEqual(calls, ['learning-moment', 'learning-moment-review', 'learning-moment', 'learning-moment-review']);
    });
  }
});

test('a review request failure is surfaced without repeatedly generating more drafts', async () => {
  let calls = 0;
  await assert.rejects(generateLearningScene(word, async messages => {
    calls++;
    if (JSON.parse(messages[1].content).kind === 'learning-moment-review') throw new Error('HTTP failure');
    return JSON.stringify(draft);
  }), /HTTP failure/);
  assert.equal(calls, 2);
});

test('final hints are derived from the displayed reply instead of accepting an unrelated model answer', async () => {
  let generations = 0, reviews = 0;
  const mismatched = { ...draft, scenario: { ...draft.scenario,
    hints: ['Zeg wat er nog nodig is.', 'Ik heb een…', 'Ik heb een onderdeel nodig.'] } };
  const scene = await generateLearningScene(word, async messages => {
    if (JSON.parse(messages[1].content).kind === 'learning-moment-review') {
      reviews++; return JSON.stringify(approvedLearningReview);
    }
    generations++;
    return JSON.stringify(mismatched);
  });
  assert.equal(generations, 1); assert.equal(reviews, 1);
  assert.equal(scene.scenario.hints[2], scene.scenario.expressions[0]);
  assert.equal(scene.scenario.hints[1], 'Nog niet, ik…');
  assert.equal(readLearningScene({ ...scene, scenario: mismatched.scenario }, word), undefined);
});
