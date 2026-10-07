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
    const row = { ...local, word_data: mergeWordData(local.word, local.word_data, previous.data?.word_data),
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
    read: () => scoped(client.from('user_words').select('word_data,updated_at')).maybeSingle(),
    insert: row => client.from('user_words').insert(row).select().maybeSingle(),
    update: (row, version) => {
      let query = scoped(client.from('user_words').update(row));
      query = version === null ? query.is('updated_at', null) : query.eq('updated_at', version);
      return query.select().maybeSingle();
    },
  };
}
