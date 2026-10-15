import type { TranscriptFragment } from './transcript-grouping.ts';

export type GroupingFragment = TranscriptFragment & { sourceSequences: number[] };

// An estimated first piece must not sort after its reliably timed suffix.
// Keep lexical stream order only for mixed-timing pieces of a single word.
export function coalesceMixedTimingWordPieces(fragments: TranscriptFragment[]): GroupingFragment[] {
  const result: GroupingFragment[] = [];
  const bySequence = new Map(fragments.map(part => [part.sequence, part]));
  for (const part of [...fragments].sort((a, b) => a.sequence - b.sequence)) {
    const last = result.at(-1);
    const previous = last?.role === part.role ? last : undefined;
    const sources = previous?.sourceSequences.map(sequence => bySequence.get(sequence)!) ?? [];
    const mixed = part.timingSource === 'estimated' || sources.some(source => source.timingSource === 'estimated');
    const priorTimed = sources.filter(source => source.timingSource !== 'estimated');
    const reliableContinues = part.timingSource === 'estimated' || !priorTimed.length
      || (part.startMs <= Math.max(...priorTimed.map(source => source.endMs)) + 300
        && part.endMs >= Math.min(...priorTimed.map(source => source.startMs)) - 300);
    const receiptGap = part.receivedAtMs === undefined || previous?.receivedAtMs === undefined
      ? 0 : part.receivedAtMs - previous.receivedAtMs;
    if (part.role === 'user' && previous && mixed && reliableContinues && receiptGap >= 0 && receiptGap <= 2000
      && /^\s*\p{L}+$/u.test(previous.text) && /^\p{Ll}\p{L}*[.!?,…]*$/u.test(part.text)) {
      sources.push(part);
      const timed = sources.filter(source => source.timingSource !== 'estimated');
      previous.text += part.text;
      previous.sourceSequences.push(part.sequence);
      previous.receivedAtMs = part.receivedAtMs;
      if (timed.length) {
        previous.startMs = Math.min(...timed.map(source => source.startMs));
        previous.endMs = Math.max(...timed.map(source => source.endMs));
        previous.timingSource = timed[0].timingSource;
      } else previous.endMs = Math.max(previous.endMs, part.endMs);
    } else {
      const next = { ...part, sourceSequences: [part.sequence] };
      result.push(next);
    }
  }
  return result;
}
