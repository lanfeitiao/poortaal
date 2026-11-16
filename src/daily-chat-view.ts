import { analyzeDailyChat, type ChatTurn } from './daily-chat-feedback.ts';
import { action, line, renderCards } from './daily-chat-cards.ts';
import { learningOwner } from './learning-store.ts';
import { DailyChatVoice } from './daily-chat-voice.ts';

const root = () => document.getElementById('dailyChatBody');
let voice: DailyChatVoice | null = null;
let revision = 0;

export function leaveDailyChat(reset = false): void {
  if (!voice && !reset) return;
  revision++;
  voice?.close(); voice = null;
  root()?.replaceChildren();
}

export function showDailyChat(apiBase: string): void {
  const panel = root();
  if (!panel || panel.hasChildNodes()) return;
  line(panel, 'Talk about your day in Dutch.');
  action(panel, 'Start conversation', () => start(apiBase, panel));
}

function start(apiBase: string, panel: HTMLElement): void {
  leaveDailyChat(true);
  const ticket = revision;
  const owner = learningOwner(), id = crypto.randomUUID();
  const current = () => revision === ticket && learningOwner() === owner;
  const restart = () => { leaveDailyChat(true); showDailyChat(apiBase); };
  const feedback = async (turns: ChatTurn[], notice = '') => {
    if (!current()) return;
    voice = null;
    panel.replaceChildren();
    if (notice) line(panel, notice);
    const result = document.createElement('div');
    result.setAttribute('aria-live', 'polite'); panel.append(result);
    line(result, 'Reviewing your conversation…');
    action(panel, 'New conversation', restart);
    try {
      const cards = await analyzeDailyChat(apiBase, turns);
      if (current()) renderCards(result, cards, owner, id);
    } catch {
      if (!current()) return;
      result.textContent = 'Feedback could not load.';
      action(result, 'Retry feedback', () => { void feedback(turns, notice); });
    }
  };
  const status = line(panel, 'Connecting…');
  status.setAttribute('role', 'status');
  const transcript = line(panel, '', 'div');
  transcript.className = 'chat-messages voice-transcript';
  transcript.style.display = 'flex';
  const connection: DailyChatVoice = new DailyChatVoice(apiBase, text => { status.textContent = text; },
    turns => transcript.replaceChildren(...turns.map(turn => {
      const bubble = document.createElement('p');
      bubble.textContent = (turn.role === 'user' ? 'You · ' : 'Poortaal · ') + turn.content;
      return bubble;
    })), () => { void feedback(connection.reviewTurns(false), 'The connection was interrupted.'); });
  voice = connection;
  const end = action(panel, 'End conversation', () => {
    end.disabled = true; status.textContent = 'Saving your last words…';
    void connection.finish().then(turns => feedback(turns));
  });
  void connection.connect().catch(() => {
    if (!current() || voice !== connection || end.disabled) return;
    connection.close(); voice = null; end.disabled = true;
    status.textContent = 'Could not start the conversation. Check microphone access and try again.';
    action(panel, 'Try again', restart);
  });
}
