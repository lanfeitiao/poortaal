import type { PracticeContext } from './practice-context.ts';
import type { UsageOutcome } from './word-learning.ts';

export type PracticeTurn = { role: 'user' | 'assistant'; content: string };
export type PracticeSnapshot = PracticeContext & {
  owner: string; turns: PracticeTurn[]; supportUsed: boolean; settled: boolean;
};
export type Feedback = {
  strength: string; strength_quote: string;
  assessment: Exclude<UsageOutcome, 'self-reviewed'> | 'not-used' | 'uncertain';
  evidence: string;
  correction: { kind: 'error' | 'naturalness'; quote: string; better: string; explanation: string } | null;
  retry_prompt: string; retry_example: string;
};
const normal = (text: string) => text.trim().replace(/\s+/g, ' ');
function text(value: unknown, max = 1000): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid feedback text');
  return value.trim();
}
function learnerQuote(quote: string, turns: PracticeTurn[]): boolean {
  return !!quote && turns.some(t => t.role === 'user' && normal(t.content).includes(normal(quote)));
}

export function validateFeedback(value: unknown, snapshot: PracticeSnapshot): Feedback {
  if (!value || typeof value !== 'object') throw new Error('Invalid feedback');
  const raw = value as Record<string, unknown>;
  const strength = text(raw.strength);
  const strengthQuote = text(raw.strength_quote, 2000);
  if (strengthQuote && !learnerQuote(strengthQuote, snapshot.turns)) throw new Error('Unfounded strength');
  const outcomes = ['independent', 'supported', 'needs-practice', 'not-used', 'uncertain'];
  if (!outcomes.includes(String(raw.assessment))) throw new Error('Invalid feedback outcome');
  let assessment = raw.assessment as Feedback['assessment'];
  const evidence = text(raw.evidence, 2000);
  if (evidence && !learnerQuote(evidence, snapshot.turns)) throw new Error('Unfounded evidence');
  if (['independent', 'supported', 'needs-practice'].includes(assessment) && !evidence) throw new Error('Missing usage evidence');
  let correction: Feedback['correction'] = null;
  if (raw.correction !== null && raw.correction !== undefined) {
    const c = raw.correction as Record<string, unknown>;
    if (!c || !['error', 'naturalness'].includes(String(c.kind))) throw new Error('Invalid correction');
    correction = { kind: c.kind as 'error' | 'naturalness', quote: text(c.quote, 2000), better: text(c.better), explanation: text(c.explanation) };
    if (!learnerQuote(correction.quote, snapshot.turns) || !correction.better || !correction.explanation) throw new Error('Unfounded correction');
  }
  if (assessment === 'independent' && snapshot.supportUsed) assessment = 'supported';
  if (!snapshot.settled) assessment = 'uncertain';
  if (assessment === 'uncertain') correction = null;
  if (correction?.kind === 'error' && ['independent', 'supported'].includes(assessment)) assessment = 'needs-practice';
  return {
    strength: strengthQuote ? strength : 'Je hebt geoefend. Neem rustig de tijd om opnieuw te proberen.',
    strength_quote: strengthQuote, assessment, evidence, correction,
    retry_prompt: text(raw.retry_prompt), retry_example: text(raw.retry_example),
  };
}

export function feedbackAttempt(snapshot: PracticeSnapshot, feedback: Feedback, now = Date.now()) {
  if (!snapshot.usage || ['uncertain', 'not-used'].includes(feedback.assessment)) return null;
  return {
    id: snapshot.id, at: now, word: snapshot.word, chunk: snapshot.usage.chunk,
    outcome: feedback.assessment as UsageOutcome, source: 'conversation' as const,
    quote: feedback.evidence, better: feedback.correction?.better, explanation: feedback.correction?.explanation,
  };
}
