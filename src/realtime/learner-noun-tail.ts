// A bounded display repair for a Dutch noun slot, not a general turn detector.
// Possessives/articles may be followed by thinking noises or a restarted "ik".
export function looksLikeLearnerNounTail(prefix: string, tail: string): boolean {
  if (/(?<!\.)[.!?]["'”’)]*\s*$/u.test(prefix)) return false;
  const words = prefix.toLowerCase().match(/\p{L}+/gu) ?? [];
  while (words.length && /^(?:e+h+m*|u+h+m*|euh|um|hm+|ik)$/u.test(words.at(-1)!)) words.pop();
  if (!/^(?:de|het|een|mijn|jouw|uw|zijn|haar|ons|onze|hun)$/u.test(words.at(-1) ?? '')) return false;
  const noun = tail.match(/^\s*(\p{L}+)[.,!?”’"']*\s*$/u)?.[1]?.toLowerCase();
  return !!noun && !/^(?:ja|nee|ik|jij|je|u|we|wij|hij|ze|zij|dit|dat|die|deze|dank|bedankt|sorry|graag|prima|goed|ok|okay)$/u.test(noun);
}
