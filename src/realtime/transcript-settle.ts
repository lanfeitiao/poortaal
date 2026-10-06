// Keep the data channel alive briefly after muting input so delayed captions
// can join their original turns. Quiescence is not proof of ASR correctness.
export async function waitForTranscriptIdle(
  lastActivity: () => number,
  current: () => boolean,
  now = () => performance.now(),
  wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
): Promise<boolean> {
  const started = now();
  while (current() && now() - started < 3000) {
    await wait(100);
    if (now() - started >= 1200 && now() - lastActivity() >= 700) return current();
  }
  return false;
}
