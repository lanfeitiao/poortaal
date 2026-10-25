import type { PracticeScenario, StructuredFeedback } from './structured-contract.ts';
import type { WordUsage } from './word-usage.ts';

export const practiceUsage: WordUsage = { kind: 'collocation', note: 'Use maken when arranging an appointment.',
  chunk: 'een afspraak maken', meaning_en: 'make an appointment', frame: 'Ik wil een afspraak maken voor [dag].',
  example_nl: 'Ik wil een afspraak maken voor maandag.', example_en: 'I want to make an appointment for Monday.',
  review_prompt: 'Arrange an appointment.' };
export const scenario: PracticeScenario = {
  situation: 'Je belt de huisarts. Je hebt morgen tijd.', task: 'Vraag of je morgen kunt komen. Vertel wanneer je tijd hebt.',
  expressions: ['Ik wil een afspraak maken.', 'Kan ik morgen komen?'],
  dialogue: [{ speaker: 'Jij', line: 'Ik wil een afspraak maken.' }, { speaker: 'Assistent', line: 'Wanneer kun je komen?' }],
  tip: null, hints: ['Welke dag heb je tijd?', 'Ik wil een…', 'Ik wil een afspraak maken. Kan ik morgen komen?'],
};
export const answer = 'Ik wil een afspraak maken. Kan ik morgen komen?';
export function goodFeedback(situation = scenario.situation, quote = answer): StructuredFeedback {
  return { task: 'completed', target: 'correct', naturalness: 'natural', evidence: quote,
    strength: { text: 'Je vraagt duidelijk om een afspraak.', quote }, improvement: null,
    retry: { situation: situation + ' Je kunt nu alleen vrijdag.', task: 'Vraag om een ander tijdstip.',
      change: 'Je kunt alleen vrijdag.', hints: ['Welke dag kun je?', 'Kan ik…', 'Kan ik vrijdag komen? Ik wil een afspraak maken.'] } };
}
