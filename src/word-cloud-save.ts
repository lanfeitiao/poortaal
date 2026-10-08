import { mergeAttempts, validateAttempts } from './word-learning.ts';
import { readSavedWordExplanation } from './word-explanation.ts';
import { usageKey } from './word-usage.ts';

type WordRow = { user_id: string; word: string; word_data: unknown; updated_at?: string | null; [key: string]: unknown };
type Result = { data: WordRow | null; error: { code?: string } | null };
export type WordCloudStore = {
  read(): Promise<Result>;
  insert(row: WordRow): Promise<Result>;
  update(row: WordRow, version: string | null): Promise<Result>;
};
function mergeWordData(word: string, local: unknown, remote: unknown): unknown {
  const saved = readSavedWordExplanation(remote);
  const current = readSavedWordExplanation(local);
  const attempts = (value: unknown) => validateAttempts(value && typeof value === 'object'
    ? (value as Record<string, unknown>).usage_progress : undefined)
    .filter(a => usageKey(a.word) === usageKey(word));
  const base = saved ? { ...saved, usage: saved.usage ?? current?.usage } : current;
  const progress = mergeAttempts(attempts(local), attempts(remote));
  return base || progress.length ? { ...base, usage_progress: progress } : null;
}

export function mergeCloudWordStats(a: Record<string, unknown>, b: Record<string, unknown>) {
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  const maximum = (key: string) => Math.max(number(a[key]), number(b[key]));
  const reviews = (value: unknown): number[] => Array.isArray(value)
    ? value.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0) : [];
  return { lookups: maximum('lookups'), practices: maximum('practices'), level: maximum('level'),
    last_seen: maximum('last_seen'), reviews: [...new Set([...reviews(a.reviews), ...reviews(b.reviews)])].sort((x, y) => x - y) };
}
function mergeWordRow(local: WordRow, remote: WordRow | null): WordRow {
  if (!remote) return local;
  const merged = { ...local, ...mergeCloudWordStats(local, remote) };
  merged.word_data = mergeWordData(local.word, local.word_data, remote.word_data);
  return merged;
}

// An equality-filtered UPDATE is the atomic version check; a preceding read alone is not.
export async function saveWordWithVersion(store: WordCloudStore, localRow: () => WordRow | null,
  active: () => boolean, now: () => number = Date.now): Promise<WordRow | null> {
  for (let retry = 0; retry < 5; retry++) {
    if (!active()) return null;
    const previous = await store.read();
    if (previous.error) throw previous.error;
    if (!active()) return null;
    const local = localRow();
    if (!local) return null;
    const version = previous.data?.updated_at ?? null;
    const oldTime = version ? Date.parse(version) : NaN;
    const row = { ...mergeWordRow(local, previous.data),
      updated_at: new Date(Math.max(now(), Number.isFinite(oldTime) ? oldTime + 1 : 0)).toISOString() };
    const result = previous.data ? await store.update(row, version) : await store.insert(row);
    if (result.error) {
      if (!previous.data && result.error.code === '23505') continue;
      throw result.error;
    }
    if (result.data) return result.data;
  }
  throw new Error('Word changed concurrently; learning evidence remains saved locally.');
}

export function supabaseWordStore(client: any, userId: string, word: string): WordCloudStore {
  const scoped = (query: any) => query.eq('user_id', userId).eq('word', word);
  return {
    read: () => scoped(client.from('user_words').select('lookups,practices,reviews,level,last_seen,word_data,updated_at')).maybeSingle(),
    insert: row => client.from('user_words').insert(row).select().maybeSingle(),
    update: (row, version) => {
      let query = scoped(client.from('user_words').update(row));
      query = version === null ? query.is('updated_at', null) : query.eq('updated_at', version);
      return query.select().maybeSingle();
    },
  };
}
