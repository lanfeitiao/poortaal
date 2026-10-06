import { EncounterSession } from './encounter-session';
import { createGeneratedEncounter } from './encounter';
import { RealtimeClient } from './realtime-client';
import { supportContent } from './scaffolding';
import { groupTranscriptFragments, type TranscriptFragment, type TranscriptGroup } from './transcript-grouping';
import { createTranscriptFragment } from './transcript-timing';
import { buildBackendInstructions, buildTutorInstructions } from './tutor-policy';
import type { RealtimeConnectionState, RealtimeServerEvent, SupportLevel } from './types';
import { getPracticeContext, markPracticeHelp } from '../practice-context';
import { getWordAttempts, learningOwner } from '../learning-store';
import { resetPracticeFeedback, finishPracticeFeedback } from '../practice-feedback';
import { waitForTranscriptIdle } from './transcript-settle';

const API_BASE = 'https://poortaal-api.weilin1990.workers.dev';

let client: RealtimeClient | null = null;
let session: EncounterSession | null = null;
let active = false;
let generating = false;
let generationId = 0;
let completionShown = false;
type TranscriptRole = 'tutor' | 'user';
const timelineTranscriptFragments: TranscriptFragment[] = [];
const transcriptNodes = new Map<number, HTMLElement>();
let transcriptSequence = 0;
let latestTranscriptActivityMs = -1;
let latestUserActivityMs = -1;
let latestTranscriptRole: TranscriptRole | null = null;
let microphoneReady = false;
let transcriptIdleTimer: ReturnType<typeof setTimeout> | null = null;
let completionTimer: ReturnType<typeof setTimeout> | null = null;
let completionBannerNode: HTMLElement | null = null;
let completionSentenceNode: HTMLElement | null = null;
let finishing = false;
let lastCaptionReceivedAtMs = 0;
let connectionFailed = false;

function el(id: string): HTMLElement | null { return document.getElementById(id); }
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char)); }
function transcriptRoot(): HTMLElement | null { return el('voiceTranscript'); }
function setStatus(text: string): void { const status = el('voiceStatus'); if (status) status.textContent = text; }
function setButton(text: string): void { const button = el('voiceStartBtn'); if (button) button.textContent = text; }
function setVisualizer(visible: boolean): void { const visualizer = el('voiceVisualizer'); if (visualizer) visualizer.style.display = visible ? '' : 'none'; }
// Captions are not playback-end events. Keep actual microphone availability
// visible even if the opening's last caption arrives after input is restored.
function tutorActivityStatus(): string { return microphoneReady ? 'Microfoon aan — je kunt spreken.' : 'Poortaal spreekt…'; }
function createMessage(role: 'tutor' | 'user' | 'system', text: string): HTMLElement | null { const root = transcriptRoot(); if (!root) return null; root.style.display = 'flex'; const node = document.createElement('div'); node.className = `chat-msg ${role}`; node.textContent = text; root.appendChild(node); root.scrollTop = root.scrollHeight; return node; }
function appendMessage(role: 'tutor' | 'user' | 'system', text: string): void { if (text.trim()) createMessage(role, text.trim()); }
function resetTranscriptState(): void { timelineTranscriptFragments.length = 0; transcriptNodes.clear(); transcriptSequence = 0; latestTranscriptActivityMs = -1; latestUserActivityMs = -1; latestTranscriptRole = null; if (transcriptIdleTimer) clearTimeout(transcriptIdleTimer); transcriptIdleTimer = null; if (completionTimer) clearTimeout(completionTimer); completionTimer = null; completionBannerNode = null; completionSentenceNode = null; }

