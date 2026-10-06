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

export function isShortAcknowledgment(group: TranscriptGroup, allowIncomplete = false): boolean {
  const text = group.text.trim().toLowerCase();
  const complete = /^(?:ja|jazeker|hm+|mhm|ok(?:é|ay)?|precies|sure|yes)[.!?,…\s]*$/iu.test(text);
  const incomplete = allowIncomplete && !!text
    && ['ja', 'jazeker', 'hm', 'mhm', 'ok', 'oké', 'okay', 'precies', 'sure', 'yes']
      .some(word => word.startsWith(text));
  return group.endMs - group.startMs <= BACKCHANNEL_DURATION_MS
    && (complete || incomplete);
}

export function looksLikeCaptionContinuation(previousText: string, nextText: string): boolean {
  // The independent delta stream preserves word-joining spaces. Require that
  // join plus a short lowercase continuation; a fresh question is not a tail.
  return !/(?<!\.)[.!?]["'”’)]*\s*$/u.test(previousText)
    && (/\s$/u.test(previousText) || /^\s/u.test(nextText))
    && /^\s*\p{Ll}/u.test(nextText)
    && !/[?!]/u.test(nextText)
    && nextText.trim().split(/\s+/u).length <= 3;
}

function looksLikeEchoedWordTail(previous: string, tail: string, reply: string): boolean {
  // A word can span deltas without a joining space. Require the nearby reply
  // to echo that word, rather than guessing that any lowercase reply is a tail.
  const prefix = previous.match(/(\p{L}+)\s*$/u)?.[1];
  const suffix = tail.match(/^\s*(\p{Ll}\p{L}*)[.!?,…]*\s*$/u)?.[1];
  const echo = reply.match(/^\s*["“']?(\p{L}+)(?=$|[\s.!,:;”"'])/u)?.[1];
  return !!prefix && !!suffix && !!echo && !reply.includes('?')
    && echo.toLowerCase().startsWith((prefix + suffix).toLowerCase());
}

function reconcileEchoedWordTails(
  groups: TranscriptGroup[], fragments: TranscriptFragment[],
): TranscriptGroup[] {
  const bySequence = new Map(fragments.map(part => [part.sequence, part]));
  for (let index = 2; index < groups.length; index += 1) {
    const prefix = groups[index - 2];
    const reply = groups[index - 1];
    const tail = groups[index];
    const nextReply = groups[index + 1];
    // Membership is appended in timeline order; minimum sequence is a DOM key,
    // not the source of the group's earliest audio interval.
    const firstReply = nextReply && bySequence.get(nextReply.sequences[0]);
    const replyGapLimit = firstReply?.timingSource === 'estimated' ? LATE_TAIL_GAP_MS : CONCURRENT_CAPTION_GAP_MS;
    const replyContinues = nextReply && /[\p{L},:;…]\s*$/u.test(reply.text)
      && /^\s*\p{Ll}/u.test(nextReply.text);
    const replyTail = replyContinues && nextReply?.role === reply.role
      && nextReply.startMs - reply.endMs <= replyGapLimit ? nextReply : undefined;
    const firstTail = bySequence.get(tail.sequences[0]);
    const gapLimit = firstTail?.timingSource === 'estimated' ? LATE_TAIL_GAP_MS : CONCURRENT_CAPTION_GAP_MS;
    if (prefix.role !== tail.role || prefix.role === reply.role
      || tail.startMs - prefix.endMs > gapLimit
      || !looksLikeEchoedWordTail(prefix.text, tail.text, reply.text + (replyTail?.text ?? ''))) continue;

    prefix.text += tail.text;
    prefix.endMs = Math.max(prefix.endMs, tail.endMs);
    prefix.sequences.push(...tail.sequences);
    groups.splice(index, 1);
    // Removing a delayed tail also removes the apparent handoff inside the reply.
    if (replyTail) {
      reply.text += replyTail.text;
      reply.endMs = Math.max(reply.endMs, replyTail.endMs);
      reply.sequences.push(...replyTail.sequences);
      groups.splice(index, 1);
    }
    index = Math.max(1, index - 2);
  }
  return groups;
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
      && looksLikeCaptionContinuation(candidate.text, fragment.text)
      && fragment.startMs - candidate.endMs <= (fragment.timingSource === 'estimated'
        ? LATE_TAIL_GAP_MS : CONCURRENT_CAPTION_GAP_MS)
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

  groups.sort((a, b) => a.startMs - b.startMs || Math.min(...a.sequences) - Math.min(...b.sequences));
  return reconcileEchoedWordTails(groups, ordered);
}
