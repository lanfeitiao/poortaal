import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStudyScenario } from './structured-contract.ts';
import { restoreSession } from './structured-restore.ts';
import { createSession } from './structured-session.ts';
import { lessonScenario, scenario, studyTurn } from './structured-fixtures.ts';

test('study conversations accept two through five turns without requiring a fixed length', () => {
  const short = { ...lessonScenario, dialogue: lessonScenario.dialogue.slice(0, 2) };
  const five = { ...lessonScenario, dialogue: [...lessonScenario.dialogue,
    studyTurn('partner', 'Tot dan!', 'See you then!')] };
  assert.equal(validateStudyScenario(short).dialogue.length, 2);
  assert.equal(validateStudyScenario(five).dialogue.length, 5);
});

test('six turns are rejected even when each contains only one short sentence', () => {
  assert.throws(() => validateStudyScenario({ ...lessonScenario,
    dialogue: [...lessonScenario.dialogue, ...lessonScenario.dialogue.slice(0, 2)] }));
});

test('the five-sentence budget counts all Dutch sentences, not just dialogue entries', () => {
  const five = { ...lessonScenario, dialogue: [
    studyTurn('partner', 'Hallo. Kom je binnen? Wil je thee?', 'Hello. Are you coming in? Would you like tea?'),
    studyTurn('learner', 'Graag. Ik kom eraan.', 'Yes please. I am coming.'),
  ] };
  assert.equal(validateStudyScenario(five).dialogue.length, 2);
  const six = { ...five, dialogue: [five.dialogue[0],
    studyTurn('learner', 'Graag. Ik kom eraan. Tot zo!', 'Yes please. I am coming. See you soon!')] };
  assert.throws(() => validateStudyScenario(six), /at most five spoken sentences/);
});

test('every turn needs a role and translation, and the conversation needs both sides', () => {
  const [first, second] = lessonScenario.dialogue;
  for (const broken of [{ ...first, translation: undefined }, { ...first, role: 'system' }]) {
    assert.throws(() => validateStudyScenario({ ...lessonScenario, dialogue: [broken, second] }));
  }
  assert.throws(() => validateStudyScenario({ ...lessonScenario, dialogue: [first, first] }), /both the learner/);
});

test('practice sessions restore both full study conversations and older practice-shaped handoffs', () => {
  const session = createSession('guest', 'afspraak', undefined, false, true);
  const five = { ...lessonScenario, dialogue: [...lessonScenario.dialogue,
    studyTurn('partner', 'Tot dan!', 'See you then!')] };
  for (const studiedScenario of [five, scenario]) {
    const restored = restoreSession({ ...session, studiedScenario }, 'guest');
    assert.deepEqual(restored.studiedScenario, studiedScenario);
    assert.equal(restored.supportUsed, true);
  }
});
