import { analyzeDailyChat, type ChatTurn } from './daily-chat-feedback.ts';
import { action, line, renderCards } from './daily-chat-cards.ts';
import { learningOwner } from './learning-store.ts';
import { DailyChatVoice } from './daily-chat-voice.ts';
import { renderDailyChatVersion } from './daily-chat-details.ts';

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
  line(panel, 'Talk about your day in Dutch. Get feedback on useful expressions after you finish.').className = 'daily-chat-intro';
  renderDailyChatVersion(panel);
  action(panel, 'Start conversation', () => start(apiBase, panel)).classList.add('daily-chat-start');
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
    renderDailyChatVersion(panel);
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
  renderDailyChatVersion(panel);
  const status = line(panel, 'Connecting…');
  status.className = 'daily-chat-status';
  status.setAttribute('role', 'status');
  const transcript = line(panel, '', 'div');
  transcript.className = 'chat-messages daily-chat-transcript';
  transcript.setAttribute('role', 'region');
  transcript.setAttribute('aria-label', 'Conversation transcript');
  transcript.tabIndex = 0;
  const startFailed = () => {
    if (!current() || voice !== connection) return;
    connection.close(); voice = null; end.remove();
    status.textContent = 'Could not start the conversation. Check microphone access and try again.';
    action(panel, 'Try again', () => start(apiBase, panel));
  };
  const connection: DailyChatVoice = new DailyChatVoice(apiBase, text => {
    status.textContent = text;
    end.textContent = 'End conversation';
  },
    turns => renderTranscript(transcript, turns), () => {
      if (connection.started) void feedback(connection.reviewTurns(false), 'The connection was interrupted.');
      else startFailed();
    });
  voice = connection;
  const end = action(panel, 'Cancel', () => {
    if (!connection.started) { restart(); return; }
    end.disabled = true; status.textContent = 'Saving your last words…';
    void connection.finish().then(turns => feedback(turns));
  });
  end.classList.add('daily-chat-end', 'secondary');
  void connection.connect().catch(() => {
    if (!connection.started) startFailed();
  });
}

function renderTranscript(transcript: HTMLElement, turns: ChatTurn[]): void {
  const scrollTop = transcript.scrollTop;
  const following = transcript.scrollHeight - transcript.clientHeight - scrollTop < 32;
  transcript.replaceChildren(...turns.map(turn => {
    const bubble = document.createElement('div');
    const isLearner = turn.role === 'user';
    bubble.className = 'chat-msg ' + (isLearner ? 'user' : 'tutor');
    line(bubble, isLearner ? 'You' : 'Poortaal', 'span').className = 'daily-chat-speaker';
    line(bubble, turn.content);
    return bubble;
  }));
  transcript.scrollTop = following ? transcript.scrollHeight : scrollTop;
}
