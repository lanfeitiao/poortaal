import {
  OpenAIRequestError,
  requestOpenAIChat,
} from './openai-client';
import { consumeRealtimePracticeCompletion, resetRealtimeEncounterUi, stopRealtimeEncounter } from './realtime/encounter-controller';
import { enrichWordUsage } from './usage-generation';
import { escapeText, renderWordUsage, renderPracticeUsage } from './word-usage-ui';
import { cloudWordLearning, getWordAttempts, learningOwner, setLearningOwner, clearWordLearning, recordWordAttempt } from './learning-store';
import { setPracticeContext, getPracticeContext, clearPracticeContext, markPracticeHelp, practiceUsageInstructions } from './practice-context';
import { resetPracticeFeedback, finishPracticeFeedback } from './practice-feedback';
import { needsUsageReview, wordReview } from './word-learning';
import { createWordWriteQueue } from './word-write-queue';
import {
  generateWordExplanation,
  InvalidWordExplanationError,
  WordExplanationRequestError,
  validateWordExplanation,
  readSavedWordExplanation,
  type ChatMessage,
  type WordExplanation,
} from './word-explanation';

// --- Shared application types ---
type AppUser = { id: string; email?: string | null };
type WordStats = { lookups: number; practices: number; reviews: number[]; level: number; lastSeen: number };
type WordStatsMap = Record<string, WordStats>;
type PlantStageKey = 'strong' | 'growing' | 'sprout' | 'seed' | 'wilting';
type PlantStage = { emoji: string; label: string; key: PlantStageKey; hint: string };
type HistoryEntry = { word: string; timestamp: number; wordData?: WordExplanation };
type ReviewItem = { entry: HistoryEntry; stats: Partial<WordStats>; level: number; isDue: boolean; isWilting: boolean; overdueDays: number };
type DailyWord = { word: string; category: string; teaser: string };
type CloudWord = { word: string; lookups?: number; practices?: number; reviews?: number[]; level?: number; last_seen?: number; word_data?: unknown };
type CloudHistoryEntry = { word: string; timestamp?: number; word_data?: unknown };
type AuthSession = { user: AppUser } | null;

// --- Supabase ---
const SUPABASE_URL = 'https://fcpauyuwylnomuxdqtln.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gs091zHItkPEaLWQhmH3MQ_vspCp-Yl';
const supabaseClient = (window as any).supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser: AppUser | null = null;
const queueWordWrite = createWordWriteQueue();

// Auth UI
function openAuthModal() {
  document.getElementById('authOverlay').classList.add('open');
  document.getElementById('authError').style.display = 'none';
}
function closeAuthModal() {
  document.getElementById('authOverlay').classList.remove('open');
}
async function signInWithGoogle() {
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://lanfeitiao.github.io/poortaal/'
      }
    });
    if (error) throw error;
  } catch(e) {
    const errEl = document.getElementById('authError');
    errEl.textContent = e instanceof Error ? e.message : 'Fout bij inloggen';
    errEl.style.display = 'block';
  }
}
async function doLogout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  setLearningOwner(null);
  updateUserUI();
}
function updateUserUI() {
  const info = document.getElementById('userInfo');
  const btn = document.getElementById('loginBtn');
  if (currentUser) {
    info.style.display = 'flex';
    btn.style.display = 'none';
    document.getElementById('userEmail').textContent = currentUser.email || '';
  } else {
    info.style.display = 'none';
    btn.style.display = '';
  }
}

// Cloud sync
async function syncFromCloud() {
  if (!currentUser) return;
  const userId = currentUser.id;
  const ind = document.getElementById('syncIndicator');
  ind.classList.add('syncing');
  try {
    const { data: cloudWordsRaw } = await supabaseClient.from('user_words').select('*').eq('user_id', userId);
    const { data: cloudHistoryRaw } = await supabaseClient.from('user_history').select('*').eq('user_id', userId);
    if (currentUser?.id !== userId) return;
    const cloudWords = (cloudWordsRaw || []) as CloudWord[];
    const cloudHistory = (cloudHistoryRaw || []) as CloudHistoryEntry[];

    const localStats = getWordStats();
    const dirtyUsageWords: string[] = [];
    let learningChanged = false;
    if (cloudWords.length > 0) {
      for (const cw of cloudWords) {
        const attemptsBefore = JSON.stringify(getWordAttempts(cw.word));
        if (cloudWordLearning(cw.word, cw.word_data, userId)) dirtyUsageWords.push(cw.word);
        if (JSON.stringify(getWordAttempts(cw.word)) !== attemptsBefore) learningChanged = true;
        localStats[cw.word] = {
          lookups: cw.lookups || 0,
          practices: cw.practices || 0,
          reviews: cw.reviews || [],
          level: cw.level || 0,
          lastSeen: cw.last_seen || Date.now(),
        };
        const cloud = readSavedWordExplanation(cw.word_data);
        if (cloud) {
          const local = getCachedWord(cw.word);
          setWordCache(cw.word, { ...cloud, usage: cloud.usage ?? local?.usage });
        }
      }
    }
    const openWord = currentWord?.toLowerCase().trim();
    if (currentWordData && cloudWords.some(cw => cw.word.toLowerCase().trim() === openWord)) {
      renderWordCard(currentWordData);
    }
    localStorage.setItem('poortaal_word_stats', JSON.stringify(localStats));
    if (learningChanged) {
      closeMicroReview(); resetReviewSessionIfActive();
      if (window.location.hash.split('?')[0] === '#review') renderReviewHome();
    }
    updateReviewBadge();
    for (const word of dirtyUsageWords) {
      if (currentUser?.id !== userId) return;
      await saveWordStatsToCloud(word);
    }
    if (currentUser?.id !== userId) return;

    {
      const cloudMap = new Map(cloudHistory.map(h => [h.word, h]));
      const localOnly = searchHistory.filter(h => !cloudMap.has(h.word));
      const merged: HistoryEntry[] = cloudHistory.map(h => ({
        word: h.word,
        timestamp: h.timestamp || Date.now(),
        wordData: getCachedWord(h.word) || readSavedWordExplanation(h.word_data),
      }));
      merged.push(...localOnly);
      merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      searchHistory = merged.slice(0, 50);
      localStorage.setItem('poortaal_history', JSON.stringify(searchHistory));

      if (localOnly.length > 0) {
        const rows = localOnly.map(h => ({
          user_id: userId,
          word: h.word,
          word_data: h.wordData || null,
          timestamp: h.timestamp || Date.now(),
        }));
        await supabaseClient.from('user_history').upsert(rows, { onConflict: 'user_id,word' });
      }
      const cloudWordSet = new Set(cloudWords.map(w => w.word));
      if (currentUser?.id !== userId) return;
      const localOnlyStats = Object.entries(localStats).filter(([w]) => !cloudWordSet.has(w));
      for (const [word] of localOnlyStats) {
        if (currentUser?.id !== userId) return;
        await saveWordStatsToCloud(word);
      }
    }

    renderHistory();
    updateReviewBadge();
    if (!reviewSessionActive && window.location.hash.split('?')[0] === '#review') renderReviewHome();
  } catch (e) {
    console.error('Sync error:', e);
  } finally {
    ind.classList.remove('syncing');
  }
}

