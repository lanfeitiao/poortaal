import { mergeAttempts, validateAttempts, type UsageAttempt } from './word-learning.ts';
import { usageKey } from './word-usage.ts';

let owner = 'guest';
export function learningOwner(): string { return owner; }
export function setLearningOwner(userId: string | null): void {
  const next = userId || 'guest';
  if (next === owner) return;
  owner = next;
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
export function cloudWordLearning(word: string, data: unknown, userId: string): void {
  if (owner !== userId || !data || typeof data !== 'object') return;
  const cloud = validateAttempts((data as Record<string, unknown>).usage_progress).filter(a => usageKey(a.word) === usageKey(word));
  const all = readAll();
  Object.defineProperty(all, usageKey(word), { value: mergeAttempts(getWordAttempts(word), cloud), enumerable: true, configurable: true });
  localStorage.setItem(storageKey(), JSON.stringify(all));
}
export function clearWordLearning(word: string): void {
  const all = readAll();
  delete all[usageKey(word)];
  localStorage.setItem(storageKey(), JSON.stringify(all));
}
