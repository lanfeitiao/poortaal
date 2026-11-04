import assert from 'node:assert/strict';
import test from 'node:test';
import { generateLearningScene, readLearningScene } from './learning-scene.ts';
import { validateLearningExchange } from './learning-scene-quality.ts';
import { approvedLearningReview, lessonScenario, studyTurn } from './structured-fixtures.ts';

const word = { word: 'onderdeel', type: 'zelfstandig naamwoord', meaning_nl: 'Een deel van een groter geheel.',
  meaning_en: 'part of an object', examples: [{ nl: 'Er ontbreekt een onderdeel.', en: 'A part is missing.' }],
  usage: [], tips: '', fun_fact: null };
const draft = {
  scenario: { ...lessonScenario, situation: 'Your vacuum cleaner is still being repaired.',
    task: 'Explain why the repair is delayed.', dialogue: [
      studyTurn('partner', 'Is de stofzuiger al gemaakt?', 'Has the vacuum cleaner been repaired yet?'),
      studyTurn('learner', 'Nog niet, ik wacht op een onderdeel.', "Not yet, I'm waiting for a part."),
    ] },
  moment: { notice: null,
    transfer: { situation: 'The bike shop has to order a part before repairing your bike.',
      openingLine: 'Kun je je fiets vandaag ophalen?', example: 'Nee, ze moeten nog een onderdeel bestellen.' } },
};
const echo = { ...draft, scenario: { ...draft.scenario,
  situation: 'Children are building with Lego and a piece is missing.',
  dialogue: [studyTurn('partner', 'We hebben een stuk nodig voor de Lego.', 'We need a piece for the Lego.'),
    studyTurn('learner', 'We hebben een onderdeel nodig voor de Lego.', 'We need a part for the Lego.')] } };

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
  assert.deepEqual(scene.scenario.dialogue, draft.scenario.dialogue);
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
    transfer: { ...draft.moment.transfer, openingLine: echo.scenario.dialogue[0].line, example: echo.scenario.dialogue[1].line } } };
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
        dialogue: [studyTurn('partner', 'Wat missen we nog?', 'What are we still missing?'),
          studyTurn('learner', 'We hebben nog een onderdeel nodig.', 'We still need a part.')] } };
      const scene = await generateLearningScene(word, async (messages, temperature, model) => {
        assert.equal(model, 'gpt-6.1-sol');
        const input = JSON.parse(messages[1].content);
        if (input.kind === 'learning-moment-review') {
          assert.equal(messages.length, 2); assert.equal(temperature, 0);
          assert.equal(input.word, word.word); assert.equal(input.meaning, word.meaning_en);
          assert.deepEqual(input.study.dialogue, generations === 1 ? forced.scenario.dialogue : draft.scenario.dialogue);
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

test('a child can say the target while the learner gives a natural one-word reply', async () => {
  const reply = { ...draft, scenario: { situation: 'You point out where a toy part belongs.',
    task: 'Show the child where the part goes.', dialogue: [
      studyTurn('partner', 'Waar hoort dit onderdeel?', 'Where does this part belong?', 'Child'),
      studyTurn('learner', 'Daar!', 'There!'),
    ] } };
  const scene = await generateLearningScene(word, async messages => {
    if (JSON.parse(messages[1].content).kind === 'learning-moment-review') {
      assert.deepEqual(JSON.parse(messages[1].content).study.dialogue, reply.scenario.dialogue);
      return JSON.stringify(approvedLearningReview);
    }
    return JSON.stringify(reply);
  });
  assert.ok(readLearningScene(scene, word));
  assert.equal(scene.scenario.dialogue[1].line, 'Daar!');
  assert.ok(!Object.hasOwn(scene.scenario, 'expressions'));
  assert.ok(!Object.hasOwn(scene.scenario, 'hints'));
});

test('a target appearing only in English translations or metadata does not count as spoken exposure', async () => {
  const scenario = { ...draft.scenario, dialogue: [
    studyTurn('partner', 'Wat is er kapot?', 'Which onderdeel is broken?'),
    studyTurn('learner', 'Dat weet ik nog niet.', 'I do not know yet.'),
  ] };
  let calls = 0;
  await assert.rejects(generateLearningScene(word, async () => {
    calls++; return JSON.stringify({ ...draft, scenario });
  }), /at least one Dutch line/);
  assert.equal(calls, 2);
});
