export type ReviewCardRef = { kind: 'word' | 'expression'; id: string };

export type ReviewCheckpoint = {
  cards: ReviewCardRef[];
  index: number;
  know: number;
  again: number;
  revealed: boolean;
};

const key = (owner: string) => `poortaal_review_session:${owner}`;

function isCardRef(value: unknown): value is ReviewCardRef {
  if (!value || typeof value !== 'object') return false;
  const { kind, id } = value as Partial<ReviewCardRef>;
  return (kind === 'word' || kind === 'expression') && typeof id === 'string' && id.length > 0;
}

export function readReviewCheckpoint(
  owner: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): ReviewCheckpoint | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(key(owner)) || 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const s = value as Partial<ReviewCheckpoint> & { words?: unknown };
    const cards: unknown = s.cards === undefined && Array.isArray(s.words)
      ? s.words.map((id: unknown) => ({ kind: 'word', id })) : s.cards;
    if (!Array.isArray(cards) || !cards.length || !cards.every(isCardRef)
      || new Set(cards.map(({ kind, id }) => `${kind}:${id}`)).size !== cards.length
      || typeof s.index !== 'number' || !Number.isSafeInteger(s.index) || s.index < 0 || s.index > cards.length
      || typeof s.know !== 'number' || !Number.isSafeInteger(s.know) || s.know < 0
      || typeof s.again !== 'number' || !Number.isSafeInteger(s.again) || s.again < 0
      || s.know + s.again > s.index
      || typeof s.revealed !== 'boolean') return null;
    return { cards, index: s.index, know: s.know, again: s.again, revealed: s.revealed };
  } catch { return null; }
}

export function writeReviewCheckpoint(
  owner: string,
  progress: ReviewCheckpoint,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try { storage.setItem(key(owner), JSON.stringify(progress)); }
  catch { /* Local storage is best-effort; the live review must still continue. */ }
}

export function clearReviewCheckpoint(
  owner: string,
  storage: Pick<Storage, 'removeItem'> = localStorage,
): void {
  try { storage.removeItem(key(owner)); }
  catch { /* A blocked storage write must not prevent leaving a review. */ }
}