async function saveWordStatsToCloud(word: string) {
  const userId = currentUser?.id;
  if (!userId) return;
  await queueWordWrite(userId, word, async () => {
    if (currentUser?.id !== userId || learningOwner() !== userId) return;
    const stats = getWordStats()[word];
    if (!stats) return;
    await supabaseClient.from('user_words').upsert({
      user_id: userId,
      word,
      lookups: stats.lookups || 0,
      practices: stats.practices || 0,
      reviews: stats.reviews || [],
      level: stats.level || 0,
      last_seen: stats.lastSeen || Date.now(),
      word_data: wordCloudData(word),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,word' }).then(({ error }: { error: unknown }) => { if (error) console.error('Save word error:', error); });
  }).catch(error => console.error('Save word error:', error));
}

async function saveHistoryToCloud(word: string, wordData?: WordExplanation | null) {
  if (!currentUser) return;
  await supabaseClient.from('user_history').upsert({
    user_id: currentUser.id,
    word: word,
    word_data: wordData || null,
    timestamp: Date.now(),
  }, { onConflict: 'user_id,word' }).then(({ error }: { error: unknown }) => { if (error) console.error('Save history error:', error); });
}

async function initAuth() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (user) {
    currentUser = user;
    setLearningOwner(user.id);
    updateUserUI();
    syncFromCloud();
  }
  supabaseClient.auth.onAuthStateChange((_event: string, session: AuthSession) => {
    currentUser = session?.user || null;
    setLearningOwner(currentUser?.id || null);
    updateUserUI();
  });
}

// --- State ---
const API_BASE = 'https://poortaal-api.weilin1990.workers.dev';
const storedHistory = JSON.parse(localStorage.getItem('poortaal_history') || '[]') as Array<HistoryEntry | string>;
let searchHistory: HistoryEntry[] = storedHistory.map(item => typeof item === 'string'
  ? { word: item, timestamp: Date.now() }
  : { ...item, wordData: readSavedWordExplanation(item.wordData) });
if (storedHistory.some(item => typeof item === 'string')) {
  localStorage.setItem('poortaal_history', JSON.stringify(searchHistory));
}
let currentWord: string | null = null;
let currentWordData: WordExplanation | null = null;
let practiceMessages: ChatMessage[] = [];
let reviewQueue: ReviewItem[] = [];
let reviewIndex = 0;
let reviewResults = { know: 0, again: 0 };
let reviewRevealed = false;
let reviewSessionActive = false;
let currentReviewPrompt: ReturnType<typeof wordReview> | null = null;
let practiceLoading = false;
let practiceGeneration = 0;
let microReviewTimer: ReturnType<typeof setTimeout> | null = null;
let microReviewInterval: ReturnType<typeof setInterval> | null = null;
let microReviewPrompt: ReturnType<typeof wordReview> | null = null;

// --- Routing ---
function navigateTo(hash: string) {
  window.location.hash = hash;
}

function renderReviewHome() {
  const home = document.getElementById('reviewHomeSection');
  const session = document.getElementById('reviewSessionSection');
  if (!home || !session) return;
  home.style.display = '';
  session.style.display = 'none';

  const due = getDueWords();
  if (due.length === 0) {
    home.innerHTML = `
      <div class="review-empty">
        <div class="review-empty-emoji">🌳</div>
        <div class="review-empty-title">Alles fris voor vandaag</div>
        <div class="review-empty-sub">Kom morgen terug</div>
      </div>
    `;
    return;
  }
  const wilting = due.filter(d => d.isWilting).length;
  const today = due.length - wilting;
  const breakdownParts: string[] = [];
  if (wilting > 0) breakdownParts.push(`🥀 ${wilting} verwelkt`);
  if (today > 0) breakdownParts.push(`🌿 ${today} vandaag`);
  const breakdown = breakdownParts.join(' · ');
  home.innerHTML = `
    <div class="review-home">
      <h1>Herhalen</h1>
      <div class="review-sub">${due.length} ${due.length === 1 ? 'woord' : 'woorden'} vandaag</div>
      <div class="review-count-card">
        <div class="review-count-num">${due.length}</div>
        <div class="review-count-label">${due.length === 1 ? 'WOORD VANDAAG' : 'WOORDEN VANDAAG'}</div>
        <div class="review-count-breakdown">${breakdown}</div>
      </div>
      <button class="review-start-btn" data-action="start-review">▶ Begin herhaling</button>
      <div class="review-start-meta">automatisch volgende</div>
    </div>
  `;
}

function startReviewSession() {
  const due = getDueWords();
  if (due.length === 0) {
    renderReviewHome();
    return;
  }
  reviewQueue = due;
  reviewIndex = 0;
  reviewResults = { know: 0, again: 0 };
  reviewRevealed = false;
  reviewSessionActive = true;
  currentReviewPrompt = null;
  document.getElementById('reviewHomeSection').style.display = 'none';
  document.getElementById('reviewSessionSection').style.display = '';
  renderReviewSession();
}

function renderReviewSession() {
  const root = document.getElementById('reviewSessionSection');
  if (!root) return;
  if (reviewIndex >= reviewQueue.length) {
    renderReviewSummary();
    return;
  }
  const item = reviewQueue[reviewIndex];
  const data = getCachedWord(item.entry.word) || item.entry.wordData!;
  if (data.usage === undefined) void loadWordUsage(data);
  const review = currentReviewPrompt ||= wordReview(data, item.level, item.stats.reviews?.length || 0, getWordAttempts(item.entry.word));
  const word = item.entry.word;
  const total = reviewQueue.length;
  const pct = Math.round((reviewIndex / total) * 100);
  const pill = item.isWilting
    ? `<span class="review-stage-pill">🥀 ${item.overdueDays}d te laat</span>`
    : `<span class="review-stage-pill fresh">🌿 vandaag</span>`;
  const meaningNl = escapeHtml(review.nl || '');
  const meaningEn = escapeHtml(review.en || '');
  const safeWord = escapeHtml(word);
  const safeType = escapeHtml(data.type || '');
  const revealedClass = reviewRevealed ? 'revealed' : '';
  const actionsDisabled = reviewRevealed ? '' : 'disabled';
  const back2 = reviewIndex + 2 < total ? '<div class="review-card back-2"></div>' : '';
  const back1 = reviewIndex + 1 < total ? '<div class="review-card back-1"></div>' : '';
  root.innerHTML = `
    <div class="review-session">
      <div class="review-session-header">
        <button class="review-back-btn" data-action="exit-review" aria-label="Terug">←</button>
        <span class="review-progress-text">${reviewIndex + 1} / ${total}</span>
        <span style="width:2rem;"></span>
      </div>
      <div class="review-progress-track"><div class="review-progress-fill" style="width:${pct}%"></div></div>
      <div class="review-stack" id="reviewStack">
        ${back2}
        ${back1}
        <div class="review-card front" id="reviewFrontCard" data-action="review-card-tap">
          ${pill}
          <div class="review-card-word">${safeWord}</div>
          ${safeType ? `<div class="review-card-type">${safeType}</div>` : ''}
          <div class="review-card-task">${escapeHtml(review.prompt)}</div>
          <button class="tts-btn review-tts-btn" data-action="review-tts" data-word="${safeWord.replace(/"/g, '&quot;')}" title="Uitspraak beluisteren">🔊</button>
          <div class="review-card-hint" id="reviewCardHint" ${reviewRevealed ? 'hidden' : ''}>${review.kind === 'meaning' ? 'tik om te onthullen' : 'probeer eerst zelf · tik voor een voorbeeld'}</div>
          <div class="review-card-answer ${revealedClass}" id="reviewCardAnswer">
            <div class="answer-nl">${meaningNl}</div>
            ${meaningEn ? `<div class="answer-en">${meaningEn}</div>` : ''}
            ${review.usage ? `<div class="use-frame">${escapeHtml(review.usage.frame)}</div><div class="example-en">Andere juiste antwoorden zijn ook goed.</div>` : ''}
          </div>
        </div>
      </div>
      <div class="review-actions">
        <button class="review-btn-again" id="reviewBtnAgain" data-action="grade-review" data-known="false" ${actionsDisabled}>Opnieuw</button>
        <button class="review-btn-know" id="reviewBtnKnow" data-action="grade-review" data-known="true" ${actionsDisabled}>${review.kind === 'meaning' ? 'Wist ik!' : 'Dat lukte!'}</button>
      </div>
    </div>
  `;
  attachReviewCardSwipe();
}

function attachReviewCardSwipe() {
  const card = document.getElementById('reviewFrontCard');
  if (!card) return;
  let startX = 0, startY = 0, dx = 0, dragging = false, decided = false;
  const reset = () => {
    card.classList.add('swipe-anim');
    card.style.transform = '';
    setTimeout(() => card.classList.remove('swipe-anim'), 200);
  };
  card.addEventListener('pointerdown', e => {
    if (!reviewRevealed) return;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    dragging = true;
    decided = false;
    card.setPointerCapture(e.pointerId);
    card.classList.remove('swipe-anim');
  });
  card.addEventListener('pointermove', e => {
    if (!dragging) return;
    dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!decided && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
      dragging = false;
      card.style.transform = '';
      return;
    }
    if (Math.abs(dx) > 6) decided = true;
    const rot = dx / 20;
    card.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
  });
  const commitOrReset = () => {
    if (!dragging) return;
    dragging = false;
    if (!reviewRevealed) { reset(); return; }
    const threshold = 80;
    if (dx > threshold) {
      card.classList.add('swipe-anim');
      card.style.transform = 'translateX(120%) rotate(20deg)';
      setTimeout(() => gradeAndAdvance(true), 200);
    } else if (dx < -threshold) {
      card.classList.add('swipe-anim');
      card.style.transform = 'translateX(-120%) rotate(-20deg)';
      setTimeout(() => gradeAndAdvance(false), 200);
    } else {
      reset();
    }
  };
  card.addEventListener('pointerup', commitOrReset);
  card.addEventListener('pointercancel', commitOrReset);
}

