import type { TranscriptFragment, TranscriptRole } from './transcript-grouping.ts';

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
  // A late audio-timed fragment reanchors its following untimed continuation.
  // The greatest timeline end may belong to a much older-delivered reply.
  const anchor = fragments.at(-1);
  const estimatedMs = anchor
    ? anchor.endMs + Math.max(0, receivedAtMs - (anchor.receivedAtMs ?? receivedAtMs))
    : 0;
  return {
    role, text, sequence, receivedAtMs,
    startMs: start ?? end ?? estimatedMs,
    endMs: end ?? start ?? estimatedMs,
    timingSource: start !== undefined && end !== undefined ? 'audio'
      : start !== undefined || end !== undefined ? 'partial' : 'estimated',
  };
}
