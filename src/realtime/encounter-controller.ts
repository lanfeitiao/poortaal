import { EncounterSession } from './encounter-session';
import { createGeneratedEncounter } from './encounter';
import { RealtimeClient } from './realtime-client';
import { supportContent } from './scaffolding';
import { buildBackendInstructions, buildTutorInstructions } from './tutor-policy';
import type { RealtimeConnectionState, RealtimeServerEvent, SupportLevel } from './types';

const API_BASE = 'https://poortaal-api.weilin1990.workers.dev';

let client: RealtimeClient | null = null;
let session: EncounterSession | null = null;
let active = false;
let generating = false;
let generationId = 0;
let completionShown = false;
type TranscriptTrack = { element: HTMLElement; text: string; endMs: number };
let userTranscript: TranscriptTrack | null = null;
let tutorTranscript: TranscriptTrack | null = null;
let inputActivityTimer: ReturnType<typeof setTimeout> | null = null;

function el(id: string): HTMLElement | null { return document.getElementById(id); }
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char)); }
function transcriptRoot(): HTMLElement | null { return el('voiceTranscript'); }
function setStatus(text: string): void { const status = el('voiceStatus'); if (status) status.textContent = text; }
function setButton(text: string): void { const button = el('voiceStartBtn'); if (button) button.textContent = text; }
function setVisualizer(visible: boolean): void { const visualizer = el('voiceVisualizer'); if (visualizer) visualizer.style.display = visible ? '' : 'none'; }
function createMessage(role: 'tutor' | 'user' | 'system', text: string): HTMLElement | null { const root = transcriptRoot(); if (!root) return null; root.style.display = 'flex'; const node = document.createElement('div'); node.className = `chat-msg ${role}`; node.textContent = text; root.appendChild(node); root.scrollTop = root.scrollHeight; return node; }
function appendMessage(role: 'tutor' | 'user' | 'system', text: string): void { if (text.trim()) createMessage(role, text.trim()); }
function resetPendingTranscriptMessages(): void { userTranscript = null; tutorTranscript = null; }

function renderEncounterIntro(): void {
  if (!session) return; const root = transcriptRoot(); if (!root) return; const encounter = session.encounter;
  resetPendingTranscriptMessages(); root.style.display = 'flex';
  root.innerHTML = `<div style="align-self:stretch;background:#fff;border:1px solid #DBEAFE;border-radius:14px;padding:14px 16px;margin-bottom:4px;"><div style="font-size:1.35rem;margin-bottom:4px;">${escapeHtml(encounter.emoji)} <strong>${escapeHtml(encounter.title)}</strong></div><div style="font-size:.9rem;color:#4B5563;margin-bottom:8px;">${escapeHtml(encounter.setup)}</div><div style="font-size:.82rem;color:#6B7280;">Try to use <strong>${escapeHtml(encounter.targetWord)}</strong> naturally.</div></div><div id="encounterSupport" style="align-self:stretch;"></div><div id="encounterActions" style="align-self:stretch;display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 8px;"></div>`;
  renderSupport();
}
function supportLabel(level: SupportLevel): string { switch (level) { case 'none': return ''; case 'meaning': return '💡 Thought'; case 'chunks': return '🧩 Pieces'; case 'frame': return '✍️ Sentence frame'; case 'model': return '🗣️ Borrow a line'; } }
function renderSupport(): void {
  if (!session) return; const support = el('encounterSupport'); const actions = el('encounterActions'); if (!support || !actions) return;
  const level = session.currentSupport; const content = supportContent(session.encounter, level);
  if (level === 'none' || content === null) support.innerHTML = '';
  else { const rendered = Array.isArray(content) ? content.map(part => `<span style="display:inline-block;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:999px;padding:4px 9px;margin:3px;">${escapeHtml(part)}</span>`).join('') : escapeHtml(content); support.innerHTML = `<div style="background:#F9FAFB;border-radius:12px;padding:10px 12px;margin:6px 0;font-size:.9rem;color:#374151;"><div style="font-size:.75rem;font-weight:600;color:#6B7280;margin-bottom:4px;">${supportLabel(level)}</div><div>${rendered}</div>${level === 'model' ? '<div style="font-size:.78rem;color:#6B7280;margin-top:6px;">Now make it yours.</div>' : ''}</div>`; }
  actions.innerHTML = '';
  if (level !== 'model') { const more = document.createElement('button'); more.type = 'button'; more.textContent = level === 'none' ? '💡 Need a nudge?' : 'A little more help →'; more.style.cssText = 'border:1px solid #BFDBFE;background:white;color:#2563EB;border-radius:10px;padding:8px 11px;font:inherit;font-size:.82rem;cursor:pointer;'; more.addEventListener('click', requestMoreSupport); actions.appendChild(more); }
  if (level !== 'none') { const hide = document.createElement('button'); hide.type = 'button'; hide.textContent = 'Let me try'; hide.style.cssText = 'border:0;background:transparent;color:#6B7280;padding:8px 5px;font:inherit;font-size:.82rem;cursor:pointer;'; hide.addEventListener('click', hideSupport); actions.appendChild(hide); }
}
function requestMoreSupport(): void { if (!session) return; session.requestMoreSupport(); renderSupport(); }
function hideSupport(): void { if (!session) return; session.hideSupport(); renderSupport(); }
function eventText(event: RealtimeServerEvent, ...keys: string[]): string { for (const key of keys) { const value = event[key]; if (typeof value === 'string') return value; } return ''; }
function eventNumber(event: RealtimeServerEvent, key: string): number { const value = event[key]; return typeof value === 'number' ? value : 0; }
function appendTranscriptDelta(role: 'tutor' | 'user', event: RealtimeServerEvent): string {
  const delta = eventText(event, 'delta'); if (!delta) return '';
  const startMs = eventNumber(event, 'start_ms'); const endMs = eventNumber(event, 'end_ms');
  let track = role === 'user' ? userTranscript : tutorTranscript;
  if (!track || (startMs > 0 && track.endMs > 0 && startMs - track.endMs > 1200)) {
    const element = createMessage(role, ''); if (!element) return '';
    track = { element, text: '', endMs: 0 };
    if (role === 'user') userTranscript = track; else tutorTranscript = track;
  }
  track.text += delta; track.endMs = Math.max(track.endMs, endMs); track.element.textContent = track.text;
  track.element.parentElement?.scrollTo({ top: track.element.parentElement.scrollHeight });
  return track.text;
}

