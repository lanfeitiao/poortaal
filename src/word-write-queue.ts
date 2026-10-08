type Write = () => Promise<void>;

// Every full-document mutation of one learner's word shares a single lane.
// Read the latest state inside write(), after the previous mutation settles.
export function createWordWriteQueue() {
  const pending = new Map<string, Promise<void>>();
  return async (userId: string, word: string, write: Write): Promise<void> => {
    const key = JSON.stringify([userId, word.toLowerCase().trim()]);
    const next = (pending.get(key) || Promise.resolve()).catch(() => {}).then(write);
    pending.set(key, next);
    try { await next; }
    finally { if (pending.get(key) === next) pending.delete(key); }
  };
}