function onReviewTTS(e: Event, btn: HTMLElement) { e.stopPropagation(); playExTTS(btn, btn.dataset.word || ''); }
function onReviewCardTap() {
  if (reviewRevealed) return;
  reviewRevealed = true;
  const answer = document.getElementById('reviewCardAnswer');
  const hint = document.getElementById('reviewCardHint');
  if (answer) answer.classList.add('revealed');
  if (hint) hint.hidden = true;
  const again = document.getElementById('reviewBtnAgain');
  const know = document.getElementById('reviewBtnKnow');
  if (again) (again as HTMLButtonElement).disabled = false;
  if (know) (know as HTMLButtonElement).disabled = false;
}
function gradeAndAdvance(known: boolean) {
  if (!reviewSessionActive || !reviewRevealed) return;
  const item = reviewQueue[reviewIndex];
  if (!item) return;
  const word = item.entry.word;
  if (known) { reviewResults.know++; updateWordStats(word, 'review'); }
  else { reviewResults.again++; updateWordStats(word, 'review_again'); }
  if (currentReviewPrompt?.usage) recordWordAttempt({ id: crypto.randomUUID(), at: Date.now(), word,
    chunk: currentReviewPrompt.usage.chunk, outcome: known ? 'self-reviewed' : 'needs-practice', source: 'review' });
  updateReviewBadge();
  renderHistory();
  reviewIndex++;
  currentReviewPrompt = null;
  reviewRevealed = false;
  renderReviewSession();
}
function renderReviewSummary() {
  const root = document.getElementById('reviewSessionSection');
  if (!root) return;
  const know = reviewResults.know;
  const again = reviewResults.again;
  const lines: string[] = [];
  if (know > 0) lines.push(`<div class="review-summary-stat">🌳 ${know} wist je</div>`);
  if (again > 0) lines.push(`<div class="review-summary-stat">🥀 ${again} opnieuw</div>`);
  if (lines.length === 0) lines.push('<div class="review-summary-stat">Geen woorden beoordeeld</div>');
  root.innerHTML = `
    <div class="review-summary">
      <div class="review-summary-emoji">🌳</div>
      <div class="review-summary-title">Klaar!</div>
      ${lines.join('')}
      <button class="review-summary-btn" data-action="end-review">Tot morgen</button>
    </div>
  `;
}
function endReviewSessionToHome() {
  reviewSessionActive = false; reviewQueue = []; reviewIndex = 0; reviewResults = { know: 0, again: 0 }; reviewRevealed = false; renderReviewHome();
}
function exitReviewSession() {
  if (!reviewSessionActive) return;
  if (reviewIndex >= reviewQueue.length) { endReviewSessionToHome(); return; }
  const ok = window.confirm('Sessie stoppen? Je voortgang van deze sessie gaat verloren.');
  if (!ok) return;
  endReviewSessionToHome();
}
function resetReviewSessionIfActive() {
  if (!reviewSessionActive) return;
  reviewSessionActive = false; reviewQueue = []; reviewIndex = 0; reviewResults = { know: 0, again: 0 }; reviewRevealed = false;
  currentReviewPrompt = null;
  const session = document.getElementById('reviewSessionSection');
  const home = document.getElementById('reviewHomeSection');
  if (session) session.style.display = 'none';
  if (home) home.style.display = '';
}
function handleRoute() {
  updateReviewBadge();
  const hash = window.location.hash || '#home';
  const route = hash.split('?')[0];
  const isHome = route === '#home' || route === '' || route === '#';
  const isPractice = route === '#practice';
  const isReview = route === '#review';
  document.getElementById('view-home').classList.toggle('active', isHome);
  document.getElementById('view-practice').classList.toggle('active', isPractice);
  document.getElementById('view-review').classList.toggle('active', isReview);
  document.getElementById('nav-home').classList.toggle('active', isHome);
  document.getElementById('nav-practice').classList.toggle('active', isPractice);
  document.getElementById('nav-review').classList.toggle('active', isReview);
  if (isPractice) renderPracticeHistoryList();
  else { stopRealtimeEncounter(); showPracticePicker(); }
  if (isReview) renderReviewHome(); else resetReviewSessionIfActive();
}
window.addEventListener('hashchange', handleRoute);

