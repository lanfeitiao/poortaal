import { currentRound, currentTask, type StructuredSession } from '../structured-session.ts';
import type { Encounter } from './types.ts';

export type VoiceAction = 'hint' | 'feedback' | 'retry' | 'finish' | null;
export function voiceAction(text: string, feedback: boolean, offered = false): VoiceAction {
  const s = text.toLowerCase().replace(/[.!?,。？！]/g, '').trim();
  if (s.length > 120) return null;
  if (feedback && /^(?:nee(?: bedankt)?|no(?: thanks)?|skip|overslaan|跳过)$/.test(s)) return 'finish';
  if (/^(?:klaar|stop|stoppen|afronden|结束)$/.test(s)) return feedback ? 'finish' : 'feedback';
  if (feedback && /^(?:ja(?: graag)?|yes(?: please)?|nog (?:een keer|eens)|opnieuw|laten we het proberen|再试一次|继续)$/.test(s)) return 'retry';
  if (/^(?:(?:mag|kan|kun) (?:ik|je|jij|u) (?:me |mij )?(?:een )?(?:hint|voorbeeld|helpen)(?: geven)?|(?:een )?hint(?: graag)?|help me|ik weet het niet|给我一个提示|提示|示范)$/.test(s)) return 'hint';
  if (!feedback && (/^(?:feedback(?: graag)?|hoe ging het|ik ben klaar|geef (?:me )?feedback|反馈)$/.test(s) || (offered && /^(?:ja(?: graag)?|yes)$/.test(s)))) return 'feedback';
  return null;
}
export function spokenEncounter(s: StructuredSession): Encounter {
  const t = currentTask(s);
  if (!t?.openingLine || s.delivery !== 'voice' || s.phase !== 'answer') throw new Error('Spoken task is not ready');
  return { id: `${s.id}:${s.round}`, targetWord: s.word, usage: s.usage, title: s.round ? 'Een nieuwe variant' : 'Jouw gesprek', emoji: '💬',
    setup: t.situation, objective: t.task, openingLine: t.openingLine,
    support: { meaning: t.hints[0], chunks: s.usage ? [s.usage.chunk] : [], frame: t.hints[1], model: t.hints[2] } };
}
export function voiceFlowPolicy(s: StructuredSession): string {
  return `STRUCTURED SPOKEN PRACTICE (client-controlled, current round ${s.round + 1} of at most 2):
The learner is trying a concrete communication goal, not repeating a lesson. Do not recite examples or a mini dialogue.
Stay in character. After the goal and a brief reason are communicated, ask once "Wil je kort feedback?" and wait.
Do not assess correctness or present corrections before the client sends verified feedback.
The learner may say "hint", "feedback", "nog een keer" or "klaar". When they request help, feedback or a next step, wait silently for the client instruction; never invent your own hints, feedback or retry.
The client owns three progressive hints, the feedback and exactly one optional changed condition. Never create a third round.
Never request typed input. Accept speech naturally, leave thinking time, and do not interrupt.
Lesson exposure: ${s.supportUsed ? 'the learner has seen support; do not repeat that teaching' : 'no examples shown; let the learner try first'}.`;
}
export function spokenFeedback(s: StructuredSession): string {
  const f = currentRound(s).feedback;
  if (!f) return '';
  return `${f.strength.text}${f.improvement ? ` ${f.improvement.kind === 'naturalness' ? 'Je kunt ook zeggen: ' : 'Een tip: '}${f.improvement.better}. ${f.improvement.explanation}` : ''} ${s.round ? 'Je bent klaar. Zeg klaar om af te ronden.' : 'Wil je nog één variant proberen? Zeg ja of klaar.'}`;
}
