export type TranscriptRole = 'tutor' | 'user';

export type TranscriptFragment = {
  role: TranscriptRole;
  startMs: number;
  endMs: number;
  text: string;
  sequence: number;
  receivedAtMs?: number;
  timingSource?: 'audio' | 'partial' | 'estimated';
};

export type TranscriptGroup = {
  role: TranscriptRole;
  startMs: number;
  endMs: number;
  text: string;
  sequences: number[];
};

// Only bridge small caption gaps during concurrent speech. This is not a
// silence cutoff: pauses without opposite speech never split a bubble.
const CONCURRENT_CAPTION_GAP_MS = 300;
const LATE_TAIL_GAP_MS = 2000;
const BACKCHANNEL_DURATION_MS = 1200;

function isShortAcknowledgment(group: TranscriptGroup): boolean {
  return group.endMs - group.startMs <= BACKCHANNEL_DURATION_MS
    && /^(?:ja|jazeker|hm+|mhm|ok(?:é|ay)?|precies|sure|yes)[.!?,…\s]*$/iu.test(group.text.trim());
}

export function groupTranscriptFragments(
  fragments: TranscriptFragment[],
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
    const otherGroup = lastGroupByRole[otherRole];
    const overlapsCandidate = !!candidate && fragment.startMs <= candidate.endMs;
    // Approximate timestamps can put the final words just after an acknowledgment.
    // Keep an unfinished sentence open briefly, but never bridge a full reply or
    // attach a fresh sentence to an already completed one.
    const lateTail = !!candidate && !!otherGroup
      && !/(?<!\.)[.!?]["'”’)]*\s*$/u.test(candidate.text)
      && fragment.startMs - candidate.endMs <= LATE_TAIL_GAP_MS
      && isShortAcknowledgment(otherGroup);
    // Bridge brief concurrent caption gaps, without joining a later barge-in
    // back into speech from before the intervening reply.
    const oppositeSpeechInGap = !!candidate
      && otherEndMs > candidate.endMs
      && (otherEndMs <= fragment.startMs
        || (otherGroup && otherGroup.startMs >= candidate.endMs)
        || fragment.startMs - candidate.endMs > CONCURRENT_CAPTION_GAP_MS);

    // A learner can pause to find a word without starting another turn.
    if (candidate && (overlapsCandidate || lateTail || !oppositeSpeechInGap)) {
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