function renderEncounterIntro(): void {
  if (!session) return; const root = transcriptRoot(); if (!root) return; const encounter = session.encounter;
  microphoneReady = false; resetTranscriptState(); root.style.display = 'flex';
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
function requestMoreSupport(): void { if (!session) return; markPracticeHelp(); session.requestMoreSupport(); renderSupport(); }
function hideSupport(): void { if (!session) return; session.hideSupport(); renderSupport(); }
function eventText(event: RealtimeServerEvent, ...keys: string[]): string { for (const key of keys) { const value = event[key]; if (typeof value === 'string') return value; } return ''; }
function eventNumber(event: RealtimeServerEvent, ...keys: string[]): number | undefined { for (const key of keys) { const value = event[key]; if (typeof value === 'number') return value; } return undefined; }
function scheduleCompletion(delayMs = 900): void {
  if (completionShown) return;
  if (completionTimer) clearTimeout(completionTimer);
  completionTimer = setTimeout(() => {
    completionTimer = null;
    if (session?.evidence.successfulProduction) showCompletion();
  }, delayMs);
}
function restoreActivityStatus(): void {
  if (latestTranscriptRole === 'tutor') {
    setVisualizer(microphoneReady);
    setStatus(tutorActivityStatus());
  } else if (latestTranscriptRole === 'user' && transcriptIdleTimer) {
    setVisualizer(true);
    setStatus('Ik luister…');
  } else {
    setVisualizer(false);
    setStatus('Even denken…');
  }
}
function updateTranscriptActivity(role: TranscriptRole, event: RealtimeServerEvent): void {
  const activityMs = eventNumber(event, 'end_ms', 'endMs') ?? latestTranscriptActivityMs + 1;
  if (role === 'user' && activityMs >= latestUserActivityMs) {
    latestUserActivityMs = activityMs;
    scheduleCompletion();
  }
  if (activityMs < latestTranscriptActivityMs) return;
  latestTranscriptActivityMs = activityMs;
  latestTranscriptRole = role;
  if (transcriptIdleTimer) clearTimeout(transcriptIdleTimer);
  transcriptIdleTimer = null;
  setVisualizer(role === 'user' || microphoneReady);
  setStatus(role === 'user' ? 'Ik luister…' : tutorActivityStatus());
  if (role === 'user') {
    transcriptIdleTimer = setTimeout(() => {
      if (latestTranscriptActivityMs !== activityMs) return;
      setVisualizer(false);
      transcriptIdleTimer = null;
      if (completionShown) setStatus('Mooi gedaan. Je kunt stoppen of nog even doorgaan.');
      else if (!session?.evidence.successfulProduction) setStatus('Even denken…');
    }, 900);
  }
}
function clearCompletion(): void {
  completionBannerNode?.remove();
  completionSentenceNode?.remove();
  completionBannerNode = null;
  completionSentenceNode = null;
  completionShown = false;
  if (completionTimer) clearTimeout(completionTimer);
  completionTimer = null;
  restoreActivityStatus();
}
function reconcileProduction(groups: TranscriptGroup[]): void {
  if (!session) return;
  const wasSuccessful = session.evidence.successfulProduction;
  const previousSentence = session.evidence.learnerSentence;
  session.evidence.successfulProduction = false;
  session.evidence.learnerSentence = undefined;
  for (const group of groups) {
    if (group.role === 'user' && session.recordProduction(group.text)) break;
  }
  if (!session.evidence.successfulProduction) {
    if (completionShown) clearCompletion();
    return;
  }
  if (!wasSuccessful && !completionShown && !completionTimer) scheduleCompletion();
  if (completionShown && previousSentence !== session.evidence.learnerSentence) refreshCompletionMessages();
}
function appendTimelineTranscriptDelta(role: TranscriptRole, event: RealtimeServerEvent): string {
  const delta = eventText(event, 'delta'); if (!delta) return '';
  lastCaptionReceivedAtMs = performance.now();
  const sequence = transcriptSequence++;
  const fragment = createTranscriptFragment(
    timelineTranscriptFragments, role, delta, sequence, performance.now(),
    event.start_ms ?? event.startMs, event.end_ms ?? event.endMs,
  );
  timelineTranscriptFragments.push(fragment);

  const groups = groupTranscriptFragments(timelineTranscriptFragments);
  if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) {
    console.debug('[Poortaal transcript]', {
      role, delta, start_ms: event.start_ms ?? event.startMs,
      end_ms: event.end_ms ?? event.endMs, receivedAtMs: fragment.receivedAtMs,
      timingSource: fragment.timingSource,
      groupSequences: groups.find(group => group.sequences.includes(sequence))?.sequences,
    });
  }
  reconcileProduction(groups);
  const root = transcriptRoot(); if (!root) return '';
  const activeKeys = new Set<number>();
  const orderedNodes: HTMLElement[] = [];
  let currentText = '';

  for (const group of groups) {
    const key = Math.min(...group.sequences);
    activeKeys.add(key);
    let node = transcriptNodes.get(key);
    if (!node) {
      node = createMessage(group.role, '') || undefined;
      if (!node) continue;
      node.setAttribute('data-transcript-message', 'current');
      transcriptNodes.set(key, node);
    }
    node.className = `chat-msg ${group.role}`;
    node.textContent = group.text;
    orderedNodes.push(node);
    if (group.sequences.includes(sequence)) currentText = group.text;
  }

  for (const [key, node] of transcriptNodes) {
    if (!activeKeys.has(key)) { node.remove(); transcriptNodes.delete(key); }
  }
  for (let index = orderedNodes.length - 2; index >= 0; index -= 1) {
    const node = orderedNodes[index]; const next = orderedNodes[index + 1];
    if (node.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_PRECEDING) root.insertBefore(node, next);
  }
  root.scrollTop = root.scrollHeight;
  return currentText;
}
function handleRealtimeEvent(event: RealtimeServerEvent): void {
  if (!session) return;
  switch (event.type) {
    case 'session.input_transcript.delta':
      if (!finishing) updateTranscriptActivity('user', event);
      appendTimelineTranscriptDelta('user', event);
      return;
    case 'session.output_transcript.delta':
      if (!finishing) updateTranscriptActivity('tutor', event);
      appendTimelineTranscriptDelta('tutor', event); return;
    case 'session.delegation.created':
      if (finishing) return;
      if (transcriptIdleTimer) clearTimeout(transcriptIdleTimer);
      transcriptIdleTimer = null; setVisualizer(false); setStatus('Even denken…'); return;
    case 'error':
      connectionFailed = true;
      if (!finishing) setStatus('Er ging iets mis. Probeer opnieuw.');
      return;
  }
}
function handleStateChange(state: RealtimeConnectionState): void {
  if (state === 'error' || (state === 'closed' && active)) connectionFailed = true;
  if (finishing) return;
  switch (state) {
    case 'requesting-microphone': setStatus('Microfoon openen…'); break;
    case 'connecting': setStatus('Verbinding maken…'); break;
    case 'ready':
      setStatus('De situatie begint…');
      try {
        client?.send({ type: 'session.instructions.append', event_id: 'encounter-opening', delegation_id: null,
          content: `Speak first now in Dutch with exactly this opening line, once, then listen silently: ${session?.encounter.openingLine || ''}` });
      } catch (error) { console.error('Could not start encounter:', error); }
      break;
    case 'listening': microphoneReady = true; setVisualizer(true); setStatus('Ik luister…'); break;
    case 'error': microphoneReady = false; setVisualizer(false); setStatus('Verbinding mislukt. Probeer opnieuw.'); break;
    case 'closed': microphoneReady = false; setVisualizer(false); if (active) setStatus('Sessie beëindigd'); break;
  }
}
function refreshCompletionMessages(): void {
  if (!session) return;
  const evidence = session.evidence;
  const independent = evidence.maxSupportUsed === 'none';
  const banner = independent ? `Je gebruikte “${evidence.targetWord}”. Je kunt nog even doorgaan.` : `Je gebruikte “${evidence.targetWord}” met een hint. Je kunt nog even doorgaan.`;
  if (!completionBannerNode) completionBannerNode = createMessage('system', banner);
  else completionBannerNode.textContent = banner;
  if (evidence.learnerSentence) {
    if (!completionSentenceNode) completionSentenceNode = createMessage('system', '');
    if (completionSentenceNode) completionSentenceNode.textContent = `“${evidence.learnerSentence}”`;
  } else {
    completionSentenceNode?.remove();
    completionSentenceNode = null;
  }
}
function showCompletion(): void {
  if (!session || !session.evidence.successfulProduction) return;
  completionShown = true;
  if (completionTimer) clearTimeout(completionTimer);
  completionTimer = null;
  refreshCompletionMessages();
  if (latestTranscriptRole !== 'tutor') {
    setVisualizer(false);
    setStatus('Mooi gedaan. Je kunt stoppen of nog even doorgaan.');
  }
}

