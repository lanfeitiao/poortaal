import type { Encounter } from './types';

/**
 * MVP encounter builder.
 *
 * The first vertical slice deliberately uses a deterministic scenario so the
 * speaking interaction can be evaluated before scenario generation is added.
 */
export function createMvpEncounter(targetWord: string): Encounter {
  if (targetWord.toLocaleLowerCase('nl-NL') === 'tegenvallen') {
    return {
      id: `cake-${Date.now()}`,
      targetWord,
      title: 'The expensive cake',
      emoji: '🍰',
      setup: 'You bought an expensive cake from a bakery everyone recommended.',
      objective: 'Tell your friend that the cake was not as good as you expected.',
      openingLine: 'En? Hoe is de taart?',
      support: {
        meaning: "You can say it wasn't as good as you expected.",
        chunks: ['viel', 'een beetje', 'tegen'],
        frame: 'De taart ___ een beetje ___.',
        model: 'De taart viel een beetje tegen.',
      },
    };
  }

  return {
    id: `encounter-${Date.now()}`,
    targetWord,
    title: 'A small encounter',
    emoji: '💬',
    setup: `You are in a short everyday conversation where “${targetWord}” would be useful.`,
    objective: `Use “${targetWord}” naturally once.`,
    openingLine: `Laten we “${targetWord}” in een korte situatie gebruiken. Ben je klaar?`,
    support: {
      meaning: `Think about the meaning of “${targetWord}” and what you want to express.`,
      chunks: [targetWord],
      frame: `Probeer een korte zin met “${targetWord}”.`,
      model: `Maak een natuurlijke zin met “${targetWord}”.`,
    },
  };
}
