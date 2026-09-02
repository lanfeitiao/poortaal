const REQUIRED_ELEMENT_IDS = [
  'userInfo',
  'syncIndicator',
  'userEmail',
  'logoutBtn',
  'loginBtn',
  'historyBtn',
  'view-home',
  'dailyWordContainer',
  'wordInput',
  'searchBtn',
  'content',
  'emptyState',
  'view-practice',
  'practicePickerSection',
  'practiceWordInput',
  'practiceStartBtn',
  'practiceHistoryList',
  'practiceChatSection',
  'practiceBackBtn',
  'textModeBtn',
  'voiceModeBtn',
  'textPracticePanel',
  'practiceChatWord',
  'chatMessages',
  'chatInput',
  'chatSendBtn',
  'voicePracticePanel',
  'voicePracticeWord',
  'voiceStatus',
  'voiceVisualizer',
  'voiceTranscript',
  'voiceStartBtn',
  'voiceBtnIcon',
  'voiceBtnText',
  'view-review',
  'reviewHomeSection',
  'reviewSessionSection',
  'nav-home',
  'nav-review',
  'navReviewBadge',
  'nav-practice',
  'overlay',
  'historyPanel',
  'historyCloseBtn',
  'historySummary',
  'historyList',
  'authOverlay',
  'authError',
  'googleLoginBtn',
  'authCancelBtn',
  'microReviewOverlay',
  'reviewTimerBar',
  'reviewTimerText',
  'reviewWord',
  'reviewType',
  'reviewAnswer',
  'reviewNl',
  'reviewEn',
  'reviewActions',
  'reviewRevealBtn',
] as const;

type RequiredElementId = typeof REQUIRED_ELEMENT_IDS[number];

declare global {
  interface Document {
    getElementById(elementId: RequiredElementId): HTMLElement;
  }
}

export function assertRequiredDom(): void {
  for (const id of REQUIRED_ELEMENT_IDS) {
    if (!document.querySelector(`#${CSS.escape(id)}`)) {
      throw new Error(`Missing required Poortaal DOM element: #${id}`);
    }
  }
}
