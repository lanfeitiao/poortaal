export type PracticeTask = { situation: string; task: string; hints: [string, string, string]; openingLine?: string };
export type PracticeScenario = PracticeTask & {
  expressions: string[];
  dialogue: { speaker: string; line: string }[];
  tip: string | null;
};
export type StudyTurn = {
  role: 'learner' | 'partner'; speaker: string; line: string; translation: string;
};
export type StudyScenario = { situation: string; task: string; dialogue: StudyTurn[] };
export type StudiedScenario = PracticeScenario | StudyScenario;
export type LearningMoment = {
  translation: string;
  notice: string | null;
  transfer: { situation: string; openingLine: string; example: string };
};

export type StructuredFeedback = {
  task: 'completed' | 'partial' | 'not-yet';
  target: 'correct' | 'incorrect' | 'not-used' | 'uncertain';
  naturalness: 'natural' | 'understandable' | 'unclear';
  evidence: string;
  strength: { text: string; quote: string };
  improvement: { kind: 'error' | 'naturalness'; quote: string; better: string; explanation: string } | null;
  retry: PracticeTask & { change: string };
  supportEvidence?: { tutorQuote: string; learnerQuote: string } | null;
};

export class InvalidStructuredOutput extends Error {}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidStructuredOutput('Expected object');
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 600, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) {
    throw new InvalidStructuredOutput('Invalid text');
  }
  return value.trim();
}
export function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) throw new InvalidStructuredOutput('Invalid choice');
  return value as T;
}
export function list(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new InvalidStructuredOutput('Invalid list');
  return value;
}
export function validateTask(value: unknown): PracticeTask {
  const v = object(value);
  return { situation: text(v.situation), task: text(v.task),
    ...(v.openingLine === undefined ? {} : { openingLine: text(v.openingLine, 300) }),
    hints: list(v.hints, 3, 3).map(h => text(h)) as PracticeTask['hints'] };
}
export function validateScenario(value: unknown): PracticeScenario {
  const v = object(value);
  return { ...validateTask(v), expressions: list(v.expressions, 1, 4).map(e => text(e, 300)),
    dialogue: list(v.dialogue, 0, 4).map(d => {
      const line = object(d);
      return { speaker: text(line.speaker, 80), line: text(line.line, 300) };
    }), tip: v.tip === null ? null : text(v.tip, 300) };
}
export function validateStudyScenario(value: unknown): StudyScenario {
  const v = object(value);
  const dialogue = list(v.dialogue, 2, 5).map(item => {
    const turn = object(item);
    return { role: choice(turn.role, ['learner', 'partner'] as const), speaker: text(turn.speaker, 80),
      line: text(turn.line, 300), translation: text(turn.translation, 300) };
  });
  const segmenter = new Intl.Segmenter('nl', { granularity: 'sentence' });
  const counts = dialogue.map(turn => Array.from(segmenter.segment(turn.line))
    .filter(part => /[\p{L}\p{N}]/u.test(part.segment)).length);
  if (counts.some(count => count === 0) || counts.reduce((sum, count) => sum + count, 0) > 5) {
    throw new InvalidStructuredOutput('Study dialogue must contain at most five spoken sentences in total');
  }
  if (!dialogue.some(turn => turn.role === 'learner') || !dialogue.some(turn => turn.role === 'partner')) {
    throw new InvalidStructuredOutput('Study dialogue needs both the learner and another speaker');
  }
  return { situation: text(v.situation), task: text(v.task), dialogue };
}
export function validateStudiedScenario(value: unknown): StudiedScenario {
  return Object.hasOwn(object(value), 'expressions') ? validateScenario(value) : validateStudyScenario(value);
}
export function validateLearningMoment(value: unknown): LearningMoment {
  const v = object(value), transfer = object(v.transfer);
  return {
    translation: text(v.translation, 300),
    notice: v.notice === null ? null : text(v.notice, 300),
    transfer: { situation: text(transfer.situation, 400),
      openingLine: text(transfer.openingLine, 300), example: text(transfer.example, 300) },
  };
}

export function validateStructuredFeedback(value: unknown, answer: string, situation: string,
  turns?: { role: 'user' | 'assistant'; content: string }[], requireSupport = false): StructuredFeedback {
  const v = object(value), strength = object(v.strength), retry = object(v.retry);
  const quote = (value: unknown, optional = false) => {
    const result = text(value, 2000, optional);
    if (result && !answer.includes(result)) throw new InvalidStructuredOutput('Quote is not learner evidence');
    return result;
  };
  const target = choice(v.target, ['correct', 'incorrect', 'not-used', 'uncertain']);
  const evidence = quote(v.evidence, !['correct', 'incorrect'].includes(target));
  let improvement: StructuredFeedback['improvement'] = null;
  if (v.improvement !== null) {
    const fix = object(v.improvement);
    improvement = { kind: choice(fix.kind, ['error', 'naturalness']), quote: quote(fix.quote),
      better: text(fix.better), explanation: text(fix.explanation) };
  }
  const next = { ...validateTask(retry), change: text(retry.change, 300) };
  let supportEvidence: StructuredFeedback['supportEvidence'];
  if (requireSupport && !Object.hasOwn(v, 'supportEvidence')) throw new InvalidStructuredOutput('Missing modelling assessment');
  if (v.supportEvidence === null) supportEvidence = null;
  else if (v.supportEvidence !== undefined) {
    const model = object(v.supportEvidence);
    const tutorQuote = text(model.tutorQuote, 2000), learnerQuote = quote(model.learnerQuote);
    const ordered = turns?.some((t, i) => t.role === 'assistant' && t.content.includes(tutorQuote)
      && turns.slice(i + 1).some(l => l.role === 'user' && l.content.includes(learnerQuote)));
    if (!ordered) throw new InvalidStructuredOutput('Unsupported modelling evidence');
    supportEvidence = { tutorQuote, learnerQuote };
  }
  if (target === 'incorrect' && improvement?.kind === 'naturalness') throw new InvalidStructuredOutput('Naturalness alone is not a usage error');
  if (next.situation === situation) throw new InvalidStructuredOutput('Retry must change the situation');
  return { task: choice(v.task, ['completed', 'partial', 'not-yet']), target,
    naturalness: choice(v.naturalness, ['natural', 'understandable', 'unclear']), evidence,
    strength: { text: text(strength.text), quote: quote(strength.quote, true) }, improvement, retry: next,
    ...(supportEvidence === undefined ? {} : { supportEvidence }) };
}
