import { detectsTargetProduction } from './production-evaluator';
import { nextSupportLevel, strongerSupport } from './scaffolding';
import type { Encounter, ProductionEvidence, SupportLevel } from './types';

export class EncounterSession {
  readonly evidence: ProductionEvidence;
  currentSupport: SupportLevel;

  constructor(
    readonly encounter: Encounter,
    initialSupport: SupportLevel = 'none',
  ) {
    this.currentSupport = initialSupport;
    this.evidence = {
      targetWord: encounter.targetWord,
      initialSupport,
      maxSupportUsed: initialSupport,
      successfulProduction: false,
    };
  }

  requestMoreSupport(): SupportLevel {
    this.currentSupport = nextSupportLevel(this.currentSupport);
    this.evidence.maxSupportUsed = strongerSupport(
      this.evidence.maxSupportUsed,
      this.currentSupport,
    );
    return this.currentSupport;
  }

  hideSupport(): void {
    this.currentSupport = 'none';
  }

  recordProduction(transcript: string): boolean {
    const usedTarget = detectsTargetProduction(this.encounter.targetWord, transcript);
    if (usedTarget) {
      this.evidence.successfulProduction = true;
      this.evidence.learnerSentence = transcript.trim();
    }
    return usedTarget;
  }
}
