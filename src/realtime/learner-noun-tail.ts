// A bounded display repair for a Dutch noun slot, not a general turn detector.
// Possessives/articles may be followed by thinking noises or a restarted "ik".
export function looksLikeLearnerNounTail(prefix: string, tail: string): boolean {
  if (/(?<!\.)[.!?]["'”’)]*\s*$/u.test(prefix)) return false;
  const words = prefix.toLowerCase().match(/\p{L}+/gu) ?? [];
  while (words.length && /^(?:e+h+m*|u+h+m*|euh|um|hm+|ik)$/u.test(words.at(-1)!)) words.pop();
  const slot = words.at(-1) ?? '';
  const previous = words.at(-2) ?? '';
  if (/^(?:de|het|een)$/u.test(previous)) return false;
  // "Mijn" is also a noun. Require a clear possessive context rather than
  // attempting an exhaustive parser for noun phrases and their modifiers.
  if (slot === 'mijn' && previous
    && !/^(?:in|op|aan|naar|van|voor|met|bij|zonder|over|onder|door|tegen|achter|tussen|om|tot|langs|naast|buiten|binnen|tijdens|en|of|maar|dat|omdat|als|ook|heb|had|zie|zag|vind|vond|neem|nam|pak|pakt|pakte|zoek|zocht|wil|wilde|gebruik|gebruikte|geef|gaf|krijg|kreeg|ben|is|was|word|werd|hoor|hoorde|voel|voelde|mis|miste|houd|hou|hield|bel|belde|draag|droeg|zet|zette|leg|legde)$/u.test(previous)) return false;
  if (!/^(?:mijn|jouw|uw|onze)$/u.test(slot)) {
    // Prepositions also precede complete pronoun phrases: "van haar", "voor ons".
    // Only accept ambiguous "het" with a named language in "in het Nederlands".
    if (slot === 'het') {
      if (words.at(-2) !== 'in'
        || !/^\s*(?:Nederlands|Engels|Duits|Frans|Spaans|Chinees|Italiaans|Portugees|Arabisch|Russisch|Turks|Pools|Japans)[.,!?]*\s*$/iu.test(tail)) return false;
    } else if (!/^(?:de|een)$/u.test(slot)
      || !/^(?:in|op|aan|naar|van|voor|met|bij|zonder|over|onder|door|tegen|achter|tussen)$/u.test(words.at(-2) ?? '')) return false;
  }
  const noun = tail.match(/^\s*(\p{L}+)[.,!?”’"']*\s*$/u)?.[1]?.toLowerCase();
  return !!noun && !/^(?:ja|nee|ik|jij|je|u|we|wij|hij|ze|zij|dit|dat|die|deze|dank|bedankt|sorry|graag|prima|goed|ok|okay)$/u.test(noun);
}
