import { usageKey, type WordUsage } from './word-usage.ts';
import type { WordExplanation } from './word-explanation.ts';

export type UsageOutcome = 'independent' | 'supported' | 'needs-practice' | 'self-reviewed';
export type UsageAttempt = {
  id: string; at: number; word: string; chunk: string; outcome: UsageOutcome;
  source: 'review' | 'conversation'; quote?: string; better?: string; explanation?: string;
  discarded?: boolean;
};
const outcomes = ['independent', 'supported', 'needs-practice', 'self-reviewed'];

export function validateAttempts(value: unknown): UsageAttempt[] {
  if (!Array.isArray(value)) return [];
  return value.filter((a): a is UsageAttempt => {
    if (!a || typeof a !== 'object') return false;
    if (!['id', 'word', 'chunk'].every(k => typeof a[k] === 'string' && a[k].length > 0 && a[k].length <= 500)) return false;
    if (!Number.isFinite(a.at) || a.at < 0 || !outcomes.includes(a.outcome)) return false;
    if (!['review', 'conversation'].includes(a.source)) return false;
    if (a.discarded !== undefined && typeof a.discarded !== 'boolean') return false;
    return ['quote', 'better', 'explanation'].every(k => a[k] === undefined || (typeof a[k] === 'string' && a[k].length <= 2000));
  }).slice(-30);
}

export function mergeAttempts(a: UsageAttempt[], b: UsageAttempt[]): UsageAttempt[] {
  const entries = new Map<string, UsageAttempt>();
  for (const item of [...a, ...b]) {
    const old = entries.get(item.id);
    if (!old || (!old.discarded && (item.at > old.at || item.discarded))) entries.set(item.id, item);
  }
  return [...entries.values()].sort((x, y) => x.at - y.at).slice(-30);
}

export function usageHistory(word: string, chunk: string, attempts: UsageAttempt[]): UsageAttempt[] {
  return attempts.filter(a => !a.discarded && usageKey(a.word) === usageKey(word) && usageKey(a.chunk) === usageKey(chunk));
}

function usageReviewDue(word: string, chunk: string, attempts: UsageAttempt[], now: number): boolean {
  const history = usageHistory(word, chunk, attempts);
  const last = history.filter(a => a.outcome !== 'self-reviewed').at(-1);
  if (!last || !['needs-practice', 'supported'].includes(last.outcome)) return false;
  const reviewed = history.filter(a => a.source === 'review').at(-1);
  return !reviewed || reviewed.at < last.at || now - reviewed.at >= 86400000;
}

export function chooseWordUsage(data: Pick<WordExplanation, 'word' | 'usage'>, attempts: UsageAttempt[] = [], count = 0, now = Date.now()): WordUsage | undefined {
  const uses = data.usage || [];
  const ranked = uses.map((use, index) => {
    const last = usageHistory(data.word, use.chunk, attempts).filter(a => a.outcome !== 'self-reviewed').at(-1);
    const due = usageReviewDue(data.word, use.chunk, attempts, now);
    const priority = due && last?.outcome === 'needs-practice' ? 0 : due ? 1 : !last ? 2 : last.outcome === 'independent' ? 3 : 4;
    return { use, priority, at: last?.at || 0, order: (index - count % Math.max(1, uses.length) + uses.length) % uses.length };
  });
  ranked.sort((a, b) => a.priority - b.priority || a.at - b.at || a.order - b.order);
  return ranked[0]?.use;
}

export function needsUsageReview(data: Pick<WordExplanation, 'word' | 'usage'>, attempts: UsageAttempt[], now = Date.now()): boolean {
  return (data.usage || []).some(use => usageReviewDue(data.word, use.chunk, attempts, now));
}

export function wordReview(data: WordExplanation, level: number, reviews: number, attempts: UsageAttempt[]) {
  const use = chooseWordUsage(data, attempts, reviews);
  const last = use && usageHistory(data.word, use.chunk, attempts).filter(a => a.outcome !== 'self-reviewed').at(-1);
  const pending = last && ['needs-practice', 'supported'].includes(last.outcome);
  if (!use || (!pending && (level === 0 || reviews % 3 === 0))) {
    return { kind: 'meaning', prompt: 'Wat betekent dit woord?', nl: data.meaning_nl, en: data.meaning_en };
  }
  if (!pending && level === 1) {
    return { kind: 'chunk', usage: use, prompt: `Hoe zeg je: ${use.meaning_en}?`, nl: use.chunk, en: use.meaning_en };
  }
  return { kind: 'output', usage: use, prompt: use.review_prompt, nl: use.example_nl, en: use.example_en };
}
