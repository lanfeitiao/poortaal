import { DAILY_CHAT_ANALYSIS_MODEL } from './daily-chat-feedback.ts';
import { line } from './daily-chat-cards.ts';

export function renderDailyChatVersion(panel: HTMLElement): void {
  const build = document.querySelector('meta[name="poortaal-build"]')?.getAttribute('content') || 'local';
  line(panel, `Build ${build} · Analysis model: ${DAILY_CHAT_ANALYSIS_MODEL}`).className = 'daily-chat-version';
}
