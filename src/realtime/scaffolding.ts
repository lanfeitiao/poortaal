import { SUPPORT_LEVELS, type Encounter, type SupportLevel } from './types.ts';

export function nextSupportLevel(level: SupportLevel): SupportLevel {
  const index = SUPPORT_LEVELS.indexOf(level);
  return SUPPORT_LEVELS[Math.min(index + 1, SUPPORT_LEVELS.length - 1)];
}

export function previousSupportLevel(level: SupportLevel): SupportLevel {
  const index = SUPPORT_LEVELS.indexOf(level);
  return SUPPORT_LEVELS[Math.max(index - 1, 0)];
}

export function supportRank(level: SupportLevel): number {
  return SUPPORT_LEVELS.indexOf(level);
}

export function strongerSupport(a: SupportLevel, b: SupportLevel): SupportLevel {
  return supportRank(a) >= supportRank(b) ? a : b;
}

export function supportContent(encounter: Encounter, level: SupportLevel): string | string[] | null {
  switch (level) {
    case 'none': return null;
    case 'meaning': return encounter.support.meaning;
    case 'chunks': return encounter.support.chunks;
    case 'frame': return encounter.support.frame;
    case 'model': return encounter.support.model;
  }
}
