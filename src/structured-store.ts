import { getWordAttempts, learningOwner, recordWordAttempt } from './learning-store.ts';
import { restoreSession } from './structured-restore.ts';
import { structuredAttempts, type StructuredSession } from './structured-session.ts';
import { usageKey } from './word-usage.ts';

type Sessions = { active: string | null; sessions: StructuredSession[] };
export function sessionStorageKey(owner = learningOwner()): string { return `poortaal_structured_practice:${owner}`; }
export function readSessions(owner = learningOwner()): Sessions {
  try {
    const data = JSON.parse(localStorage.getItem(sessionStorageKey(owner)) || '{}');
    const sessions = (Array.isArray(data.sessions) ? data.sessions : []).flatMap((item: unknown) => {
      try { return [restoreSession(item, owner)]; } catch { return []; }
    });
    return { active: typeof data.active === 'string' ? data.active : null, sessions };
  } catch { return { active: null, sessions: [] }; }
}
export function saveSession(session: StructuredSession): StructuredSession {
  if (session.owner !== learningOwner()) throw new Error('Practice owner changed');
  const data = readSessions(session.owner), old = data.sessions.find(s => s.id === session.id);
  if ((old?.revision ?? 0) !== session.revision) throw new Error('Practice changed in another tab');
  const saved = restoreSession({ ...session, revision: session.revision + 1, updatedAt: Date.now() }, session.owner);
  // Preserve the exact draft, including spaces typed at the end of a sentence.
  saved.rounds.forEach((r, i) => { r.draft = session.rounds[i]!.draft; });
  const rest = data.sessions.filter(s => s.id !== saved.id);
  const retained = [...rest.filter(s => s.phase !== 'complete'), ...rest.filter(s => s.phase === 'complete').slice(-29), saved];
  localStorage.setItem(sessionStorageKey(), JSON.stringify({ active: saved.id, sessions: retained }));
  return saved;
}
export function activeSession(): StructuredSession | undefined {
  const data = readSessions();
  return data.sessions.find(s => s.id === data.active);
}
export function leaveSession(): void {
  const data = readSessions();
  localStorage.setItem(sessionStorageKey(), JSON.stringify({ ...data, active: null }));
}
export function samePractice(session: StructuredSession, word: string, chunk?: string): boolean {
  return usageKey(session.word) === usageKey(word) && usageKey(session.usage?.chunk || session.word) === usageKey(chunk || word);
}
export function hasPractised(word: string, chunk?: string): boolean {
  return readSessions().sessions.some(s => samePractice(s, word, chunk) && !!s.scenario)
    || getWordAttempts(word).some(a => !a.discarded && a.source === 'conversation' && usageKey(a.chunk) === usageKey(chunk || word));
}
export function saveStructuredProgress(session: StructuredSession): void {
  if (session.owner !== learningOwner()) throw new Error('Practice owner changed');
  for (const attempt of structuredAttempts(session)) {
    if (!getWordAttempts(session.word).some(a => a.id === attempt.id)) {
      recordWordAttempt(attempt);
      if (attempt.id === `${session.id}:0`) {
        window.dispatchEvent(new CustomEvent('poortaal:structured-result', { detail: { word: session.word, owner: session.owner } }));
      }
    }
  }
}
export function clearStructuredWord(word: string): void {
  const data = readSessions(), sessions = data.sessions.filter(s => usageKey(s.word) !== usageKey(word));
  localStorage.setItem(sessionStorageKey(), JSON.stringify({ active: sessions.some(s => s.id === data.active) ? data.active : null, sessions }));
}
