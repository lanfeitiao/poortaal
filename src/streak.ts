export type Streak = { lastDate: string | null; count: number };
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const empty = (): Streak => ({ lastDate: null, count: 0 });
const key = (owner: string | null) => `poortaal_streak:${owner || 'guest'}`;

export function streakDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function readStreak(owner: string | null, storage: Storage = localStorage): Streak {
  try {
    const value = JSON.parse(storage.getItem(key(owner)) || 'null');
    return value && Number.isInteger(value.count) && value.count >= 0 && value.count <= 100000
      && (value.lastDate === null || /^\d{4}-\d{2}-\d{2}$/.test(value.lastDate)) ? value : empty();
  } catch { return empty(); }
}
export function writeStreak(owner: string | null, value: Streak, storage: Storage = localStorage): void {
  storage.setItem(key(owner), JSON.stringify(value));
}
export function mergeStreak(a: Streak, b: Streak): Streak {
  if (!a.lastDate) return b;
  if (!b.lastDate) return a;
  if (a.lastDate === b.lastDate) return { lastDate: a.lastDate, count: Math.max(a.count, b.count) };
  return a.lastDate > b.lastDate ? a : b;
}
export function advanceStreak(value: Streak, day = streakDay()): Streak {
  if (value.lastDate === day) return value;
  const yesterday = new Date(`${day}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return { lastDate: day, count: value.lastDate === yesterday.toISOString().slice(0, 10) ? value.count + 1 : 1 };
}

export async function syncStreak(client: { rpc: Function }, owner: string, active: () => boolean,
  practice = false, storage: Storage = localStorage): Promise<void> {
  if (!active()) return;
  const local = readStreak(owner, storage);
  const { data, error } = await client.rpc('sync_learning_streak', {
    p_local_date: local.lastDate, p_local_count: local.count, p_practice: practice,
  });
  if (error) throw error;
  if (!active()) return;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.user_id !== owner) throw new Error('Invalid streak response');
  writeStreak(owner, mergeStreak(readStreak(owner, storage), { lastDate: row.last_date, count: row.count }), storage);
}
