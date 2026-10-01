export type TranscriptRole = 'tutor' | 'user';

export type TranscriptFragment = {
  role: TranscriptRole;
  startMs: number;
  endMs: number;
  text: string;
  sequence: number;
};

export type TranscriptGroup = {
  role: TranscriptRole;
  startMs: number;
  endMs: number;
  text: string;
  sequences: number[];
};

export const TRANSCRIPT_MERGE_GAP_MS = 1800;

export function groupTranscriptFragments(
  fragments: TranscriptFragment[],
  mergeGapMs = TRANSCRIPT_MERGE_GAP_MS,
): TranscriptGroup[] {
  const ordered = [...fragments].sort((a, b) =>
    a.startMs - b.startMs || a.endMs - b.endMs || a.sequence - b.sequence,
  );
  const groups: TranscriptGroup[] = [];
  const lastGroupByRole: Partial<Record<TranscriptRole, TranscriptGroup>> = {};
  const maxEndByRole: Partial<Record<TranscriptRole, number>> = {};

  for (const fragment of ordered) {
    const candidate = lastGroupByRole[fragment.role];
    const otherRole: TranscriptRole = fragment.role === 'user' ? 'tutor' : 'user';
    const otherEndMs = maxEndByRole[otherRole] ?? Number.NEGATIVE_INFINITY;
    const overlapsCandidate = !!candidate && fragment.startMs <= candidate.endMs;
    const closeEnough = !!candidate && fragment.startMs - candidate.endMs <= mergeGapMs;
    const oppositeSpeechInGap = !!candidate && otherEndMs > candidate.endMs;

    if (candidate && (overlapsCandidate || (closeEnough && !oppositeSpeechInGap))) {
      candidate.endMs = Math.max(candidate.endMs, fragment.endMs);
      candidate.text += fragment.text;
      candidate.sequences.push(fragment.sequence);
    } else {
      const group: TranscriptGroup = {
        role: fragment.role,
        startMs: fragment.startMs,
        endMs: fragment.endMs,
        text: fragment.text,
        sequences: [fragment.sequence],
      };
      groups.push(group);
      lastGroupByRole[fragment.role] = group;
    }

    maxEndByRole[fragment.role] = Math.max(maxEndByRole[fragment.role] ?? Number.NEGATIVE_INFINITY, fragment.endMs);
  }

  return groups.sort((a, b) => a.startMs - b.startMs || Math.min(...a.sequences) - Math.min(...b.sequences));
}