export async function toggleRealtimeEncounter(): Promise<void> {
  if (finishing) return;
  if (active) { await finishRealtimeEncounter(); return; }
  if (generating) { stopRealtimeEncounter(); return; }
  const word = el('voicePracticeWord')?.textContent?.trim() || ''; if (!word) { setStatus('Kies eerst een woord.'); return; }

  resetPracticeFeedback(); connectionFailed = false;
  const context = getPracticeContext();
  const requestId = ++generationId; generating = true; setStatus('Een situatie bedenken…'); setButton('Annuleren');
  const encounter = await createGeneratedEncounter(word, context?.usage, getWordAttempts(word));
  if (requestId !== generationId) return;
  generating = false; session = new EncounterSession(encounter, 'none'); completionShown = false; renderEncounterIntro(); setButton('■ Stop encounter'); active = true;
  if (context?.helpUsed) session.evidence.maxSupportUsed = 'model';
  client = new RealtimeClient({ apiBase: API_BASE, word, instructions: buildTutorInstructions(encounter), backendInstructions: buildBackendInstructions(encounter), onEvent: handleRealtimeEvent, onStateChange: handleStateChange });
  try { await client.connect(); } catch (error) { console.error('GPT-Live connection failed:', error); appendMessage('system', 'Could not start the voice encounter. Please try again.'); stopRealtimeEncounter(false); }
}
async function finishRealtimeEncounter(): Promise<void> {
  const context = getPracticeContext();
  const currentClient = client; const currentSession = session;
  if (!context || !currentClient || !currentSession || (!microphoneReady && !timelineTranscriptFragments.some(f => f.role === 'user'))) {
    stopRealtimeEncounter(); return;
  }
  const token = generationId; const owner = learningOwner();
  const current = () => token === generationId && client === currentClient && session === currentSession;
  finishing = true; microphoneReady = false;
  currentClient.pauseInput(); setVisualizer(false); setButton('Gesprek afronden…');
  const button = el('voiceStartBtn') as HTMLButtonElement | null;
  if (button) button.disabled = true;
  setStatus('Je laatste woorden verwerken…');
  const settled = await waitForTranscriptIdle(() => lastCaptionReceivedAtMs, current);
  if (!current()) return;
  const turns = groupTranscriptFragments(timelineTranscriptFragments).map(g => ({
    role: g.role === 'user' ? 'user' as const : 'assistant' as const, content: g.text,
  }));
  const snapshot = { ...context, id: currentSession.encounter.id, owner, turns,
    supportUsed: context.helpUsed || currentSession.evidence.maxSupportUsed !== 'none', settled: settled && !connectionFailed };
  stopRealtimeEncounter();
  void finishPracticeFeedback(snapshot);
}
export function stopRealtimeEncounter(resetStatus = true): void {
  generationId += 1; generating = false; finishing = false;
  if (completionTimer && session?.evidence.successfulProduction && !completionShown) showCompletion();
  if (transcriptIdleTimer) clearTimeout(transcriptIdleTimer); transcriptIdleTimer = null;
  if (completionTimer) clearTimeout(completionTimer); completionTimer = null;
  client?.disconnect(); client = null; active = false;
  const button = el('voiceStartBtn') as HTMLButtonElement | null;
  if (button) button.disabled = false;
  setVisualizer(false); setButton('🎙️ Start encounter');
  if (resetStatus) setStatus('Klaar voor een korte encounter');
}
export function consumeRealtimePracticeCompletion(): boolean { const completed = completionShown; completionShown = false; return completed; }
export function resetRealtimeEncounterUi(): void { const root = transcriptRoot(); if (root) { root.innerHTML = ''; root.style.display = 'none'; } session = null; completionShown = false; resetTranscriptState(); setVisualizer(false); setButton('🎙️ Start encounter'); setStatus('Druk op de knop om te beginnen'); }
