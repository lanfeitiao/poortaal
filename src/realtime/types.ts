export type RealtimeConnectionState =
  | 'idle'
  | 'requesting-microphone'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'closed'
  | 'error';

export type SupportLevel = 'none' | 'meaning' | 'chunks' | 'frame' | 'model';

export const SUPPORT_LEVELS: SupportLevel[] = [
  'none',
  'meaning',
  'chunks',
  'frame',
  'model',
];

export type Encounter = {
  id: string;
  targetWord: string;
  title: string;
  emoji: string;
  setup: string;
  objective: string;
  openingLine: string;
  support: {
    meaning: string;
    chunks: string[];
    frame: string;
    model: string;
  };
};

export type ProductionEvidence = {
  targetWord: string;
  initialSupport: SupportLevel;
  maxSupportUsed: SupportLevel;
  successfulProduction: boolean;
  learnerSentence?: string;
};

export type RealtimeServerEvent = {
  type: string;
  [key: string]: unknown;
};
