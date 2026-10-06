import { mergeAttempts, validateAttempts, type UsageAttempt } from './word-learning.ts';
import { usageKey } from './word-usage.ts';

let owner = 'guest';
export function learningOwner(): string { return owner; }
export function setLearningOwner(userId: string | null): void {
  const next = userId || 'guest';
  if (next === owner) return;
  const guest = owner === 'guest' && next !== 'guest' ? readAll() : null;
  owner = next;
  if (guest && Object.keys(guest).length) {
    try {
      const all = readAll();
      for (const [word, value] of Object.entries(guest)) {
        const attempts = validateAttempts(value).filter(a => usageKey(a.word) === word);
        Object.defineProperty(all, word, { value: mergeAttempts(validateAttempts(all[word]), attempts), enumerable: true, configurable: true });
      }
      localStorage.setItem(storageKey(), JSON.stringify(all));
      localStorage.removeItem('poortaal_word_learning:guest');
    } catch { /* Keep anonymous progress if storage is temporarily unavailable. */ }
  }
  window.dispatchEvent(new Event('poortaal:learning-owner'));
}
function storageKey(): string { return `poortaal_word_learning:${owner}`; }
function readAll(): Record<string, unknown> {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey()) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function getWordAttempts(word: string): UsageAttempt[] {
  return validateAttempts(readAll()[usageKey(word)]).filter(a => usageKey(a.word) === usageKey(word));
}
function writeWordAttempts(word: string, attempts: UsageAttempt[]): void {
  const all = readAll();
  const key = usageKey(word);
  Object.defineProperty(all, key, { value: attempts, enumerable: true, configurable: true, writable: true });
  localStorage.setItem(storageKey(), JSON.stringify(all));
  window.dispatchEvent(new CustomEvent('poortaal:word-learning', { detail: { word: key, owner } }));
}
export function recordWordAttempt(attempt: UsageAttempt): void {
  writeWordAttempts(attempt.word, mergeAttempts(getWordAttempts(attempt.word), [attempt]));
}
export function discardWordAttempt(word: string, id: string): void {
  const attempts = getWordAttempts(word).map(a => a.id === id ? { ...a, discarded: true } : a);
  writeWordAttempts(word, attempts);
}
export function cloudWordLearning(word: string, data: unknown, userId: string): boolean {
  if (owner !== userId || !data || typeof data !== 'object') return false;
  const cloud = validateAttempts((data as Record<string, unknown>).usage_progress).filter(a => usageKey(a.word) === usageKey(word));
  const all = readAll();
  const merged = mergeAttempts(getWordAttempts(word), cloud);
  Object.defineProperty(all, usageKey(word), { value: merged, enumerable: true, configurable: true });
  localStorage.setItem(storageKey(), JSON.stringify(all));
  return JSON.stringify(merged) !== JSON.stringify(cloud);
}
export function clearWordLearning(word: string): void {
  const all = readAll();
  delete all[usageKey(word)];
  localStorage.setItem(storageKey(), JSON.stringify(all));
}
