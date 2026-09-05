import type { WordExplanation } from '../src/word-explanation.ts';

export type CriticalFactFinding = {
  id: string;
  message: string;
  evidence: string;
};

type CriticalFactRule = {
  caseId: string;
  id: string;
  message: string;
  patterns: RegExp[];
};

const rules: CriticalFactRule[] = [
  {
    caseId: 'vervangen-separability',
    id: 'vervangen-marked-separable',
    message: '`vervangen` is explicitly described as separable.',
    patterns: [
      /\bvervangen\b['"’`]*\s+is\s+(?:an?\s+)?separable(?:\s+verb)?\b/i,
      /\bvervangen\b['"’`]*\s+is\s+(?:een\s+)?scheidbaar(?:\s+werkwoord)?\b/i,
    ],
  },
  {
    caseId: 'bezighouden-separability',
    id: 'bezighouden-marked-inseparable',
    message: '`bezighouden` is explicitly described as inseparable.',
    patterns: [
      /\bbezighouden\b['"’`]*\s+is\s+(?:an?\s+)?inseparable(?:\s+verb)?\b/i,
      /\bbezighouden\b['"’`]*\s+is\s+not\s+(?:a\s+)?separable(?:\s+verb)?\b/i,
      /\bbezighouden\b['"’`]*\s+is\s+(?:een\s+)?onscheidbaar(?:\s+werkwoord)?\b/i,
      /\bbezighouden\b['"’`]*\s+is\s+niet\s+scheidbaar(?:\s+werkwoord)?\b/i,
    ],
  },
];

function factualText(output: WordExplanation): string {
  return [
    output.meaning_nl,
    output.meaning_en,
    output.tips,
    output.fun_fact ?? '',
  ].join('\n');
}

export function findKnownCriticalFactFailures(
  caseId: string,
  output: WordExplanation,
): CriticalFactFinding[] {
  const text = factualText(output);
  const findings: CriticalFactFinding[] = [];

  for (const rule of rules) {
    if (rule.caseId !== caseId) continue;

    for (const pattern of rule.patterns) {
      const match = text.match(pattern);
      if (!match) continue;

      findings.push({
        id: rule.id,
        message: rule.message,
        evidence: match[0],
      });
      break;
    }
  }

  return findings;
}
