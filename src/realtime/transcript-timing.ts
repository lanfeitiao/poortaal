import type { TranscriptFragment, TranscriptRole } from './transcript-grouping.ts';
import { isShortAcknowledgment, looksLikeCaptionContinuation } from './transcript-grouping.ts';

function audioTime(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function createTranscriptFragment(
  fragments: TranscriptFragment[],
  role: TranscriptRole,
  text: string,
  sequence: number,
  receivedAtMs: number,
  rawStart: unknown,
  rawEnd: unknown,
): TranscriptFragment {
  let start = audioTime(rawStart);
  let end = audioTime(rawEnd);
  if (start !== undefined && end !== undefined && end < start) start = end = undefined;
  // Missing audio timing cannot establish a real turn boundary. Estimate elapsed
  // session time, explicitly marked, rather than fabricating a 1 ms caption gap.
  // Keep inferred continuations at their prefix end: delivery delay does not
  // measure speech duration and must not carry a tail across a later turn.
  // Other untimed speech resumes at the timeline end with elapsed receipt time.
  const latest = fragments.at(-1);
  let prefixIndex = fragments.length - 1;
  while (prefixIndex >= 0 && fragments[prefixIndex].role !== role) prefixIndex -= 1;
  const prefix = fragments[prefixIndex];
  const intervening = fragments.slice(prefixIndex + 1);
  const acknowledgmentOnly = !intervening.length || isShortAcknowledgment({
    role: latest!.role,
    startMs: Math.min(...intervening.map(part => part.startMs)),
    endMs: Math.max(...intervening.map(part => part.endMs)),
    text: intervening.map(part => part.text).join(''), sequences: [],
  }, true);
  const continuation = !!prefix && acknowledgmentOnly
    && receivedAtMs - (prefix.receivedAtMs ?? receivedAtMs) <= 2000
    && looksLikeCaptionContinuation(prefix.text, text);
  const anchorMs = continuation ? prefix.endMs
    : fragments.reduce((max, part) => Math.max(max, part.endMs), 0);
  const estimatedMs = continuation ? anchorMs : latest
    ? anchorMs + Math.max(0, receivedAtMs - (latest.receivedAtMs ?? receivedAtMs))
    : 0;
  return {
    role, text, sequence, receivedAtMs,
    startMs: start ?? end ?? estimatedMs,
    endMs: end ?? start ?? estimatedMs,
    timingSource: start !== undefined && end !== undefined ? 'audio'
      : start !== undefined || end !== undefined ? 'partial' : 'estimated',
  };
}