// --- Daily Word ---
const DAILY_EPOCH = new Date(2026, 0, 1);
function getAbsoluteDay() {
  const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); return Math.floor((today.getTime() - DAILY_EPOCH.getTime()) / 86400000);
}
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) { seed = (seed * 16807 + 0) % 2147483647; const j = seed % (i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
function getTodayWord(words: DailyWord[]): DailyWord {
  const absoluteDay = getAbsoluteDay(); const cycle = Math.floor(absoluteDay / words.length); const effectiveList = cycle === 0 ? words : seededShuffle(words, cycle); return effectiveList[absoluteDay % words.length];
}
function getStreak(): { lastDate: string | null; count: number } { try { return JSON.parse(localStorage.getItem('poortaal_streak') || 'null') || { lastDate: null, count: 0 }; } catch { return { lastDate: null, count: 0 }; } }
function updateStreak() {
  const streak = getStreak(); const today = new Date().toISOString().slice(0, 10); if (streak.lastDate === today) return streak;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = { lastDate: today, count: streak.lastDate === yesterday ? streak.count + 1 : 1 };
  localStorage.setItem('poortaal_streak', JSON.stringify(newStreak)); return newStreak;
}
function renderDailyWord(word: DailyWord) {
  const container = document.getElementById('dailyWordContainer'); const streak = getStreak(); const streakCount = streak.count || 0;
  container.innerHTML = `<div class="daily-word-card"><div class="daily-word-top"><div class="daily-word-label">Woord van de Dag</div><div class="streak-badge">\u{1F333} Dag ${streakCount}</div></div><div class="daily-word-main"><h2>${escapeHtml(word.word)}</h2><span class="word-type">${escapeHtml(word.category)}</span></div><div class="daily-word-teaser">${escapeHtml(word.teaser)}</div><button class="daily-word-cta" data-action="explore-daily-word">Ontdek dit woord</button></div>`;
}
function exploreDailyWord() {
  if (!currentDailyWord) return; const streak = updateStreak(); const badge = document.querySelector('.streak-badge'); if (badge) badge.textContent = '\u{1F333} Dag ' + streak.count; (document.getElementById('wordInput') as HTMLInputElement).value = currentDailyWord.word; lookupWord();
}
let currentDailyWord: DailyWord | null = null;
async function loadDailyWord() {
  try { const res = await fetch('words.json'); if (!res.ok) return; const words = await res.json() as DailyWord[]; if (!Array.isArray(words) || words.length === 0) return; currentDailyWord = getTodayWord(words); renderDailyWord(currentDailyWord); } catch {}
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initAuth(); renderHistory(); updateReviewBadge(); loadDailyWord();
  document.getElementById('wordInput').addEventListener('keydown', e => { if (e.key === 'Enter') lookupWord(); });
  document.getElementById('practiceWordInput').addEventListener('keydown', e => { if (e.key === 'Enter') startPracticeWithInput(); });
  handleRoute(); window.addEventListener('keydown', onReviewKeydown);
});
function onReviewKeydown(e: KeyboardEvent) {
  if (!reviewSessionActive) return; const tag = (document.activeElement && document.activeElement.tagName) || ''; if (tag === 'INPUT' || tag === 'TEXTAREA') return; if (reviewIndex >= reviewQueue.length) return;
  if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); onReviewCardTap(); }
  else if (e.key === 'Enter' || e.key === 'ArrowRight') { if (!reviewRevealed) return; e.preventDefault(); gradeAndAdvance(true); }
  else if (e.key === 'ArrowLeft') { if (!reviewRevealed) return; e.preventDefault(); gradeAndAdvance(false); }
}

// --- TTS ---
async function _playTTSBlob(text: string) {
  const url = `https://poortaal-api.weilin1990.workers.dev/tts?q=${encodeURIComponent(text)}&tl=nl`; const res = await fetch(url); if (!res.ok) throw new Error('TTS fetch failed'); const blob = await res.blob(); const blobUrl = URL.createObjectURL(blob); const audio = new Audio(blobUrl); audio.onended = () => URL.revokeObjectURL(blobUrl); await audio.play();
}
function playPronunciation(text: string) { _playTTSBlob(text).catch(() => showToast('Er ging iets mis')); }
async function playTTS(word: string) { const btn = document.getElementById('ttsBtn'); if (!btn || btn.classList.contains('loading')) return; btn.classList.add('loading'); btn.innerHTML = '<div class="tts-spinner"></div>'; try { await _playTTSBlob(word); } catch { showToast('Er ging iets mis'); } finally { btn.classList.remove('loading'); btn.innerHTML = '🔊'; } }
async function playExTTS(btn: HTMLElement, text: string) { if (btn.classList.contains('loading')) return; btn.classList.add('loading'); btn.innerHTML = '<span class="tts-spinner"></span>'; try { await _playTTSBlob(text); } catch { showToast('Er ging iets mis'); } finally { btn.classList.remove('loading'); btn.innerHTML = '🔊'; } }