function handleRealtimeEvent(event: RealtimeServerEvent): void {
  if (!session) return;
  switch (event.type) {
    case 'session.input_transcript.delta': {
      setStatus('Ik luister…'); setVisualizer(true);
      if (inputActivityTimer) clearTimeout(inputActivityTimer);
      inputActivityTimer = setTimeout(() => { setVisualizer(false); setStatus('Even denken…'); }, 900);
      const text = appendTranscriptDelta('user', event);
      if (text && session.recordProduction(text) && !completionShown) showCompletion();
      return;
    }
    case 'session.output_transcript.delta':
      if (inputActivityTimer) clearTimeout(inputActivityTimer);
      inputActivityTimer = null; setVisualizer(false); setStatus('Poortaal spreekt…');
      appendTranscriptDelta('tutor', event); return;
    case 'session.delegation.created': setStatus('Even denken…'); return;
    case 'error': setStatus('Er ging iets mis. Probeer opnieuw.'); return;
  }
}
function handleStateChange(state: RealtimeConnectionState): void { switch (state) { case 'requesting-microphone': setStatus('Microfoon openen…'); break; case 'connecting': setStatus('Verbinding maken…'); break; case 'ready': setStatus('De situatie begint…'); try { client?.send({ type: 'session.instructions.append', delegation_id: null, content: `Speak first in Dutch with exactly this opening line, then listen: ${session?.encounter.openingLine || ''}` }); } catch (error) { console.error('Could not start encounter:', error); } break; case 'error': setStatus('Verbinding mislukt. Probeer opnieuw.'); break; case 'closed': if (active) setStatus('Sessie beëindigd'); break; } }
function showCompletion(): void { if (!session) return; completionShown = true; const evidence = session.evidence; const independent = evidence.maxSupportUsed === 'none'; appendMessage('system', independent ? `🌼 ${evidence.targetWord} bloeit — you used it on your own.` : `🌿 Nice — you used ${evidence.targetWord} with some support.`); if (evidence.learnerSentence) appendMessage('system', `“${evidence.learnerSentence}”`); setStatus('Mooi gedaan. Je kunt stoppen of nog even doorgaan.'); }

export async function toggleRealtimeEncounter(): Promise<void> {
  if (active || generating) { stopRealtimeEncounter(); return; }
  const word = el('voicePracticeWord')?.textContent?.trim() || ''; if (!word) { setStatus('Kies eerst een woord.'); return; }

  const requestId = ++generationId; generating = true; setStatus('Een situatie bedenken…'); setButton('Annuleren');
  const encounter = await createGeneratedEncounter(word);
  if (requestId !== generationId) return;
  generating = false; session = new EncounterSession(encounter, 'none'); completionShown = false; renderEncounterIntro(); setButton('■ Stop encounter'); active = true;
  client = new RealtimeClient({ apiBase: API_BASE, word, instructions: buildTutorInstructions(encounter), backendInstructions: buildBackendInstructions(encounter), onEvent: handleRealtimeEvent, onStateChange: handleStateChange });
  try { await client.connect(); } catch (error) { console.error('GPT-Live connection failed:', error); appendMessage('system', 'Could not start the voice encounter. Please try again.'); stopRealtimeEncounter(false); }
}
export function stopRealtimeEncounter(resetStatus = true): void { generationId += 1; generating = false; if (inputActivityTimer) clearTimeout(inputActivityTimer); inputActivityTimer = null; client?.disconnect(); client = null; active = false; resetPendingTranscriptMessages(); setVisualizer(false); setButton('🎙️ Start encounter'); if (resetStatus) setStatus('Klaar voor een korte encounter'); }
