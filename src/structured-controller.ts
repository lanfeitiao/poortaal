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
  async request(): Promise<void> {
    const s = this.session;
    if (!s || this.busy || !['prepare', 'answer'].includes(s.phase)) return;
    if (s.phase === 'answer' && !currentRound(s).draft.trim()) {
      this.error = 'Schrijf eerst je antwoord in het Nederlands.'; this.notify(); return;
    }
    const ticket = ++this.ticket;
    const current = () => ticket === this.ticket && s.owner === learningOwner() && this.session?.id === s.id;
    this.busy = true; this.error = ''; this.notify();
    const run = async () => {
      if (!current()) return;
      const round = currentRound(this.session!);
      const pending = s.phase === 'prepare' ? 'scenario' : 'feedback';
      this.write({ ...this.session!, pending, rounds: this.session!.rounds.map((r, i) =>
        i !== s.round || pending === 'scenario' ? r : { ...r, submitted: round.draft.trim(), submittedAt: r.submittedAt ?? Date.now() }) });
      const snapshot = this.session!;
      if (pending === 'scenario') {
        const previous = readSessions().sessions.filter(p => samePractice(p, s.word, s.usage?.chunk))
          .flatMap(p => p.scenario ? [p.scenario.situation] : []);
        const scenario = await generateScenario(snapshot, previous, this.chat);
        if (current()) this.write({ ...this.session!, scenario, pending: null, phase: s.mode === 'guided' ? 'guide' : 'answer' });
      } else {
        const feedback = await evaluateResponse(snapshot, this.chat);
        if (!current()) return;
        this.write({ ...this.session!, pending: null, phase: 'feedback',
          rounds: this.session!.rounds.map((r, i) => i === s.round ? { ...r, feedback } : r) });
        this.syncProgress();
      }
    };
    try {
      // Web Locks prevent two open tabs from requesting feedback for the same session.
      if (typeof navigator !== 'undefined' && navigator.locks) {
        await navigator.locks.request(`poortaal-practice:${s.owner}:${s.id}`, { ifAvailable: true }, async lock => {
          if (!lock) throw new Error('Practice request already running');
          await run();
        });
      } else await run();
    } catch {
      if (current()) this.error = 'De aanvraag is niet gelukt. Je bewaarde antwoord blijft staan. Probeer de aanvraag opnieuw.';
    } finally {
      if (current()) { this.busy = false; this.notify(); }
    }
  }
}
