export type ReviewCheckpoint = {
  words: string[];
  index: number;
  know: number;
  again: number;
  revealed: boolean;
};

const key = (owner: string) => `poortaal_review_session:${owner}`;

export function readReviewCheckpoint(
  owner: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): ReviewCheckpoint | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(key(owner)) || 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const s = value as Partial<ReviewCheckpoint>;
    if (!Array.isArray(s.words) || !s.words.length || s.words.length > 200
      || !s.words.every(word => typeof word === 'string' && word.length > 0 && word.length <= 200)
      || new Set(s.words).size !== s.words.length
      || !Number.isSafeInteger(s.index) || s.index! < 0 || s.index! > s.words.length
      || !Number.isSafeInteger(s.know) || s.know! < 0
      || !Number.isSafeInteger(s.again) || s.again! < 0
      || s.know! + s.again! > s.index!
      || typeof s.revealed !== 'boolean') return null;
    return { words: [...s.words], index: s.index!, know: s.know!, again: s.again!, revealed: s.revealed };
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
