import { choice, object, text, validateScenario, validateStructuredFeedback } from './structured-contract.ts';
import type { PracticeRound, StructuredSession } from './structured-session.ts';
import { validateWordUsage } from './word-usage.ts';

function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) throw new Error('Invalid number');
  return value as number;
}
export function restoreSession(value: unknown, owner: string): StructuredSession {
  const v = object(value);
  if (v.version !== 1 || v.owner !== owner || typeof v.supportUsed !== 'boolean' || typeof v.skippedRetry !== 'boolean') {
    throw new Error('Invalid session');
  }
  const scenario = v.scenario === undefined ? undefined : validateScenario(v.scenario);
  if (!Array.isArray(v.rounds) || v.rounds.length < 1 || v.rounds.length > 2) throw new Error('Invalid rounds');
  const rounds: PracticeRound[] = [];
  for (const [index, item] of v.rounds.entries()) {
    const r = object(item);
    const round: PracticeRound = { draft: text(r.draft, 2000, true), hintsUsed: integer(r.hintsUsed, 3) };
    if (r.submitted !== undefined) {
      round.submitted = text(r.submitted, 2000); round.submittedAt = integer(r.submittedAt);
    }
    if (r.feedback !== undefined) {
      const situation = index === 0 ? scenario?.situation : rounds[0]?.feedback?.retry.situation;
      if (!round.submitted || !situation) throw new Error('Feedback without response');
      round.feedback = validateStructuredFeedback(r.feedback, round.submitted, situation);
    }
    rounds.push(round);
  }
  const round = integer(v.round, 1) as 0 | 1;
  const phase = choice(v.phase, ['prepare', 'guide', 'answer', 'feedback', 'complete']);
  const pending = v.pending === null ? null : choice(v.pending, ['scenario', 'feedback']);
  const mode = choice(v.mode, ['guided', 'recall']);
  if (rounds.length !== round + 1 || (round === 1 && !rounds[0]?.feedback)) throw new Error('Missing retry context');
  if ((phase !== 'prepare' && !scenario) || (phase === 'guide' && (round !== 0 || mode !== 'guided'))) throw new Error('Missing scenario');
  if (['feedback', 'complete'].includes(phase) !== !!rounds[round]?.feedback) throw new Error('Invalid feedback phase');
  if ((pending === 'scenario' && phase !== 'prepare') || (pending === 'feedback' && (phase !== 'answer' || !rounds[round]?.submitted))) {
    throw new Error('Invalid pending request');
  }
  return { version: 1, id: text(v.id, 100), owner, word: text(v.word, 200),
    usage: v.usage === undefined ? undefined : validateWordUsage([v.usage])[0],
    revision: integer(v.revision), updatedAt: integer(v.updatedAt), mode,
    supportUsed: mode === 'guided' || v.supportUsed, phase, pending, round, rounds, scenario,
    skippedRetry: v.skippedRetry };
}
