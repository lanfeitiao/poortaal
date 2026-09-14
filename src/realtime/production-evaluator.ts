function normalize(text: string): string {
  return text
    .toLocaleLowerCase('nl-NL')
    .replace(/[.,!?;:()"“”']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * MVP production detector.
 *
 * Generic words use exact lemma matching. The first vertical slice adds an
 * explicit Dutch separable-verb rule for `tegenvallen`, so forms such as
 * `viel ... tegen` count without pretending we already have a general Dutch
 * morphology engine.
 */
export function detectsTargetProduction(targetWord: string, transcript: string): boolean {
  const target = normalize(targetWord);
  const text = normalize(transcript);
  if (!target || !text) return false;
  if (text.includes(target)) return true;

  if (target === 'tegenvallen') {
    if (/\btegengevallen\b/.test(text)) return true;
    if (/\b(?:val|valt|vallen|viel|vielen)\b(?:\s+\S+){0,6}\s+tegen\b/.test(text)) return true;
  }

  return false;
}
