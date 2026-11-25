import { gradeExpression, readExpressions, type SavedExpression } from './daily-chat-store';
import { dailyReviewText } from './daily-chat-feedback';
import { advanceStreak, migrateLegacyStreak, readStreak, syncStreak, writeStreak } from './streak';
import { leaveDailyChat, showDailyChat } from './daily-chat-view';
import {
  OpenAIRequestError,
  requestOpenAIChat,
} from './openai-client';
import { consumeRealtimePracticeCompletion, resetRealtimeEncounterUi, stopRealtimeEncounter } from './realtime/encounter-controller';
import { enrichWordUsage, mergeUsageEnrichment } from './usage-generation';
import { escapeText, renderPracticeUsage } from './word-usage-ui';
import { renderWordTips, type UsageLoadState } from './word-card';
import { cloudWordLearning, getWordAttempts, learningOwner, setLearningOwner, clearWordLearning, recordWordAttempt } from './learning-store';
import { setPracticeContext, getPracticeContext, clearPracticeContext, markPracticeHelp } from './practice-context';
import { resetPracticeFeedback } from './practice-feedback';
import { structuredPractice } from './structured-ui';
import { clearStructuredWord } from './structured-store';
import { generateLearningScene, readLearningScene, sceneUsage, rememberSceneExposure, recentlyViewedScene } from './learning-scene';
import { renderLearningScene } from './learning-scene-view';
import { needsUsageReview, wordReviewContent, WORD_MEANING_PROMPT } from './word-learning';
import { clearReviewCheckpoint, readReviewCheckpoint, writeReviewCheckpoint } from './review-session';
import { createWordWriteQueue } from './word-write-queue';
import { mergeCloudWordStats, saveWordWithVersion, supabaseWordStore } from './word-cloud-save';
import {
  generateWordExplanation,
  InvalidWordExplanationError,
  WordExplanationRequestError,
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
type WordReviewItem = { kind: 'word'; id: string; entry: HistoryEntry; stats: Partial<WordStats>; level: number; isDue: boolean; isWilting: boolean; overdueDays: number };
type ReviewItem = WordReviewItem | (SavedExpression & { kind: 'expression' });
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
  if (currentUser) void syncAccountStreak();
  refreshStreakBadge();
}

function refreshStreakBadge() {
  const badge = document.querySelector('.streak-badge');
  if (badge) badge.textContent = '\u{1F333} Dag ' + getStreak().count;
}
async function syncAccountStreak(practice = false): Promise<void> {
  const owner = currentUser?.id;
  if (!owner) return;
  const active = () => currentUser?.id === owner;
  migrateLegacyStreak(owner);
  try {
    await queueWordWrite(owner, '__account_streak__', () => syncStreak(supabaseClient, owner, active, practice));
    if (active()) refreshStreakBadge();
  } catch {
    if (active()) document.querySelector('.streak-badge')?.setAttribute('title',
      'Streak saved on this device. Account sync failed; sign in again or retry later.');
  }
}

// Cloud sync
async function syncFromCloud() {
  if (!currentUser) return;
  const userId = currentUser.id;
  const statsAtStart = getWordStats();
  const ind = document.getElementById('syncIndicator');
  ind.classList.add('syncing');
  try {
    const { data: cloudWordsRaw, error: wordsError } = await supabaseClient.from('user_words').select('*').eq('user_id', userId);
    if (wordsError) throw wordsError;
    const { data: cloudHistoryRaw, error: historyError } = await supabaseClient.from('user_history').select('*').eq('user_id', userId);
    if (historyError) throw historyError;
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
        const local = localStats[cw.word];
        // Grades entered while the download was in flight can be newer than the cloud snapshot.
        const progress = local && JSON.stringify(local) !== JSON.stringify(statsAtStart[cw.word])
          ? mergeCloudWordStats(cw, { ...local, last_seen: local.lastSeen }) : cw;
        localStats[cw.word] = {
          lookups: progress.lookups || 0,
          practices: progress.practices || 0,
          reviews: progress.reviews || [],
          level: progress.level || 0,
          lastSeen: progress.last_seen || Date.now(),
        };
        const cloud = readSavedWordExplanation(cw.word_data);
        if (cloud) {
          const local = getCachedWord(cw.word);
          const merged = { ...cloud, usage: cloud.usage ?? local?.usage };
          if (JSON.stringify(merged) !== JSON.stringify(local)) learningChanged = true;
          setWordCache(cw.word, merged);
        }
      }
    }
    const openWord = currentWord?.toLowerCase().trim();
    if (currentWordData && cloudWords.some(cw => cw.word.toLowerCase().trim() === openWord)) {
      const syncedWord = openWord ? getCachedWord(openWord) : null;
      if (syncedWord) currentWordData = syncedWord;
      renderWordCard(currentWordData);
    }
    localStorage.setItem('poortaal_word_stats', JSON.stringify(localStats));
    if (learningChanged) closeMicroReview();
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
    renderReviewRoute();
  } catch (e) {
    console.error('Sync error:', e);
  } finally {
    ind.classList.remove('syncing');
  }
}

