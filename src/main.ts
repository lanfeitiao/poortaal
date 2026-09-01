import {
  closeAuthModal,
  closeMicroReview,
  deleteHistoryItem,
  doLogout,
  endReviewSessionToHome,
  exitReviewSession,
  exploreDailyWord,
  finishReview,
  goToPractice,
  gradeAndAdvance,
  lookupWord,
  onReviewCardTap,
  openAuthModal,
  playExTTS,
  playTTS,
  revealAnswer,
  sendChat,
  showPracticePicker,
  signInWithGoogle,
  startMicroReview,
  startPracticeForWord,
  startPracticeWithInput,
  startReviewSession,
  switchPracticeMode,
  toggleHistory,
  toggleVoiceSession,
  trySuggestion,
} from './app';

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
      startReviewSession();
      break;
    case 'exit-review':
      exitReviewSession();
      break;
    case 'review-card-tap':
      onReviewCardTap();
      break;
    case 'review-tts':
      event.stopPropagation();
      void playExTTS(target, word || '');
      break;
    case 'grade-review':
      gradeAndAdvance(booleanData(target.dataset.known));
      break;
    case 'end-review':
      endReviewSessionToHome();
      break;
    case 'explore-daily-word':
      exploreDailyWord();
      break;
    case 'delete-history':
      if (word) deleteHistoryItem(word);
      break;
    case 'history-word':
      if (!word) break;
      if (target.dataset.review === 'true') startMicroReview(word);
      else trySuggestion(word);
      break;
    case 'play-word-tts':
      if (word) void playTTS(word);
      break;
    case 'play-example-tts':
      void playExTTS(target, target.dataset.text || '');
      break;
    case 'practice-word':
      if (word) goToPractice(word);
      break;
    case 'start-practice-word':
      if (word) void startPracticeForWord(word);
      break;
    case 'micro-reveal':
      revealAnswer();
      break;
    case 'micro-finish':
      finishReview(booleanData(target.dataset.known));
      break;
    case 'micro-close':
      closeMicroReview();
      break;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  onClick('logoutBtn', doLogout);
  onClick('loginBtn', openAuthModal);
  onClick('historyBtn', toggleHistory);
  onClick('searchBtn', lookupWord);
  onClick('practiceStartBtn', startPracticeWithInput);
  onClick('practiceBackBtn', showPracticePicker);
  onClick('textModeBtn', () => switchPracticeMode('text'));
  onClick('voiceModeBtn', () => switchPracticeMode('voice'));
  onClick('chatSendBtn', sendChat);
  onClick('voiceStartBtn', toggleVoiceSession);
  onClick('overlay', toggleHistory);
  onClick('historyCloseBtn', toggleHistory);
  onClick('googleLoginBtn', signInWithGoogle);
  onClick('authCancelBtn', closeAuthModal);
  onClick('reviewRevealBtn', revealAnswer);

  document.querySelectorAll<HTMLElement>('[data-suggestion]').forEach(element => {
    element.addEventListener('click', () => {
      const suggestion = element.dataset.suggestion;
      if (suggestion) trySuggestion(suggestion);
    });
  });

  document.getElementById('chatInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      void sendChat();
    }
  });

  document.addEventListener('click', handleActionClick);

  document.addEventListener('pointerdown', event => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action="review-tts"]');
    if (target) event.stopPropagation();
  }, true);
});
