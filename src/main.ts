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
  revealAnswer: () => void;
};

const app = window as LegacyPoortaalWindow;

function onClick(id: string, handler: () => void | Promise<void>) {
  document.getElementById(id)?.addEventListener('click', () => {
    void handler();
  });
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
      const word = element.dataset.suggestion;
      if (word) app.trySuggestion(word);
    });
  });

  document.getElementById('chatInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      void app.sendChat();
    }
  });
});
