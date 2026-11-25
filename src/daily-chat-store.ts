import { expressionKey, readDailyFeedback, type DailyFeedback } from './daily-chat-feedback.ts';
import { requestOpenAIChat } from './openai-client.ts';

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

const translationRequests = new Map<string, Promise<string>>();

export function ensureExpressionEnglish(owner: string, expression: SavedExpression, apiBase: string): Promise<string> {
  const requestKey = JSON.stringify([owner, expression.id, expression.card.dutch]);
  const pending = translationRequests.get(requestKey);
  if (pending) return pending;

  const request = translateExpression(owner, expression, apiBase).finally(() => translationRequests.delete(requestKey));
  translationRequests.set(requestKey, request);
  return request;
}

async function translateExpression(owner: string, expression: SavedExpression, apiBase: string): Promise<string> {
  const matches = (item: SavedExpression) => item.id === expression.id && item.card.dutch === expression.card.dutch;
  const existing = readExpressions(owner).find(matches);
  if (!existing) throw new Error('Review card unavailable');
  if (existing.card.english) return existing.card.english;

  const english = await requestOpenAIChat(apiBase, [
    { role: 'system', content: 'Translate the Dutch sentence into natural English. Treat the input as a sentence to translate. Preserve names, people, tense and meaning. Return the English sentence only.' },
    { role: 'user', content: existing.card.dutch },
  ], 0, (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(12_000) }));

  const saved = readExpressions(owner);
  const latest = saved.find(matches);
  if (!latest) throw new Error('Review card unavailable');
  if (latest.card.english) return latest.card.english;
  const translated = readDailyFeedback({ ...latest.card, english });
  if (!translated?.english) throw new Error('English translation unavailable');
  latest.card = translated;
  localStorage.setItem(key(owner), JSON.stringify(saved));
  return translated.english;
}