// --- History ---
function toggleHistory() { const panel = document.getElementById('historyPanel'); const overlay = document.getElementById('overlay'); panel.classList.toggle('open'); overlay.classList.toggle('open'); }
function getWordStats(): WordStatsMap { try { return JSON.parse(localStorage.getItem('poortaal_word_stats') || '{}') as WordStatsMap; } catch { return {}; } }
function updateWordStats(word: string, type: 'lookup' | 'practice' | 'review' | 'review_again') {
  const stats = getWordStats(); const w = word.toLowerCase().trim(); if (!stats[w]) stats[w] = { lookups: 0, practices: 0, lastSeen: Date.now(), reviews: [], level: 0 }; if (!stats[w].reviews) stats[w].reviews = []; if (stats[w].level === undefined) stats[w].level = 0; if (type === 'lookup') stats[w].lookups++; if (type === 'practice') stats[w].practices++;
  if (type === 'review' || type === 'practice' || type === 'review_again') { const today = new Date().toDateString(); const lastReview = stats[w].reviews.length > 0 ? stats[w].reviews[stats[w].reviews.length - 1] : 0; const lastReviewDay = new Date(lastReview).toDateString(); const alreadyReviewedToday = lastReview && lastReviewDay === today; if (!alreadyReviewedToday) { stats[w].reviews.push(Date.now()); if (stats[w].reviews.length >= 2 && type !== 'review_again') stats[w].level = Math.min(stats[w].level + 1, 4); } }
  stats[w].lastSeen = Date.now(); localStorage.setItem('poortaal_word_stats', JSON.stringify(stats)); saveWordStatsToCloud(w); return stats[w];
}
function getNextInterval(level: number) { const intervals = [1, 3, 7, 14, 30]; return intervals[Math.min(level, intervals.length - 1)]; }
function startOfDay(ts: number) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addToHistory(word: string, wordData?: WordExplanation | null) { const w = word.toLowerCase().trim(); searchHistory = searchHistory.filter(h => h.word !== w); const entry: HistoryEntry = { word: w, timestamp: Date.now() }; if (wordData) entry.wordData = wordData; searchHistory.unshift(entry); if (searchHistory.length > 50) searchHistory = searchHistory.slice(0, 50); localStorage.setItem('poortaal_history', JSON.stringify(searchHistory)); updateWordStats(w, 'lookup'); saveHistoryToCloud(w, wordData); renderHistory(); updateReviewBadge(); }
function getPlantStage(word: string): PlantStage {
  const stats = getWordStats()[word.toLowerCase().trim()]; if (!stats) return { emoji: '🌱', label: 'Zaaisel', key: 'seed', hint: '' }; const level = stats.level || 0; const lastSeen = stats.lastSeen || 0; const nextInterval = getNextInterval(level); const today = startOfDay(Date.now()); const dueDay = startOfDay(lastSeen + nextInterval * 86400000); const overdueDays = Math.max(0, Math.round((today - dueDay) / 86400000)); const daysLeft = Math.max(0, Math.round((dueDay - today) / 86400000)); const overdue = dueDay < today; const dueTodayHint = 'Herhaal vandaag!';
  if (overdue && level < 4) return { emoji: '🥀', label: 'Verwelkt', key: 'wilting', hint: `${overdueDays}d te laat` }; if (level >= 4) return { emoji: '🌳', label: 'Sterk', key: 'strong', hint: 'Goed gedaan!' }; if (level >= 3) return { emoji: '🪴', label: 'Groeiend', key: 'growing', hint: daysLeft === 0 ? dueTodayHint : `${daysLeft}d tot herhaling` }; if (level >= 1) return { emoji: '🌿', label: 'Kiempje', key: 'sprout', hint: daysLeft === 0 ? dueTodayHint : `${daysLeft}d tot herhaling` }; const hasPracticed = stats.practices > 0 || stats.reviews.length > 0; const seedHint = hasPracticed ? (daysLeft > 0 ? `${daysLeft}d tot herhaling` : dueTodayHint) : 'Oefen om te groeien'; return { emoji: '🌱', label: 'Zaaisel', key: 'seed', hint: seedHint };
}
function getDueWords(): ReviewItem[] {
  const stats = getWordStats(); const today = startOfDay(Date.now());
  return searchHistory.filter(entry => entry.wordData).map(entry => {
    const s: Partial<WordStats> = stats[entry.word] || {}; const level = s.level || 0;
    const dueDay = startOfDay((s.lastSeen || 0) + getNextInterval(level) * 86400000);
    const data = getCachedWord(entry.word) || entry.wordData!;
    const usageDue = needsUsageReview(data, getWordAttempts(entry.word));
    return { entry, stats: s, level, isDue: usageDue || (dueDay <= today && level < 4),
      isWilting: dueDay < today && level < 4, overdueDays: Math.max(0, Math.round((today - dueDay) / 86400000)) };
  }).filter(x => x.isDue).sort((a, b) => b.overdueDays - a.overdueDays);
}
function updateReviewBadge() { const badge = document.getElementById('navReviewBadge'); if (!badge) return; const due = getDueWords(); badge.hidden = due.length === 0; badge.textContent = String(due.length); }
function renderHistory() {
  const list = document.getElementById('historyList'); const summaryEl = document.getElementById('historySummary'); if (searchHistory.length === 0) { list.innerHTML = '<div class="history-empty">Nog geen woorden opgezocht</div>'; summaryEl.innerHTML = ''; return; }
  const counts: Record<PlantStageKey, number> = { strong: 0, growing: 0, sprout: 0, seed: 0, wilting: 0 };
  const rows = searchHistory.map(entry => { const safe = escapeHtml(entry.word); const safeAttr = safe.replace(/"/g, '&quot;'); const plant = getPlantStage(entry.word); counts[plant.key]++; const isWilting = plant.key === 'wilting' && Boolean(entry.wordData); return `<li><div class="swipe-delete" data-action="delete-history" data-word="${safeAttr}">Verwijder</div><div class="swipe-content" data-action="history-word" data-word="${safeAttr}" data-review="${isWilting}"><span class="history-word">${safe}</span><span class="plant-stage" title="${plant.hint || ''}"><span class="plant-emoji">${plant.emoji}</span><span class="plant-label">${plant.hint || plant.label}</span></span></div></li>`; });
  list.innerHTML = rows.join(''); initSwipeHandlers(list); const parts: string[] = []; if (counts.strong) parts.push(`🌳 ${counts.strong} sterk`); if (counts.growing) parts.push(`🪴 ${counts.growing} groeiend`); if (counts.sprout) parts.push(`🌿 ${counts.sprout} kiempjes`); if (counts.seed) parts.push(`🌱 ${counts.seed} zaaisel`); if (counts.wilting) parts.push(`🥀 ${counts.wilting} verwelkt`); summaryEl.innerHTML = parts.join(' · ');
}
function deleteHistoryItem(word: string) {
  const w = word.toLowerCase().trim(); clearWordLearning(w);
  searchHistory = searchHistory.filter(h => h.word !== w);
  localStorage.setItem('poortaal_history', JSON.stringify(searchHistory));
  const cache = getWordCache(); delete cache[w]; localStorage.setItem(WORD_CACHE_KEY, JSON.stringify(cache));
  const stats = getWordStats(); delete stats[w]; localStorage.setItem('poortaal_word_stats', JSON.stringify(stats));
  const userId = currentUser?.id;
  if (userId) {
    supabaseClient.from('user_history').delete().eq('user_id', userId).eq('word', w).then(() => {});
    void queueWordWrite(userId, w, async () => {
      await supabaseClient.from('user_words').delete().eq('user_id', userId).eq('word', w);
    }).catch(error => console.error('Delete word error:', error));
  }
  renderHistory(); updateReviewBadge();
}
function initSwipeHandlers(list: HTMLElement) { const items = list.querySelectorAll<HTMLElement>('.swipe-content'); items.forEach(el => { let startX = 0, currentX = 0, swiping = false; el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; currentX = 0; swiping = false; el.style.transition = 'none'; }, { passive: true }); el.addEventListener('touchmove', e => { const dx = e.touches[0].clientX - startX; if (dx < -10) swiping = true; if (swiping) { currentX = Math.min(0, Math.max(dx, -120)); el.style.transform = `translateX(${currentX}px)`; } }, { passive: true }); el.addEventListener('touchend', () => { el.style.transition = 'transform 0.2s ease'; if (currentX < -100) { const word = el.dataset.word; el.style.transform = 'translateX(-100%)'; if (word) setTimeout(() => deleteHistoryItem(word), 200); } else if (currentX < -40) el.style.transform = 'translateX(-80px)'; else el.style.transform = 'translateX(0)'; }); el.addEventListener('click', e => { if (swiping) { e.stopPropagation(); e.preventDefault(); } }, true); }); }

// --- Toast / OpenAI ---
function showToast(msg: string) { const existing = document.querySelector('.toast'); if (existing) existing.remove(); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4000); }
async function callOpenAI(messages: ChatMessage[], temperature = 0.7): Promise<string> {
  try {
    return await requestOpenAIChat(API_BASE, messages, temperature);
  } catch (error) {
    if (error instanceof OpenAIRequestError && error.kind === 'http') {
      showToast('Er ging iets mis');
    }
    throw error;
  }
}
function trySuggestion(word: string) { (document.getElementById('wordInput') as HTMLInputElement).value = word; const panel = document.getElementById('historyPanel'); if (panel.classList.contains('open')) toggleHistory(); lookupWord(); }

