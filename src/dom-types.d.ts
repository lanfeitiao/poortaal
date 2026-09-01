interface Window {
  supabase: any;
}

interface Document {
  getElementById(elementId: 'authEmail' | 'authPassword' | 'newPassword' | 'confirmPassword' | 'wordInput' | 'practiceWordInput' | 'chatInput'): HTMLInputElement;
  getElementById(elementId: 'authSubmitBtn' | 'reviewBtnAgain' | 'reviewBtnKnow' | 'searchBtn' | 'chatSendBtn'): HTMLButtonElement;
}
