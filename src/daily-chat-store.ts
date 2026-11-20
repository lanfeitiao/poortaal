import { expressionKey, readDailyFeedback, type DailyFeedback } from './daily-chat-feedback.ts';

export type SavedExpression = { id: string; card: DailyFeedback; dueAt: number; level: number };
type ExpressionStorage = Pick<Storage, 'getItem' | 'setItem'>;
const key = (owner: string) => `poortaal_daily_chat_review:${owner}`;
const day = 86_400_000;
const intervals = [1, 3, 7, 14];

export function readExpressions(owner: string, storage: ExpressionStorage = localStorage): SavedExpression[] {
  try {
    const saved: unknown = JSON.parse(storage.getItem(key(owner)) ?? '[]');
    if (!Array.isArray(saved)) return [];
    return saved.flatMap(item => {
      if (!item || typeof item.id !== 'string' || !Number.isFinite(item.dueAt)
        || !Number.isInteger(item.level) || item.level < 0 || item.level > intervals.length) return [];
      const card = readDailyFeedback(item.card);
      return card ? [{ id: item.id, dueAt: item.dueAt, level: item.level, card }] : [];
    });
  } catch {
    return [];
  }
}

export function saveExpression(owner: string, card: DailyFeedback, storage: ExpressionStorage = localStorage, now = Date.now()): void {
  const saved = readExpressions(owner, storage);
  const expression = expressionKey(card.dutch);
  if (saved.some(item => expressionKey(item.card.dutch) === expression)) return;
  saved.push({ id: crypto.randomUUID(), card, dueAt: now, level: 0 });
  storage.setItem(key(owner), JSON.stringify(saved));
}

export function gradeExpression(owner: string, id: string, known: boolean, storage: ExpressionStorage = localStorage, now = Date.now()): void {
  const saved = readExpressions(owner, storage);
  const item = saved.find(entry => entry.id === id && entry.dueAt <= now);
  if (!item) return;
  item.dueAt = now + day * (known ? intervals[Math.min(item.level, intervals.length - 1)] : 1);
  item.level = known ? Math.min(item.level + 1, intervals.length) : 0;
  storage.setItem(key(owner), JSON.stringify(saved));
}