const WORD_CACHE_KEY = 'poortaal_word_cache_v4';
function wordCloudData(word: string) {
  const data = getCachedWord(word);
  return data ? { ...data, usage_progress: getWordAttempts(word) } : null;
}
function getWordCache(): Record<string, unknown> { try { return JSON.parse(localStorage.getItem(WORD_CACHE_KEY) || '{}') as Record<string, unknown>; } catch { return {}; } }
function setWordCache(word: string, data: unknown) { const cache = getWordCache(); cache[word.toLowerCase().trim()] = data; const keys = Object.keys(cache); if (keys.length > 200) delete cache[keys[0]]; localStorage.setItem(WORD_CACHE_KEY, JSON.stringify(cache)); }
function getCachedWord(word: string): WordExplanation | null {
  const key = word.toLowerCase().trim();
  const cache = getWordCache();
  const cached = cache[key];
  if (!cached) return null;
  try {
    return validateWordExplanation(cached);
  } catch (error) {
    delete cache[key];
    localStorage.setItem(WORD_CACHE_KEY, JSON.stringify(cache));
    console.warn(`Removed invalid cached word explanation for "${key}"`, error);
    return null;
  }
}

const usageRequests = new Map<string, Promise<WordExplanation>>();
function loadWordUsage(data: WordExplanation): Promise<WordExplanation> {
  if (data.usage !== undefined) return Promise.resolve(data);
  const key = data.word.toLowerCase().trim();
  const existing = usageRequests.get(key);
  if (existing) return existing;
  const owner = learningOwner();
  const request = enrichWordUsage(data, callOpenAI).then(enriched => {
    setWordCache(key, enriched);
    const entry = searchHistory.find(h => h.word === key);
    if (entry) {
      entry.wordData = enriched;
      localStorage.setItem('poortaal_history', JSON.stringify(searchHistory));
      if (owner === learningOwner()) { void saveHistoryToCloud(key, enriched); void saveWordStatsToCloud(key); }
    }
    if (currentWord?.toLowerCase().trim() === key) { currentWordData = enriched; renderWordCard(enriched); }
    return enriched;
  }).catch(() => data).finally(() => usageRequests.delete(key));
  usageRequests.set(key, request);
  return request;
}
window.addEventListener('poortaal:word-learning', event => {
  const { word, owner } = (event as CustomEvent<{ word: string; owner: string }>).detail;
  if (owner !== learningOwner()) return;
  if (currentUser?.id === owner) void saveWordStatsToCloud(word);
  if (currentWordData?.word.toLowerCase().trim() === word) renderWordCard(currentWordData);
  updateReviewBadge();
});
document.addEventListener('toggle', event => {
  const details = event.target as HTMLDetailsElement;
  if (details.matches?.('.practice-use') && details.open) markPracticeHelp();
}, true);