async function saveWordStatsToCloud(word: string, retry?: { before: WordExplanation; generated: WordExplanation }) {
  const userId = currentUser?.id;
  if (!userId) return;
  await queueWordWrite(userId, word, async () => {
    const active = () => currentUser?.id === userId && learningOwner() === userId;
    const saved = await saveWordWithVersion(supabaseWordStore(supabaseClient, userId, word), () => {
      const stats = getWordStats()[word];
      return stats ? { user_id: userId, word, lookups: stats.lookups || 0,
        practices: stats.practices || 0, reviews: stats.reviews || [], level: stats.level || 0,
        last_seen: stats.lastSeen || Date.now(), word_data: {
          ...wordCloudData(word), ...(retry && getCachedWord(word)
            ? mergeUsageEnrichment(getCachedWord(word)!, retry.generated, retry.before) : {}),
        } } : null;
    }, active, Date.now, retry?.before);
    if (!saved || !active()) return;
    const stats = getWordStats();
    if (!stats[word]) return;
    const localStats = { ...stats[word], last_seen: stats[word].lastSeen };
    const statsBefore = JSON.stringify(mergeCloudWordStats({}, localStats));
    const mergedStats = mergeCloudWordStats(saved, localStats);
    const { last_seen, ...progress } = mergedStats;
    stats[word] = { ...progress, lastSeen: last_seen };
    localStorage.setItem('poortaal_word_stats', JSON.stringify(stats));
    const attemptsBefore = JSON.stringify(getWordAttempts(word));
    cloudWordLearning(word, saved.word_data, userId);
    const cached = getCachedWord(word);
    const cloud = readSavedWordExplanation(saved.word_data);
    const changed = statsBefore !== JSON.stringify(mergedStats) || attemptsBefore !== JSON.stringify(getWordAttempts(word))
      || (cloud && JSON.stringify(cloud) !== JSON.stringify(cached));
    if (cloud) setWordCache(word, cloud);
    if (changed) {
      if (currentWord?.toLowerCase().trim() === word.toLowerCase().trim() && cloud) {
        currentWordData = cloud; renderWordCard(cloud);
      }
      closeMicroReview(); updateReviewBadge();
      renderReviewRoute();
    }
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
  const { data: { user } } = await supabaseClient.auth.getUser().catch((error: unknown) => {
    console.error('Auth initialization error:', error);
    return { data: { user: null } };
  });
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
  reviewOwnerReady = true;
  renderReviewRoute();
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
let reviewOwnerReady = false;
let reviewQueue: ReviewItem[] = [];
let reviewIndex = 0;
let reviewResults = { know: 0, again: 0 };
let reviewStep: 'prompt' | 'sentence' | 'answer' = 'prompt';
let reviewSessionActive = false;
let currentWordReview: ReturnType<typeof wordReviewContent> | null = null;
let practiceGeneration = 0;
let microReviewInterval: ReturnType<typeof setInterval> | null = null;
let microReviewPrompt: ReturnType<typeof wordReviewContent> | null = null;

// --- Routing ---
function navigateTo(hash: string) {
  window.location.hash = hash;
}

function renderReviewRoute() {
  const [route] = window.location.hash.split('?', 1);
  if (route !== '#review') return;
  if (!reviewOwnerReady) {
    document.getElementById('reviewHomeSection')!.innerHTML = '<div class="review-empty" role="status">Herhaling laden…</div>';
    return;
  }
  if (!restoreReviewSession()) renderReviewHome();
}

function renderReviewHome() {
  const home = document.getElementById('reviewHomeSection');
  const session = document.getElementById('reviewSessionSection');
  if (!home || !session) return;
  home.style.display = '';
  session.style.display = 'none';

  const due = getDueReviewItems();
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
  const wilting = due.filter(item => item.kind === 'word' && item.isWilting).length;
  const today = due.length - wilting;
  const breakdownParts: string[] = [];
  if (wilting > 0) breakdownParts.push(`🥀 ${wilting} verwelkt`);
  if (today > 0) breakdownParts.push(`🌿 ${today} vandaag`);
  const breakdown = breakdownParts.join(' · ');
  home.innerHTML = `
    <div class="review-home">
      <h1>Herhalen</h1>
      <div class="review-count-card">
        <div class="review-count-num">${due.length}</div>
        <div class="review-count-label">Vandaag te herhalen</div>
        <div class="review-count-breakdown">${breakdown}</div>
      </div>
      <button class="review-start-btn" data-action="start-review">▶ Begin herhaling</button>
      <div class="review-start-meta">automatisch volgende</div>
    </div>
  `;
}

function checkpointReviewSession() {
  if (!reviewSessionActive) return;
  const wordMeaningRevealed = reviewQueue[reviewIndex]?.kind === 'word' && reviewStep !== 'prompt';
  writeReviewCheckpoint(learningOwner(), {
    cards: reviewQueue.map(({ kind, id }) => ({ kind, id })),
    index: reviewIndex,
    know: reviewResults.know,
    again: reviewResults.again,
    revealed: reviewStep === 'answer',
    ...(wordMeaningRevealed ? { wordMeaningRevealed: true } : {}),
  });
}
function restoreReviewSession(): boolean {
  if (reviewSessionActive) return true;
  const saved = readReviewCheckpoint(learningOwner());
  if (!saved) return false;
  const entries = new Map(searchHistory.map(entry => [entry.word, entry]));
  const currentDue = new Map(getDueWords().map(item => [item.entry.word, item]));
  const expressions = new Map(readExpressions(learningOwner()).map(item => [item.id, { ...item, kind: 'expression' as const }]));
  const stats = getWordStats();
  const queue: ReviewItem[] = [];
  let missingBefore = 0;
  for (const [index, { kind, id }] of saved.cards.entries()) {
    let item: ReviewItem | undefined = kind === 'word' ? currentDue.get(id) : expressions.get(id);
    if (!item && kind === 'word') {
      const entry = entries.get(id);
      const wordData = entry && (getCachedWord(id) || entry.wordData);
      const current: Partial<WordStats> = stats[id] || {};
      if (entry && wordData) item = {
        kind, id, entry: { ...entry, wordData }, stats: current, level: current.level || 0,
        isDue: false, isWilting: false, overdueDays: 0,
      };
    }
    if (item) queue.push(item);
    else if (index < saved.index) missingBefore++;
  }
  // History may still be arriving from cloud sync; keep the checkpoint until then.
  if (!queue.length) return false;
  reviewQueue = queue;
  reviewIndex = Math.min(queue.length, Math.max(0, saved.index - missingBefore));
  // Removed history entries must not produce an impossible checkpoint.
  const know = Math.min(saved.know, reviewIndex);
  reviewResults = { know, again: Math.min(saved.again, reviewIndex - know) };
  const resumed = queue[reviewIndex];
  const previous = saved.cards[saved.index];
  reviewStep = 'prompt';
  if (resumed && resumed.kind === previous?.kind && resumed.id === previous.id) {
    const word = resumed.kind === 'word';
    if (saved.revealed && (!word || saved.wordMeaningRevealed)) reviewStep = 'answer';
    else if (word && (saved.revealed || saved.wordMeaningRevealed)) reviewStep = 'sentence';
  }
  reviewSessionActive = true;
  currentWordReview = null;
  document.getElementById('reviewHomeSection')!.style.display = 'none';
  document.getElementById('reviewSessionSection')!.style.display = '';
  checkpointReviewSession();
  renderReviewSession();
  return true;
}

function startReviewSession() {
  if (!reviewOwnerReady || restoreReviewSession()) return;
  const due = getDueReviewItems();
  if (due.length === 0) {
    renderReviewHome();
    return;
  }
  reviewQueue = due;
  reviewIndex = 0;
  reviewResults = { know: 0, again: 0 };
  reviewStep = 'prompt';
  reviewSessionActive = true;
  currentWordReview = null;
  checkpointReviewSession();
  document.getElementById('reviewHomeSection').style.display = 'none';
  document.getElementById('reviewSessionSection').style.display = '';
  renderReviewSession();
}

function renderReviewExample(sentence: string) {
  const text = escapeHtml(sentence);
  return `<div class="example-nl review-example"><span class="answer-nl" lang="nl">${text}</span>
    <button type="button" class="ex-tts-btn" data-action="play-example-tts" data-text="${text}" aria-label="Voorbeeldzin beluisteren" title="Voorbeeldzin beluisteren">🔊</button></div>`;
}

function renderReviewMeaning(review: ReturnType<typeof wordReviewContent>) {
  return `<div class="review-word-meaning"><div lang="nl">${escapeHtml(review.meaningNl)}</div>
    <div lang="en">${escapeHtml(review.meaningEn)}</div></div>`;
}

function renderReviewSession() {
  const root = document.getElementById('reviewSessionSection');
  if (!root) return;
  if (reviewIndex >= reviewQueue.length) {
    renderReviewSummary();
    return;
  }
  const item = reviewQueue[reviewIndex];
  const data = item.kind === 'word' ? getCachedWord(item.id) || item.entry.wordData! : null;
  if (item.kind === 'word' && data) {
    currentWordReview ||= wordReviewContent(data, item.stats.reviews?.length || 0, getWordAttempts(item.id));
  }
  const review = currentWordReview;
  const expression = item.kind === 'expression' ? item.card : null;
  const expressionText = expression && dailyReviewText(expression);
  const meaningPrompt = review && reviewStep === 'prompt';
  const prompt = expressionText?.prompt ?? (meaningPrompt ? WORD_MEANING_PROMPT : review?.prompt ?? '');
  const total = reviewQueue.length;
  const pct = Math.round((reviewIndex / total) * 100);
  const pill = item.kind === 'word' && item.isWilting
    ? `<span class="review-stage-pill">🥀 ${item.overdueDays}d te laat</span>`
    : `<span class="review-stage-pill fresh">${expression ? 'Daily Chat' : '🌿 vandaag'}</span>`;
  const answerEn = escapeHtml(expressionText?.note ?? review?.note ?? '');
  const practiceAloud = expressionText?.practiceAloud;
  const answer = renderReviewExample(expression?.dutch ?? review?.nl ?? '');
  const hint = practiceAloud ? 'tik voor de uitleg'
    : meaningPrompt ? 'tik voor de betekenis' : 'probeer eerst zelf · tik voor een voorbeeld';
  const safeWord = escapeHtml(item.kind === 'word' ? item.id : '');
  const safeType = escapeHtml(data?.type || '');
  const revealed = reviewStep === 'answer';
  const revealedClass = revealed ? 'revealed' : '';
  const actionsDisabled = revealed ? '' : 'disabled';
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
          ${data ? `<div class="review-card-word">${safeWord}</div>` : ''}
          ${safeType ? `<div class="review-card-type">${safeType}</div>` : ''}
          ${review && !meaningPrompt ? renderReviewMeaning(review) : ''}
          <div class="review-card-task">${escapeHtml(prompt)}</div>
          ${practiceAloud ? answer : ''}
          ${data ? `<button type="button" class="tts-btn review-tts-btn" data-action="play-example-tts" data-text="${safeWord}" aria-label="Woord beluisteren" title="Uitspraak beluisteren">🔊</button>` : ''}
          <div class="review-card-hint" id="reviewCardHint" ${revealed ? 'hidden' : ''}>${hint}</div>
          <div class="review-card-answer ${revealedClass}" id="reviewCardAnswer">
            ${practiceAloud ? '' : answer}
            ${answerEn ? `<div class="answer-en">${answerEn}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="review-actions">
        <button class="review-btn-again" id="reviewBtnAgain" data-action="grade-review" data-known="false" ${actionsDisabled}>Opnieuw</button>
        <button class="review-btn-know" id="reviewBtnKnow" data-action="grade-review" data-known="true" ${actionsDisabled}>Dat lukte!</button>
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
    if (reviewStep !== 'answer' || (e.target as Element | null)?.closest('button')) return;
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
  const commitOrReset = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (event.type === 'pointercancel' || reviewStep !== 'answer' || Math.abs(dx) <= 80) {
      reset();
      return;
    }
    const known = dx > 0;
    card.classList.add('swipe-anim');
    card.style.transform = known ? 'translateX(120%) rotate(20deg)' : 'translateX(-120%) rotate(-20deg)';
    setTimeout(() => {
      if (document.getElementById('reviewFrontCard') !== card) return;
      gradeAndAdvance(known);
      if (card.isConnected) reset();
    }, 200);
  };
  card.addEventListener('pointerup', commitOrReset);
  card.addEventListener('pointercancel', commitOrReset);
}

function onReviewCardTap() {
  if (!reviewSessionActive || reviewStep === 'answer') return;
  if (currentWordReview && reviewStep === 'prompt') {
    reviewStep = 'sentence';
    checkpointReviewSession();
    renderReviewSession();
    return;
  }
  reviewStep = 'answer';
  checkpointReviewSession();
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
  if (!reviewSessionActive || reviewStep !== 'answer') return;
  const item = reviewQueue[reviewIndex];
  if (!item) return;
  if (item.kind === 'expression') {
    try { gradeExpression(learningOwner(), item.id, known); }
    catch { showToast('Kon de herhaling niet opslaan. Probeer opnieuw.'); return; }
  } else {
    const word = item.id;
    updateWordStats(word, known ? 'review' : 'review_again');
    if (currentWordReview?.usage) recordWordAttempt({ id: crypto.randomUUID(), at: Date.now(), word,
      chunk: currentWordReview.usage.chunk, outcome: known ? 'self-reviewed' : 'needs-practice', source: 'review' });
  }
  if (known) reviewResults.know++;
  else reviewResults.again++;
  updateReviewBadge();
  if (item.kind === 'word') renderHistory();
  reviewIndex++;
  currentWordReview = null;
  reviewStep = 'prompt';
  checkpointReviewSession();
  renderReviewSession();
  window.scrollTo?.(0, 0);
}
function renderReviewSummary() {
  const root = document.getElementById('reviewSessionSection');
  if (!root) return;
  const know = reviewResults.know;
  const again = reviewResults.again;
  const lines: string[] = [];
  if (know > 0) lines.push(`<div class="review-summary-stat">🌳 ${know} wist je</div>`);
  if (again > 0) lines.push(`<div class="review-summary-stat">🥀 ${again} opnieuw</div>`);
  if (lines.length === 0) lines.push('<div class="review-summary-stat">Geen kaarten beoordeeld</div>');
  root.innerHTML = `
    <div class="review-summary">
      <div class="review-summary-emoji">🌳</div>
      <div class="review-summary-title">Klaar!</div>
      ${lines.join('')}
      <button class="review-summary-btn" data-action="end-review">Naar Herhalen</button>
    </div>
  `;
}
function endReviewSessionToHome() {
  clearReviewCheckpoint(learningOwner());
  reviewSessionActive = false; reviewQueue = []; reviewIndex = 0; reviewResults = { know: 0, again: 0 }; reviewStep = 'prompt'; currentWordReview = null; renderReviewHome();
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
  reviewSessionActive = false; reviewQueue = []; reviewIndex = 0; reviewResults = { know: 0, again: 0 }; reviewStep = 'prompt';
  currentWordReview = null;
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
  const isDailyChat = route === '#daily-chat';
  document.getElementById('view-daily-chat')?.classList.toggle('active', isDailyChat);
  if (isDailyChat) showDailyChat(API_BASE);
  else leaveDailyChat();
  const isReview = route === '#review';
  document.getElementById('view-home').classList.toggle('active', isHome);
  document.getElementById('view-practice').classList.toggle('active', isPractice);
  document.getElementById('view-review').classList.toggle('active', isReview);
  document.getElementById('nav-home').classList.toggle('active', isHome);
  document.getElementById('nav-practice').classList.toggle('active', isPractice || isDailyChat);
  document.getElementById('nav-review').classList.toggle('active', isReview);
  if (isPractice) { renderPracticeHistoryList(); if (!structuredPractice.session) restoreStructuredPractice(); }
  else { stopRealtimeEncounter(); showPracticePicker(); }
  if (isReview) {
    renderReviewRoute();
    window.scrollTo?.(0, 0);
  } else resetReviewSessionIfActive();
}
window.addEventListener('hashchange', handleRoute);
window.addEventListener('poortaal:expression-saved', updateReviewBadge);
window.addEventListener('pagehide', () => leaveDailyChat());
window.addEventListener('pageshow', () => {
  if (window.location.hash.split('?')[0] === '#daily-chat') showDailyChat(API_BASE);
});

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
function getStreak(): { lastDate: string | null; count: number } { return readStreak(currentUser?.id || null); }
function updateStreak() {
  const value = advanceStreak(getStreak());
  writeStreak(currentUser?.id || null, value);
  void syncAccountStreak(true);
  return value;
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
  if (microReviewPrompt || !reviewSessionActive || reviewIndex >= reviewQueue.length) return;
  const focused = document.activeElement;
  if (focused?.matches('input, textarea')) return;
  const revealKey = e.key === ' ' || e.code === 'Space';
  if ((revealKey || e.key === 'Enter') && focused?.closest('#reviewFrontCard button')) return;
  if (revealKey) {
    e.preventDefault();
    if (!e.repeat) onReviewCardTap();
  } else if (reviewStep === 'answer' && ['Enter', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
    e.preventDefault();
    gradeAndAdvance(e.key !== 'ArrowLeft');
  }
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
function getDueWords(): WordReviewItem[] {
  const stats = getWordStats(); const today = startOfDay(Date.now());
  return searchHistory.filter(entry => entry.wordData).map(entry => {
    const s: Partial<WordStats> = stats[entry.word] || {}; const level = s.level || 0;
    const dueDay = startOfDay((s.lastSeen || 0) + getNextInterval(level) * 86400000);
    const data = getCachedWord(entry.word) || entry.wordData!;
    const usageDue = needsUsageReview(data, getWordAttempts(entry.word));
    return { kind: 'word' as const, id: entry.word, entry, stats: s, level, isDue: usageDue || (dueDay <= today && level < 4),
      isWilting: dueDay < today && level < 4, overdueDays: Math.max(0, Math.round((today - dueDay) / 86400000)) };
  }).filter(x => x.isDue).sort((a, b) => b.overdueDays - a.overdueDays);
}
function getDueReviewItems(): ReviewItem[] {
  const words = getDueWords();
  const now = Date.now();
  const expressions = readExpressions(learningOwner())
    .filter(item => item.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
    .map(item => ({ ...item, kind: 'expression' as const }));
  const queue: ReviewItem[] = [];
  for (const [index, word] of words.entries()) {
    queue.push(word);
    if (index < expressions.length) queue.push(expressions[index]);
  }
  return queue.concat(expressions.slice(words.length));
}
function updateReviewBadge() {
  const badge = document.getElementById('navReviewBadge');
  if (!badge) return;
  const count = getDueReviewItems().length;
  badge.hidden = count === 0;
  badge.textContent = String(count);
}
function renderHistory() {
  const list = document.getElementById('historyList'); const summaryEl = document.getElementById('historySummary'); if (searchHistory.length === 0) { list.innerHTML = '<div class="history-empty">Nog geen woorden opgezocht</div>'; summaryEl.innerHTML = ''; return; }
  const counts: Record<PlantStageKey, number> = { strong: 0, growing: 0, sprout: 0, seed: 0, wilting: 0 };
  const rows = searchHistory.map(entry => { const safe = escapeHtml(entry.word); const safeAttr = safe.replace(/"/g, '&quot;'); const plant = getPlantStage(entry.word); counts[plant.key]++; const isWilting = plant.key === 'wilting' && Boolean(entry.wordData); return `<li><div class="swipe-delete" data-action="delete-history" data-word="${safeAttr}">Verwijder</div><div class="swipe-content" data-action="history-word" data-word="${safeAttr}" data-review="${isWilting}"><span class="history-word">${safe}</span><span class="plant-stage" title="${plant.hint || ''}"><span class="plant-emoji">${plant.emoji}</span><span class="plant-label">${plant.hint || plant.label}</span></span></div></li>`; });
  list.innerHTML = rows.join(''); initSwipeHandlers(list); const parts: string[] = []; if (counts.strong) parts.push(`🌳 ${counts.strong} sterk`); if (counts.growing) parts.push(`🪴 ${counts.growing} groeiend`); if (counts.sprout) parts.push(`🌿 ${counts.sprout} kiempjes`); if (counts.seed) parts.push(`🌱 ${counts.seed} zaaisel`); if (counts.wilting) parts.push(`🥀 ${counts.wilting} verwelkt`); summaryEl.innerHTML = parts.join(' · ');
}
function deleteHistoryItem(word: string) {
  if (structuredPractice.session?.word.toLowerCase().trim() === word.toLowerCase().trim()) {
    stopRealtimeEncounter(); structuredPractice.stop(true);
  }
  clearStructuredWord(word);
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
async function callOpenAI(messages: ChatMessage[], temperature = 0.7, model?: string): Promise<string> {
  try {
    return await requestOpenAIChat(API_BASE, messages, temperature, fetch, model);
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
  return { ...data, usage_progress: getWordAttempts(word) };
}
function getWordCache(): Record<string, unknown> { try { return JSON.parse(localStorage.getItem(WORD_CACHE_KEY) || '{}') as Record<string, unknown>; } catch { return {}; } }
function setWordCache(word: string, data: unknown) { const cache = getWordCache(); cache[word.toLowerCase().trim()] = data; const keys = Object.keys(cache); if (keys.length > 200) delete cache[keys[0]]; localStorage.setItem(WORD_CACHE_KEY, JSON.stringify(cache)); }
function getCachedWord(word: string): WordExplanation | null {
  const key = word.toLowerCase().trim();
  const cache = getWordCache();
  const cached = cache[key];
  if (!cached) return null;
  try {
    const data = readSavedWordExplanation(cached);
    if (!data) throw new Error('Invalid cached word explanation');
    return data;
  } catch (error) {
    delete cache[key];
    localStorage.setItem(WORD_CACHE_KEY, JSON.stringify(cache));
    console.warn(`Removed invalid cached word explanation for "${key}"`, error);
    return null;
  }
}

const usageRequests = new Map<string, Promise<WordExplanation>>();
const usageStates = new Map<string, UsageLoadState>();
function refreshUsageCard(key: string) {
  if (currentWord?.toLowerCase().trim() !== key) return;
  const latest = getCachedWord(key);
  if (latest) { currentWordData = latest; renderWordCard(latest); }
}
function loadWordUsage(data: WordExplanation, retryEmpty = false): Promise<WordExplanation> {
  const key = data.word.toLowerCase().trim();
  const owner = learningOwner();
  const requestKey = `${owner}:${key}`;
  if (data.usage !== undefined && (!retryEmpty || data.usage.length)) {
    if (usageStates.delete(requestKey)) refreshUsageCard(key);
    return Promise.resolve(data);
  }
  const existing = usageRequests.get(requestKey);
  if (existing) return existing;
  usageStates.set(requestKey, 'loading');
  refreshUsageCard(key);
  const request = enrichWordUsage(data, callOpenAI, retryEmpty).then(enriched => {
    usageStates.delete(requestKey);
    const latest = getCachedWord(key);
    if (!latest || owner !== learningOwner()) return enriched;
    enriched = mergeUsageEnrichment(latest, enriched, retryEmpty ? data : undefined);
    setWordCache(key, enriched);
    const entry = searchHistory.find(h => h.word === key);
    if (entry) {
      entry.wordData = enriched;
      localStorage.setItem('poortaal_history', JSON.stringify(searchHistory));
      if (owner === learningOwner()) {
        void saveHistoryToCloud(key, enriched);
        void saveWordStatsToCloud(key, retryEmpty ? { before: data, generated: enriched } : undefined);
      }
    }
    return enriched;
  }).catch(error => {
    usageStates.set(requestKey, error instanceof OpenAIRequestError ? error.kind === 'network' ? 'network' : 'http' : 'format');
    console.warn('Word usage unavailable', { word: key, kind: usageStates.get(requestKey) });
    return getCachedWord(key) || data;
  }).finally(() => { usageRequests.delete(requestKey); if (owner === learningOwner()) refreshUsageCard(key); });
  usageRequests.set(requestKey, request);
  return request;
}
export async function retryWordUsage(word: string) {
  const data = getCachedWord(word);
  if (data) await loadWordUsage(data, true);
}
window.addEventListener('poortaal:word-learning', event => {
  const { word, owner } = (event as CustomEvent<{ word: string; owner: string }>).detail;
  if (owner !== learningOwner()) return;
  if (currentUser?.id === owner) void saveWordStatsToCloud(word);
  if (currentWordData?.word.toLowerCase().trim() === word) renderWordCard(currentWordData);
  updateReviewBadge();
});
window.addEventListener('poortaal:structured-result', event => {
  const { word, owner } = (event as CustomEvent<{ word: string; owner: string }>).detail;
  if (owner !== learningOwner()) return;
  updateWordStats(word, 'practice'); renderHistory(); updateReviewBadge();
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
    } else if (!(e instanceof WordExplanationRequestError)) {
      console.error('Unexpected error while processing word lookup', e);
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
  const usageKey = `${learningOwner()}:${data.word.toLowerCase().trim()}`;
  if (data.usage !== undefined) usageStates.delete(usageKey);
  content.innerHTML = `<div class="card" id="wordCard"><div class="card-label">Word</div>
    <div class="word-header"><h1>${word}</h1><span class="word-type">${escapeHtml(data.type)}</span>
    <button class="tts-btn" id="ttsBtn" data-action="play-word-tts" data-word="${word}" title="Uitspraak beluisteren">🔊</button></div>
    <div class="meaning"><div class="meaning-nl">${escapeHtml(data.meaning_nl)}</div><div class="meaning-en">${escapeHtml(data.meaning_en)}</div></div></div>
    ${renderLearningScene(data, sceneStates.get(usageKey))}${renderWordTips(data)}
    ${readLearningScene(data.scene, data) ? '' : `<button class="practice-btn" data-action="practice-word" data-word="${word}">Start conversation</button>`}`;
  if (!readLearningScene(data.scene, data)) void loadLearningScene(data);
  else if (document.getElementById('view-home').classList.contains('active')) rememberSceneExposure(data, learningOwner());
}

const sceneStates = new Map<string, 'loading' | 'error'>();
const sceneRequests = new Map<string, Promise<void>>();
async function loadLearningScene(data: WordExplanation, retry = false): Promise<void> {
  const owner = learningOwner(), key = data.word.toLowerCase().trim(), token = `${owner}:${key}`;
  if (readLearningScene(data.scene, data) || (!retry && sceneStates.has(token))) return;
  if (sceneRequests.has(token)) return sceneRequests.get(token);
  sceneStates.set(token, 'loading');
  const request = (async () => {
    try {
      const enriched = await loadWordUsage(data);
      if (enriched.usage === undefined) throw new Error('Usage still unavailable');
      const scene = await generateLearningScene(enriched, callOpenAI);
      const latest = getCachedWord(key);
      if (owner !== learningOwner() || !latest || latest.meaning_en !== scene.sense || sceneUsage(latest) !== scene.usage) { sceneStates.delete(token); return; }
      const saved = { ...latest, scene }; setWordCache(key, saved);
      const entry = searchHistory.find(h => h.word === key);
      if (entry) { entry.wordData = saved; localStorage.setItem('poortaal_history', JSON.stringify(searchHistory)); }
      void saveHistoryToCloud(key, saved); void saveWordStatsToCloud(key);
      sceneStates.delete(token);
    } catch { sceneStates.set(token, 'error'); }
    finally {
      sceneRequests.delete(token);
      const cached = getCachedWord(key);
      if (cached && owner === learningOwner() && currentWord?.toLowerCase().trim() === key) {
        currentWordData = cached; renderWordCard(currentWordData);
      }
    }
  })();
  sceneRequests.set(token, request); return request;
}
export async function retryLearningScene(word: string): Promise<void> {
  const data = getCachedWord(word);
  if (data) await loadLearningScene(data, true);
}

// --- Practice ---
function goToPractice(word: string, usage?: number) { navigateTo('#practice'); setTimeout(() => { void startPracticeForWord(word, usage, true); }, 50); }
function renderPracticeHistoryList() { const list = document.getElementById('practiceHistoryList'); const wordsWithData = searchHistory.filter(h => h.wordData); if (wordsWithData.length === 0) { list.innerHTML = '<div class="history-empty" style="padding:2rem 0;">Look up a word to start practising</div>'; return; } list.innerHTML = wordsWithData.map(entry => { const safe = escapeHtml(entry.word); const safeAttr = safe.replace(/"/g, '&quot;'); const plant = getPlantStage(entry.word); const status = escapeHtml(plant.hint || plant.label); return `<li data-action="start-practice-word" data-word="${safeAttr}"><span class="word-label">${safe}</span><span class="word-type-hint">${plant.emoji} ${status}</span></li>`; }).join(''); }
function startPracticeWithInput() { const input = document.getElementById('practiceWordInput') as HTMLInputElement; const word = input.value.trim(); if (!word) return; input.value = ''; startPracticeForWord(word); }
function setPracticePreparing(disabled: boolean): void {
  for (const id of ['voiceStartBtn', 'textModeBtn', 'voiceModeBtn']) {
    (document.getElementById(id) as HTMLButtonElement).disabled = disabled;
  }
}
function showPracticePicker(recordCompletion = true) {
  practiceGeneration++; resetPracticeFeedback();
  const word = document.getElementById('practiceChatWord').textContent?.toLowerCase().trim();
  const completed = consumeRealtimePracticeCompletion();
  if (recordCompletion && word && completed) { updateWordStats(word, 'practice'); renderHistory(); }
  document.getElementById('practicePickerSection').style.display = '';
  document.getElementById('practiceChatSection').style.display = 'none';
  structuredPractice.stop(true); clearPracticeContext();
  setPracticePreparing(false);
  resetRealtimeEncounterUi(); switchPracticeMode('voice');
}
window.addEventListener('poortaal:learning-owner', () => {
  leaveDailyChat(true);
  if (window.location.hash.split('?')[0] === '#daily-chat') showDailyChat(API_BASE);
  stopRealtimeEncounter(); showPracticePicker(false);
  if (currentWordData) renderWordCard(currentWordData);
  updateReviewBadge();
  closeMicroReview(); resetReviewSessionIfActive();
  renderReviewRoute();
  if (window.location.hash.split('?')[0] === '#practice') restoreStructuredPractice();
});

function restoreStructuredPractice(): void {
  if (!structuredPractice.restore()) return;
  const s = structuredPractice.session!;
  setPracticeContext({ word: s.word, usage: s.usage ? [s.usage] : [] });
  if (s.supportUsed) markPracticeHelp();
  document.getElementById('practicePickerSection').style.display = 'none';
  document.getElementById('practiceChatSection').style.display = '';
  document.getElementById('practiceChatWord').textContent = s.word;
  document.getElementById('practiceUsage').innerHTML = renderPracticeUsage(getPracticeContext());
  setPracticePreparing(false);
  void switchPracticeMode(s.delivery === 'voice' ? 'voice' : 'text');
}

async function startPracticeForWord(word: string, usage?: number, helped = false) {
  const ticket = ++practiceGeneration;
  stopRealtimeEncounter(); resetPracticeFeedback(); clearPracticeContext();
  const key = word.toLowerCase().trim();
  let data = getCachedWord(key) || searchHistory.find(h => h.word === key)?.wordData;
  document.getElementById('practicePickerSection').style.display = 'none';
  document.getElementById('practiceChatSection').style.display = '';
  document.getElementById('practiceChatWord').textContent = data?.word || word;
  document.getElementById('practiceUsage')!.innerHTML = '';
  structuredPractice.stop(); resetRealtimeEncounterUi(); void switchPracticeMode('voice');
  setPracticePreparing(true);
  document.getElementById('voiceStatus').textContent = 'Preparing your task…';
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
      if (helped || (data && recentlyViewedScene(data, learningOwner()))) markPracticeHelp();
      document.getElementById('practiceUsage')!.innerHTML = renderPracticeUsage(getPracticeContext());
      setPracticePreparing(false);
      document.getElementById('voiceStatus').textContent = 'Start when you are ready';
      const context = getPracticeContext()!;
      await structuredPractice.start(context.word, context.usage, context.helpUsed, {
        voice: true, meaning: context.meaning, studiedScenario: context.helpUsed ? context.studiedScenario : undefined,
      });
    }
  }
}
function escapeHtml(s: string) { return escapeText(s); }

// --- Micro review ---
function startMicroReview(word: string) {
  const entry = searchHistory.find(h => h.word === word);
  if (!entry?.wordData) { trySuggestion(word); return; }
  const panel = document.getElementById('historyPanel'); if (panel.classList.contains('open')) toggleHistory();
  const data = getCachedWord(word) || entry.wordData;
  const stats = getWordStats()[word];
  const review = microReviewPrompt = wordReviewContent(data, stats?.reviews?.length || 0, getWordAttempts(word));
  document.getElementById('reviewWord').textContent = data.word;
  document.getElementById('reviewType').textContent = data.type || '';
  document.getElementById('reviewPrompt').textContent = WORD_MEANING_PROMPT;
  const meaning = document.getElementById('reviewMeaning');
  meaning.hidden = true;
  meaning.innerHTML = renderReviewMeaning(review);
  const answer = document.getElementById('reviewAnswer');
  answer.classList.remove('revealed');
  answer.innerHTML = renderReviewExample(review.nl)
    + (review.note ? `<div class="answer-en">${escapeHtml(review.note)}</div>` : '');
  document.getElementById('reviewActions').innerHTML = '<button class="review-btn-reveal" data-action="micro-reveal">Onthullen</button>';
  document.getElementById('microReviewOverlay').classList.add('open');
  startMicroReviewCountdown();
}
function startMicroReviewCountdown() {
  if (microReviewInterval) clearInterval(microReviewInterval);
  const bar = document.getElementById('reviewTimerBar');
  const text = document.getElementById('reviewTimerText');
  let ticks = 300;
  bar.style.width = '100%';
  text.textContent = '30s';
  microReviewInterval = setInterval(() => {
    ticks--;
    bar.style.width = `${ticks / 3}%`;
    text.textContent = `${Math.ceil(ticks / 10)}s`;
    if (ticks === 0) revealAnswer();
  }, 100);
}
function revealAnswer() {
  if (!microReviewPrompt) return;
  const meaning = document.getElementById('reviewMeaning');
  if (meaning.hidden) {
    meaning.hidden = false;
    document.getElementById('reviewPrompt').textContent = microReviewPrompt.prompt;
    startMicroReviewCountdown();
    return;
  }
  if (microReviewInterval) clearInterval(microReviewInterval);
  microReviewInterval = null;
  document.getElementById('reviewAnswer').classList.add('revealed');
  document.getElementById('reviewActions').innerHTML = '<button class="review-btn-know" data-action="micro-finish" data-known="true">Dat lukte!</button><button class="review-btn-again" data-action="micro-finish" data-known="false">Opnieuw</button><button class="review-btn-close" data-action="micro-close">Sluiten</button>';
}
function finishReview(knew: boolean) {
  if (!microReviewPrompt || !document.getElementById('reviewAnswer').classList.contains('revealed')) return;
  const word = document.getElementById('reviewWord').textContent!.toLowerCase();
  updateWordStats(word, knew ? 'review' : 'review_again');
  if (microReviewPrompt?.usage) recordWordAttempt({ id: crypto.randomUUID(), at: Date.now(), word,
    chunk: microReviewPrompt.usage.chunk, outcome: knew ? 'self-reviewed' : 'needs-practice', source: 'review' });
  closeMicroReview(); if (!knew) trySuggestion(word); renderHistory(); updateReviewBadge();
}
function closeMicroReview() { if (microReviewInterval) { clearInterval(microReviewInterval); microReviewInterval = null; } microReviewPrompt = null; document.getElementById('microReviewOverlay').classList.remove('open'); }

async function switchPracticeMode(mode: 'text' | 'voice') {
  document.getElementById('textModeBtn').classList.toggle('active', mode === 'text');
  document.getElementById('voiceModeBtn').classList.toggle('active', mode === 'voice');
  document.getElementById('textPracticePanel').style.display = mode === 'text' ? '' : 'none';
  document.getElementById('voicePracticePanel').style.display = mode === 'voice' ? '' : 'none';
  document.getElementById('practiceUsage').style.display = 'none';
  document.getElementById('practiceFeedback').hidden = true;
  if (mode === 'voice') {
    document.getElementById('voicePracticeWord').textContent = document.getElementById('practiceChatWord').textContent || '';
  }
  const c = getPracticeContext();
  if (c && structuredPractice.session && (structuredPractice.session.delivery === 'voice') !== (mode === 'voice')) {
    const previous = structuredPractice.session;
    if (previous.supportUsed || previous.rounds.some(r => r.hintsUsed > 0 || r.feedback)) markPracticeHelp();
    stopRealtimeEncounter();
    await structuredPractice.start(c.word, c.usage, c.helpUsed, { voice: mode === 'voice', meaning: c.meaning,
      studiedScenario: c.helpUsed ? c.studiedScenario || (previous.mode === 'guided' ? previous.scenario : undefined) : undefined });
  }
}

export {
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
