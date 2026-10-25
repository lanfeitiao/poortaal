import { learningOwner } from './learning-store.ts';
import { evaluateResponse, generateScenario, type CompleteChat } from './structured-ai.ts';
import { advanceSession, createSession, currentRound, type StructuredSession } from './structured-session.ts';
import { activeSession, hasPractised, leaveSession, readSessions, samePractice, saveSession, saveStructuredProgress } from './structured-store.ts';
import type { WordUsage } from './word-usage.ts';

export class StructuredPractice {
  session: StructuredSession | null = null;
  busy = false;
  error = '';
  private ticket = 0;
  constructor(private notify: () => void, private chat?: CompleteChat) {}
  private write(next: StructuredSession): void { this.session = saveSession(next); }
  private fail(): void { this.error = 'Opslaan of laden is niet gelukt. Probeer opnieuw. Je bewaarde antwoord blijft staan.'; }
  stop(leave = false): void {
    if (leave && this.session?.owner === learningOwner()) {
      try { leaveSession(); } catch { /* The session remains resumable. */ }
    }
    this.ticket++; this.session = null; this.busy = false; this.error = ''; this.notify();
  }
  restore(): boolean {
    const saved = activeSession();
    if (!saved) return false;
    this.stop(); this.session = saved;
    this.syncProgress(); this.notify();
    return true;
  }
  async start(word: string, usage?: WordUsage, helped = false): Promise<void> {
    this.stop();
    const saved = readSessions().sessions.findLast(s => samePractice(s, word, usage?.chunk) && s.phase !== 'complete');
    try {
      this.write(saved ? { ...saved, supportUsed: saved.supportUsed || helped }
        : createSession(learningOwner(), word, usage, !hasPractised(word, usage?.chunk), helped));
      this.syncProgress(); this.notify();
      if (this.session?.phase === 'prepare' && !this.session.pending) await this.request();
    } catch { this.fail(); this.notify(); }
  }
  syncProgress(): void {
    try { if (this.session) saveStructuredProgress(this.session); this.error = ''; }
    catch { this.error = 'Je feedback is bewaard. Je leerresultaat kon nog niet worden opgeslagen. Probeer opslaan opnieuw.'; }
  }
  draft(value: string): void {
    const s = this.session;
    if (!s || this.busy || s.phase !== 'answer' || value.length > 2000) return;
    try {
      const rounds = s.rounds.map((r, i) => i === s.round ? { draft: value, hintsUsed: r.hintsUsed } : r);
      this.write({ ...s, rounds, pending: null }); this.error = '';
    } catch { this.fail(); }
    // Keep the textarea and caret in place during typing.
  }
  hint(): void {
    const s = this.session;
    if (!s || this.busy || s.phase !== 'answer' || currentRound(s).hintsUsed >= 3) return;
    this.mutate(() => ({ ...s, rounds: s.rounds.map((r, i) => i === s.round ? { ...r, hintsUsed: r.hintsUsed + 1 } : r) }));
  }
  support(): void {
    if (this.session && !this.session.supportUsed && this.session.phase !== 'complete') {
      this.mutate(() => ({ ...this.session!, supportUsed: true }));
    }
  }
  advance(action: 'continue' | 'retry' | 'skip' | 'finish'): void {
    if (!this.session || this.busy) return;
    this.mutate(() => { saveStructuredProgress(this.session!); return advanceSession(this.session!, action); });
  }
  private mutate(next: () => StructuredSession): void {
    try { this.write(next()); this.error = ''; } catch { this.fail(); }
    this.notify();
  }
}