async function lookupWord() {
  const input = document.getElementById('wordInput') as HTMLInputElement; const word = input.value.trim(); if (!word) return; currentWord = word; const cached = getCachedWord(word); if (cached) { currentWordData = cached; addToHistory(word, cached); renderWordCard(cached); void loadWordUsage(cached); return; }
  const btn = document.getElementById('searchBtn') as HTMLButtonElement; btn.disabled = true; const content = document.getElementById('content'); content.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div><span>Even denken over "${word}"...</span></div>`;
  try {
    const data = await generateWordExplanation(word, callOpenAI);
    currentWord = word; currentWordData = data; setWordCache(word, data); addToHistory(word, data); renderWordCard(data); void loadWordUsage(data);
  } catch (e) {
    if (e instanceof InvalidWordExplanationError) {
      console.warn('Rejected invalid AI word explanation', e);
    }
    const requestFailed = e instanceof WordExplanationRequestError;
    content.innerHTML = requestFailed
      ? '<div class="empty-state"><div class="icon">⚠️</div><p>Er ging iets mis. Probeer het opnieuw.</p></div>'
      : '<div class="empty-state"><div class="icon">😅</div><p>Kon het woord niet verwerken. Probeer het opnieuw.</p></div>';
  } finally {
    btn.disabled = false;
  }
}
function renderWordCard(data: WordExplanation) {
  const content = document.getElementById('content');
  const word = escapeHtml(data.word);
  const examples = data.examples.map(ex => `<div class="example-item"><div class="example-nl">“${escapeHtml(ex.nl)}”
    <button class="ex-tts-btn" data-action="play-example-tts" data-text="${escapeHtml(ex.nl)}" title="Uitspraak">🔊</button></div>
    <div class="example-en">${escapeHtml(ex.en)}</div></div>`).join('');
  const fact = data.fun_fact ? `<div class="fun-fact">💡 ${escapeHtml(data.fun_fact)}</div>` : '';
  content.innerHTML = `<div class="card" id="wordCard"><div class="card-label">Woord</div>
    <div class="word-header"><h1>${word}</h1><span class="word-type">${escapeHtml(data.type)}</span>
    <button class="tts-btn" id="ttsBtn" data-action="play-word-tts" data-word="${word}" title="Uitspraak beluisteren">🔊</button></div>
    <div class="meaning"><div class="meaning-nl">${escapeHtml(data.meaning_nl)}</div><div class="meaning-en">${escapeHtml(data.meaning_en)}</div></div>${fact}</div>
    <div class="card"><div class="card-label">Voorbeelden</div>${examples}</div>${renderWordUsage(data)}
    <div class="card"><div class="card-label">Tips</div><div class="tips-text">${escapeHtml(data.tips)}</div></div>
    <button class="practice-btn" data-action="practice-word" data-word="${word}">🎭 Oefenen met “${word}”</button>`;
}

// --- Practice ---
function goToPractice(word: string, usage?: number) { navigateTo('#practice'); setTimeout(() => { void startPracticeForWord(word, usage); }, 50); }
function renderPracticeHistoryList() { const list = document.getElementById('practiceHistoryList'); const wordsWithData = searchHistory.filter(h => h.wordData); if (wordsWithData.length === 0) { list.innerHTML = '<div class="history-empty" style="padding:2rem 0;">Zoek eerst een woord op om mee te oefenen</div>'; return; } list.innerHTML = wordsWithData.map(entry => { const safe = escapeHtml(entry.word); const safeAttr = safe.replace(/"/g, '&quot;'); const plant = getPlantStage(entry.word); const status = escapeHtml(plant.hint || plant.label); return `<li data-action="start-practice-word" data-word="${safeAttr}"><span class="word-label">${safe}</span><span class="word-type-hint">${plant.emoji} ${status}</span></li>`; }).join(''); }
function startPracticeWithInput() { const input = document.getElementById('practiceWordInput') as HTMLInputElement; const word = input.value.trim(); if (!word) return; input.value = ''; startPracticeForWord(word); }
function showPracticePicker(recordCompletion = true) {
  practiceGeneration++; resetPracticeFeedback();
  const word = document.getElementById('practiceChatWord').textContent?.toLowerCase().trim();
  const completed = consumeRealtimePracticeCompletion() || practiceMessages.some(m => m.role === 'user');
  if (recordCompletion && word && completed) { updateWordStats(word, 'practice'); renderHistory(); }
  document.getElementById('practicePickerSection').style.display = '';
  document.getElementById('practiceChatSection').style.display = 'none';
  practiceMessages = []; practiceLoading = false; clearPracticeContext();
  (document.getElementById('chatSendBtn') as HTMLButtonElement).disabled = false;
  resetRealtimeEncounterUi(); switchPracticeMode('voice');
}
window.addEventListener('poortaal:learning-owner', () => {
  stopRealtimeEncounter(); showPracticePicker(false);
  if (currentWordData) renderWordCard(currentWordData);
  updateReviewBadge();
  closeMicroReview(); resetReviewSessionIfActive();
  if (window.location.hash.split('?')[0] === '#review') renderReviewHome();
});

async function startPracticeForWord(word: string, usage?: number) {
  const ticket = ++practiceGeneration;
  stopRealtimeEncounter(); resetPracticeFeedback(); clearPracticeContext();
  const key = word.toLowerCase().trim();
  let data = getCachedWord(key) || searchHistory.find(h => h.word === key)?.wordData;
  document.getElementById('practicePickerSection').style.display = 'none';
  document.getElementById('practiceChatSection').style.display = '';
  document.getElementById('practiceChatWord').textContent = data?.word || word;
  document.getElementById('practiceUsage')!.innerHTML = '';
  practiceMessages = []; practiceLoading = false; resetRealtimeEncounterUi(); switchPracticeMode('voice');
  const start = document.getElementById('voiceStartBtn') as HTMLButtonElement;
  const textMode = document.getElementById('textModeBtn') as HTMLButtonElement;
  start.disabled = true; textMode.disabled = true;
  document.getElementById('voiceStatus').textContent = 'Een toepassing voorbereiden…';
  try {
    if (!data) {
      data = await generateWordExplanation(word, callOpenAI);
      if (ticket !== practiceGeneration) return;
      setWordCache(key, data); addToHistory(key, data);
    }
    data = await loadWordUsage(data);
  } catch { /* Basic word practice remains available if enrichment fails. */ }
  finally {
    if (ticket === practiceGeneration) {
      setPracticeContext(data || { word }, getWordStats()[key]?.practices || 0, usage);
      document.getElementById('practiceUsage')!.innerHTML = renderPracticeUsage(getPracticeContext());
      start.disabled = false; textMode.disabled = false;
      document.getElementById('voiceStatus').textContent = 'Druk op de knop om te beginnen';
    }
  }
}
async function startTextPracticeScenario() {
  if (practiceMessages.length > 0 || practiceLoading) return;
  const word = document.getElementById('practiceChatWord').textContent || ''; if (!word) return;
  const ticket = practiceGeneration;
  practiceLoading = true;
  const entry = searchHistory.find(h => h.word === word.toLowerCase()); const meaningHint = entry?.wordData?.meaning_en ? ` (${entry.wordData.meaning_en})` : ''; const msgs = document.getElementById('chatMessages'); msgs.innerHTML = '<div class="chat-msg system">Scenario wordt voorbereid...</div>';
  practiceMessages = [{ role: 'system', content: `You are a friendly Dutch language tutor running a role-play practice session. The student is learning the word "${word}"${meaningHint}.

Your job:
1. First message: Set up a short, fun real-life scenario in Dutch (with English hint in parentheses) where the student must use "${word}" naturally. Keep it conversational and simple.
2. In subsequent messages: Stay in character for the scenario. Respond naturally in Dutch.
3. Keep the role-play flowing after the student uses the word. Save minor corrections for feedback after the session; clarify immediately only if meaning is blocked.
4. Keep messages short (2-3 sentences max).
5. Mix Dutch and English — primarily Dutch with English support (parentheses) when needed.
6. Use common A2-B1 Dutch. Be warm and give the learner time to answer.
${practiceUsageInstructions()}` }];
  try {
    const response = await callOpenAI([...practiceMessages]);
    if (ticket !== practiceGeneration) return;
    msgs.innerHTML = `<div class="chat-msg tutor">${formatChat(response)}</div>`;
    practiceMessages.push({ role: 'assistant', content: response }); document.getElementById('chatInput').focus();
  } catch {
    if (ticket !== practiceGeneration) return;
    msgs.innerHTML = '<div class="chat-msg system">Kon het scenario niet starten. Probeer opnieuw.</div>'; practiceMessages = [];
  } finally { if (ticket === practiceGeneration) practiceLoading = false; }
}
async function sendChat() {
  const input = document.getElementById('chatInput') as HTMLInputElement;
  const text = input.value.trim(); if (!text || practiceLoading) return;
  const ticket = practiceGeneration; const msgs = document.getElementById('chatMessages');
  resetPracticeFeedback(); practiceMessages.push({ role: 'user', content: text });
  msgs.innerHTML += `<div class="chat-msg user">${escapeHtml(text)}</div>`; input.value = ''; practiceLoading = true;
  (document.getElementById('chatSendBtn') as HTMLButtonElement).disabled = true;
  msgs.innerHTML += '<div class="chat-msg system" id="chatLoading">💭 Even denken...</div>';
  try {
    const response = await callOpenAI([...practiceMessages]);
    if (ticket !== practiceGeneration) return;
    practiceMessages.push({ role: 'assistant', content: response }); document.getElementById('chatLoading')?.remove();
    msgs.innerHTML += `<div class="chat-msg tutor">${formatChat(response)}</div>`;
  } catch {
    if (ticket === practiceGeneration) { document.getElementById('chatLoading')?.remove(); msgs.innerHTML += '<div class="chat-msg system">Fout bij het versturen. Probeer opnieuw.</div>'; }
  } finally {
    if (ticket === practiceGeneration) { practiceLoading = false; (document.getElementById('chatSendBtn') as HTMLButtonElement).disabled = false; msgs.scrollTop = msgs.scrollHeight; }
  }
}
function finishTextPractice(): void {
  const context = getPracticeContext();
  if (!context || practiceLoading) return;
  const turns = practiceMessages.filter(m => m.role !== 'system').map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  void finishPracticeFeedback({ ...context, id: `${context.id}:text`, owner: learningOwner(), turns,
    supportUsed: context.helpUsed, settled: true });
}
function escapeHtml(s: string) { return escapeText(s); }
function formatChat(text: string) { return escapeHtml(text).replace(/\n/g, '<br>'); }

// --- Micro review ---
function startMicroReview(word: string) {
  const entry = searchHistory.find(h => h.word === word);
  if (!entry?.wordData) { trySuggestion(word); return; }
  const panel = document.getElementById('historyPanel'); if (panel.classList.contains('open')) toggleHistory();
  const data = getCachedWord(word) || entry.wordData;
  const stats = getWordStats()[word];
  const review = microReviewPrompt = wordReview(data, stats?.level || 0, stats?.reviews.length || 0, getWordAttempts(word));
  if (data.usage === undefined) void loadWordUsage(data);
  document.getElementById('reviewWord').textContent = data.word;
  document.getElementById('reviewType').textContent = data.type || '';
  document.getElementById('reviewPrompt')!.textContent = review.prompt;
  document.getElementById('reviewNl').textContent = review.nl || '';
  document.getElementById('reviewEn').textContent = review.en || '';
  document.getElementById('reviewAnswer').classList.remove('revealed');
  document.getElementById('reviewActions').innerHTML = '<button class="review-btn-reveal" data-action="micro-reveal">Onthullen</button>';
  document.getElementById('microReviewOverlay').classList.add('open');
  let remaining = 30; const bar = document.getElementById('reviewTimerBar'); const text = document.getElementById('reviewTimerText');
  bar.style.width = '100%'; text.textContent = '30s'; if (microReviewInterval) clearInterval(microReviewInterval);
  microReviewInterval = setInterval(() => { remaining -= 0.1; if (remaining <= 0) { remaining = 0; clearInterval(microReviewInterval!); revealAnswer(); } bar.style.width = ((remaining / 30) * 100) + '%'; text.textContent = Math.ceil(remaining) + 's'; }, 100);
}
function revealAnswer() { if (microReviewInterval) { clearInterval(microReviewInterval); microReviewInterval = null; } document.getElementById('reviewAnswer').classList.add('revealed'); document.getElementById('reviewActions').innerHTML = '<button class="review-btn-know" data-action="micro-finish" data-known="true">Wist ik!</button><button class="review-btn-again" data-action="micro-finish" data-known="false">Opnieuw</button><button class="review-btn-close" data-action="micro-close">Sluiten</button>'; }
function finishReview(knew: boolean) {
  if (!microReviewPrompt || !document.getElementById('microReviewOverlay').classList.contains('open')) return;
  const word = document.getElementById('reviewWord').textContent!.toLowerCase();
  updateWordStats(word, knew ? 'review' : 'review_again');
  if (microReviewPrompt?.usage) recordWordAttempt({ id: crypto.randomUUID(), at: Date.now(), word,
    chunk: microReviewPrompt.usage.chunk, outcome: knew ? 'self-reviewed' : 'needs-practice', source: 'review' });
  closeMicroReview(); if (!knew) trySuggestion(word); renderHistory(); updateReviewBadge();
}
function closeMicroReview() { if (microReviewInterval) { clearInterval(microReviewInterval); microReviewInterval = null; } microReviewPrompt = null; document.getElementById('microReviewOverlay').classList.remove('open'); }

function switchPracticeMode(mode: 'text' | 'voice') { document.getElementById('textModeBtn').classList.toggle('active', mode === 'text'); document.getElementById('voiceModeBtn').classList.toggle('active', mode === 'voice'); document.getElementById('textPracticePanel').style.display = mode === 'text' ? '' : 'none'; document.getElementById('voicePracticePanel').style.display = mode === 'voice' ? '' : 'none'; if (mode === 'voice') { const word = document.getElementById('practiceChatWord').textContent || ''; document.getElementById('voicePracticeWord').textContent = word; } else { void startTextPracticeScenario(); } }

export {
  closeAuthModal,
  closeMicroReview,
  deleteHistoryItem,
  doLogout,
  endReviewSessionToHome,
  exitReviewSession,
  exploreDailyWord,
  finishReview,
  finishTextPractice,
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
  trySuggestion,
};
