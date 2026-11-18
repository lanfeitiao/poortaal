import { DAILY_CHAT_ANALYSIS_MODEL, type ChatTurn, type DailyChatAnalysis } from './daily-chat-feedback.ts';
import { line } from './daily-chat-cards.ts';

export function renderDailyChatVersion(panel: HTMLElement): void {
  const build = document.querySelector('meta[name="poortaal-build"]')?.getAttribute('content') || 'local';
  line(panel, `Build ${build} · Analysis model: ${DAILY_CHAT_ANALYSIS_MODEL}`).className = 'daily-chat-version';
}

export function renderDailyChatDetails(panel: HTMLElement, turns: ChatTurn[], analysis?: DailyChatAnalysis): void {
  const details = document.createElement('details');
  line(details, 'Conversation details', 'summary');
  const learner = turns.filter(turn => turn.role === 'user' && turn.content.trim()).length;
  const partner = turns.filter(turn => turn.role === 'assistant' && turn.content.trim()).length;
  line(details, `Your turns: ${learner} · Poortaal turns: ${partner}`);
  if (analysis) line(details, `Model proposed ${analysis.candidates} · Kept ${analysis.retained}`);
  const transcript = line(details, '', 'div');
  transcript.className = 'daily-chat-transcript';
  transcript.setAttribute('role', 'region');
  transcript.setAttribute('aria-label', 'Finished conversation transcript');
  transcript.tabIndex = 0;
  for (const turn of turns) line(transcript, `${turn.role === 'user' ? 'You' : 'Poortaal'}: ${turn.content}`);
  panel.append(details);
}
