export type TimedTranscript = {
  role: 'tutor' | 'user';
  startMs: number;
  endMs: number;
};

export const TRANSCRIPT_MERGE_GAP_MS = 1800;

function intervalGapMs(a: TimedTranscript, b: TimedTranscript): number {
  if (a.endMs < b.startMs) return b.startMs - a.endMs;
  if (b.endMs < a.startMs) return a.startMs - b.endMs;
  return 0;
}

function hasOppositeSpeechBetween(
  messages: TimedTranscript[],
  candidate: TimedTranscript,
  fragment: TimedTranscript,
): boolean {
  const earlier = candidate.startMs <= fragment.startMs ? candidate : fragment;
  const later = earlier === candidate ? fragment : candidate;
  if (earlier.endMs >= later.startMs) return false;
  return messages.some(message =>
    message.role !== fragment.role
    && message.startMs < later.startMs
    && message.endMs > earlier.endMs,
  );
}

export function findTranscriptGroupIndex(
  messages: TimedTranscript[],
  fragment: TimedTranscript,
  mergeGapMs = TRANSCRIPT_MERGE_GAP_MS,
): number {
  let bestIndex = -1;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let index = 0; index < messages.length; index += 1) {
    const candidate = messages[index];
    if (candidate.role !== fragment.role) continue;
    const gapMs = intervalGapMs(candidate, fragment);
    if (gapMs > mergeGapMs || hasOppositeSpeechBetween(messages, candidate, fragment)) continue;
    if (gapMs < bestGap) { bestGap = gapMs; bestIndex = index; }
  }
  return bestIndex;
}
