import { RealtimeClient } from './realtime/realtime-client.ts';
import { groupTranscriptFragments, type TranscriptFragment } from './realtime/transcript-grouping.ts';
import { createTranscriptFragment } from './realtime/transcript-timing.ts';
import { waitForTranscriptIdle } from './realtime/transcript-settle.ts';
import type { ChatTurn } from './daily-chat-feedback.ts';

const instructions = `You are a warm Dutch conversation partner for an A2–B1 learner.
Open with one short Dutch question about their day. Follow details they actually mention.
Use one or two short Dutch sentences and at most one follow-up question per turn.
Let the learner speak most of the time. Allow thinking pauses and self-corrections.
If they ask how to say something, offer one short Dutch phrasing and continue the topic.
Understand English or Chinese if they get stuck. Focus on meaning during the chat.
When they ask to finish, give a short goodbye.`;

export class DailyChatVoice {
  private readonly client: RealtimeClient;
  private readonly fragments: TranscriptFragment[] = [];
  private lastCaption = -Infinity;
  private closed = false;
  private ending = false;
  private established = false;

  get started(): boolean { return this.established; }

  constructor(apiBase: string, update: (status: string) => void, render: (turns: ChatTurn[]) => void,
    interrupted: () => void) {
    this.client = new RealtimeClient({
      apiBase, word: '', instructions, backendInstructions: instructions,
      onStateChange: state => {
        if (this.closed) return;
        if (state === 'ready' && !this.ending) {
          this.established = true;
          update('Connected. Waiting for the greeting…');
        }
        if (state === 'listening' && !this.ending) update('Microphone on. You can speak.');
        if (state === 'closed' || state === 'error') {
          this.close();
          if (!this.ending) interrupted();
        }
      },
      onEvent: event => {
        if (this.closed || typeof event.delta !== 'string' || !event.delta) return;
        const role = event.type === 'session.input_transcript.delta' ? 'user'
          : event.type === 'session.output_transcript.delta' ? 'tutor' : null;
        if (!role) return;
        this.lastCaption = performance.now();
        this.fragments.push(createTranscriptFragment(this.fragments, role, event.delta, this.fragments.length,
          this.lastCaption, event.start_ms ?? event.startMs, event.end_ms ?? event.endMs));
        render(this.turns());
      },
    });
  }

  connect(): Promise<void> { return this.client.connect(); }

  turns(): ChatTurn[] {
    return groupTranscriptFragments(this.fragments).map(group => ({
      role: group.role === 'user' ? 'user' : 'assistant',
      content: group.text,
    }));
  }

  async finish(): Promise<ChatTurn[]> {
    this.ending = true;
    this.client.pauseInput();
    const settled = await waitForTranscriptIdle(() => this.lastCaption, () => !this.closed);
    this.close();
    return this.reviewTurns(settled);
  }

  reviewTurns(settled: boolean): ChatTurn[] {
    const turns = this.turns();
    if (!settled && turns.at(-1)?.role === 'user') return turns.slice(0, -1);
    return turns;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.client.disconnect();
  }
}
