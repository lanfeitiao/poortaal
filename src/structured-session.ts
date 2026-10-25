import type { PracticeScenario, PracticeTask, StructuredFeedback } from './structured-contract.ts';
import type { WordUsage } from './word-usage.ts';
import type { UsageAttempt, UsageOutcome } from './word-learning.ts';

export type PracticeRound = {
  draft: string; hintsUsed: number; submitted?: string; submittedAt?: number; feedback?: StructuredFeedback;
};
export type StructuredSession = {
  version: 1; id: string; owner: string; word: string; usage?: WordUsage;
  revision: number; updatedAt: number; mode: 'guided' | 'recall'; supportUsed: boolean;
  phase: 'prepare' | 'guide' | 'answer' | 'feedback' | 'complete';
  pending: 'scenario' | 'feedback' | null; round: 0 | 1; rounds: PracticeRound[];
  scenario?: PracticeScenario; skippedRetry: boolean;
};
export function createSession(owner: string, word: string, usage: WordUsage | undefined, guided: boolean, helped: boolean): StructuredSession {
  return { version: 1, id: crypto.randomUUID(), owner, word, usage, revision: 0, updatedAt: Date.now(),
    mode: guided ? 'guided' : 'recall', supportUsed: guided || helped, phase: 'prepare', pending: null,
    round: 0, rounds: [{ draft: '', hintsUsed: 0 }], skippedRetry: false };
}
export function currentRound(session: StructuredSession): PracticeRound { return session.rounds[session.round]!; }
export function currentTask(session: StructuredSession): PracticeTask | undefined {
  return session.round === 0 ? session.scenario : session.rounds[0]?.feedback?.retry;
}
export function practiceOutcome(session: StructuredSession, index: number = session.round): UsageOutcome {
  const round = session.rounds[index], feedback = round?.feedback;
  if (!feedback || feedback.target !== 'correct' || feedback.task !== 'completed' || feedback.naturalness === 'unclear') {
    return 'needs-practice';
  }
  return session.supportUsed || round.hintsUsed > 0 || index > 0 ? 'supported' : 'independent';
}
export function structuredAttempts(session: StructuredSession): UsageAttempt[] {
  return session.rounds.flatMap((round, index) => !round.feedback ? [] : [{
    id: `${session.id}:${index}`, at: round.submittedAt!, word: session.word, chunk: session.usage?.chunk || session.word,
    outcome: practiceOutcome(session, index), source: 'conversation' as const, quote: round.feedback.evidence,
    better: round.feedback.improvement?.better, explanation: round.feedback.improvement?.explanation,
  }]);
}
export function advanceSession(session: StructuredSession, action: 'continue' | 'retry' | 'skip' | 'finish'): StructuredSession {
  if (action === 'continue' && session.phase === 'guide') return { ...session, phase: 'answer' };
  if (session.phase !== 'feedback') throw new Error('Invalid practice transition');
  if (action === 'retry' && session.round === 0) {
    return { ...session, phase: 'answer', round: 1, rounds: [...session.rounds, { draft: '', hintsUsed: 0 }] };
  }
  if ((action === 'skip' && session.round === 0) || (action === 'finish' && session.round === 1)) {
    return { ...session, phase: 'complete', skippedRetry: action === 'skip' };
  }
  throw new Error('Invalid practice transition');
}
