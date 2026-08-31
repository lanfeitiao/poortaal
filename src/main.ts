type LegacyPoortaalWindow = Window & typeof globalThis & {
  doLogout: () => void | Promise<void>;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  signInWithGoogle: () => void | Promise<void>;
  toggleHistory: () => void;
  lookupWord: () => void | Promise<void>;
  trySuggestion: (word: string) => void;
  startPracticeWithInput: () => void;
  showPracticePicker: () => void;
  switchPracticeMode: (mode: 'text' | 'voice') => void;
  sendChat: () => void | Promise<void>;
  toggleVoiceSession: () => void | Promise<void>;
  startReviewSession: () => void;
  exitReviewSession: () => void;
  onReviewCardTap: () => void;
  gradeAndAdvance: (known: boolean) => void;
  endReviewSessionToHome: () => void;
  exploreDailyWord: () => void;
  deleteHistoryItem: (word: string) => void;
  startMicroReview: (word: string) => void;
  playTTS: (word: string) => void | Promise<void>;
  playExTTS: (button: HTMLElement, text: string) => void | Promise<void>;
  goToPractice: (word: string) => void;
  startPracticeForWord: (word: string) => void | Promise<void>;
  revealAnswer: () => void;
  finishReview: (known: boolean) => void;
  closeMicroReview: () => void;
};

const app = window as LegacyPoortaalWindow;

function onClick(id: string, handler: () => void | Promise<void>) {
  document.getElementById(id)?.addEventListener('click', () => {
    void handler();
  });
}

function booleanData(value: string | undefined) {
  return value === 'true';
}

function handleActionClick(event: MouseEvent) {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
  if (!target) return;

  const word = target.dataset.word;

  switch (target.dataset.action) {
    case 'start-review':
      app.startReviewSession();
      break;
    case 'exit-review':
      app.exitReviewSession();
      break;
    case 'review-card-tap':
      app.onReviewCardTap();
      break;
    case 'review-tts':
      event.stopPropagation();
      void app.playExTTS(target, word || '');
      break;
    case 'grade-review':
      app.gradeAndAdvance(booleanData(target.dataset.known));
      break;
    case 'end-review':
      app.endReviewSessionToHome();
      break;
    case 'explore-daily-word':
      app.exploreDailyWord();
      break;
    case 'delete-history':
      if (word) app.deleteHistoryItem(word);
      break;
    case 'history-word':
      if (!word) break;
      if (target.dataset.review === 'true') app.startMicroReview(word);
      else app.trySuggestion(word);
      break;
    case 'play-word-tts':
      if (word) void app.playTTS(word);
      break;
    case 'play-example-tts':
      void app.playExTTS(target, target.dataset.text || '');
      break;
    case 'practice-word':
      if (word) app.goToPractice(word);
      break;
    case 'start-practice-word':
      if (word) void app.startPracticeForWord(word);
      break;
    case 'micro-reveal':
      app.revealAnswer();
      break;
    case 'micro-finish':
      app.finishReview(booleanData(target.dataset.known));
      break;
    case 'micro-close':
      app.closeMicroReview();
      break;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  onClick('logoutBtn', app.doLogout);
  onClick('loginBtn', app.openAuthModal);
  onClick('historyBtn', app.toggleHistory);
  onClick('searchBtn', app.lookupWord);
  onClick('practiceStartBtn', app.startPracticeWithInput);
  onClick('practiceBackBtn', app.showPracticePicker);
  onClick('textModeBtn', () => app.switchPracticeMode('text'));
  onClick('voiceModeBtn', () => app.switchPracticeMode('voice'));
  onClick('chatSendBtn', app.sendChat);
  onClick('voiceStartBtn', app.toggleVoiceSession);
  onClick('overlay', app.toggleHistory);
  onClick('historyCloseBtn', app.toggleHistory);
  onClick('googleLoginBtn', app.signInWithGoogle);
  onClick('authCancelBtn', app.closeAuthModal);
  onClick('reviewRevealBtn', app.revealAnswer);

  document.querySelectorAll<HTMLElement>('[data-suggestion]').forEach(element => {
    element.addEventListener('click', () => {
      const suggestion = element.dataset.suggestion;
      if (suggestion) app.trySuggestion(suggestion);
    });
  });

  document.getElementById('chatInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      void app.sendChat();
    }
  });

  document.addEventListener('click', handleActionClick);

  document.addEventListener('pointerdown', event => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action="review-tts"]');
    if (target) event.stopPropagation();
  }, true);
});
