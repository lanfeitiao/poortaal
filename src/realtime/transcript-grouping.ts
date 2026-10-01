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

function hasOppositeSpeechInGap(
  fragments: TranscriptFragment[],
  role: TranscriptRole,
  gapStartMs: number,
  gapEndMs: number,
): boolean {
  if (gapEndMs <= gapStartMs) return false;
  return fragments.some(fragment =>
    fragment.role !== role
    && fragment.startMs < gapEndMs
    && fragment.endMs > gapStartMs,
  );
}

export function groupTranscriptFragments(
  fragments: TranscriptFragment[],
  mergeGapMs = TRANSCRIPT_MERGE_GAP_MS,
): TranscriptGroup[] {
  const ordered = [...fragments].sort((a, b) =>
    a.startMs - b.startMs || a.endMs - b.endMs || a.sequence - b.sequence,
  );
  const groups: TranscriptGroup[] = [];

  for (const fragment of ordered) {
    const candidate = [...groups].reverse().find(group => {
      if (group.role !== fragment.role) return false;
      if (fragment.startMs <= group.endMs) return true;
      if (fragment.startMs - group.endMs > mergeGapMs) return false;
      return !hasOppositeSpeechInGap(fragments, fragment.role, group.endMs, fragment.startMs);
    });

    if (!candidate) {
      groups.push({
        role: fragment.role,
        startMs: fragment.startMs,
        endMs: fragment.endMs,
        text: fragment.text,
        sequences: [fragment.sequence],
      });
      continue;
    }

    candidate.startMs = Math.min(candidate.startMs, fragment.startMs);
    candidate.endMs = Math.max(candidate.endMs, fragment.endMs);
    candidate.sequences.push(fragment.sequence);
    candidate.text = ordered
      .filter(item => candidate.sequences.includes(item.sequence))
      .map(item => item.text)
      .join('');
  }

  return groups.sort((a, b) => a.startMs - b.startMs || Math.min(...a.sequences) - Math.min(...b.sequences));
}
