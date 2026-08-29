// --- Supabase ---
const SUPABASE_URL = 'https://fcpauyuwylnomuxdqtln.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gs091zHItkPEaLWQhmH3MQ_vspCp-Yl';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let authMode = 'login'; // 'login' or 'signup'

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
    errEl.textContent = e.message || 'Fout bij inloggen';
    errEl.style.display = 'block';
  }
}
async function handleForgotPassword() {
  authMode = 'forgot';
  document.getElementById('authTitle').textContent = 'Wachtwoord resetten';
  document.getElementById('authSubtitle').textContent = 'Vul je e-mail in om een reset link te ontvangen';
  document.getElementById('authPassword').style.display = 'none';
  document.getElementById('authSubmitBtn').textContent = 'Verstuur reset link';
  document.getElementById('authSubmitBtn').onclick = doForgotPassword;
  document.getElementById('authToggle').textContent = 'Terug naar inloggen';
  document.getElementById('authToggle').onclick = () => { authMode = 'login'; updateAuthUI(); document.getElementById('authPassword').style.display = ''; document.getElementById('authSubmitBtn').onclick = handleAuth; document.getElementById('authToggle').onclick = toggleAuthMode; };
  document.getElementById('authForgot').style.display = 'none';
  document.getElementById('authError').style.display = 'none';
}
async function doForgotPassword() {
  const email = document.getElementById('authEmail').value.trim();
  const errEl = document.getElementById('authError');
  if (!email) {
    errEl.textContent = 'Vul je e-mail in';
    errEl.style.display = 'block';
    errEl.style.color = '';
    return;
  }
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://lanfeitiao.github.io/poortaal/'
    });
    if (error) throw error;
    errEl.style.display = 'block';
    errEl.style.color = 'var(--blue-600)';
    errEl.textContent = `Reset link verstuurd naar ${email}. Check je inbox!`;
  } catch(e) {
    errEl.textContent = e.message || 'Fout bij wachtwoord reset';
    errEl.style.display = 'block';
    errEl.style.color = '';
  }
}
function toggleAuthMode() {
  authMode = authMode === 'login' ? 'signup' : 'login';
  updateAuthUI();
}
function updateAuthUI() {
  document.getElementById('authTitle').textContent = authMode === 'login' ? 'Inloggen' : 'Registreren';
  document.getElementById('authSubtitle').textContent = authMode === 'login'
    ? 'Log in om je woorden te synchroniseren'
    : 'Maak een account aan';
  document.getElementById('authSubmitBtn').textContent = authMode === 'login' ? 'Inloggen' : 'Registreren';
  document.getElementById('authToggle').textContent = authMode === 'login'
    ? 'Nog geen account? Registreren'
    : 'Al een account? Inloggen';
  document.getElementById('authForgot').style.display = authMode === 'login' ? '' : 'none';
  document.getElementById('authError').style.display = 'none';
  document.getElementById('authError').style.color = '';
}
async function handleAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  if (!email || !password) { errEl.textContent = 'Vul e-mail en wachtwoord in'; errEl.style.display = 'block'; return; }
  if (password.length < 6) { errEl.textContent = 'Wachtwoord moet minstens 6 tekens zijn'; errEl.style.display = 'block'; return; }

  document.getElementById('authSubmitBtn').disabled = true;
  try {
    let result;
    if (authMode === 'signup') {
      result = await supabaseClient.auth.signUp({ email, password });
    } else {
      result = await supabaseClient.auth.signInWithPassword({ email, password });
    }
    if (result.error) throw result.error;
    if (authMode === 'signup' && !result.data.session) {
      errEl.textContent = 'Controleer je e-mail om je account te bevestigen';
      errEl.style.display = 'block';
      errEl.style.color = '#22C55E';
      return;
    }
    currentUser = result.data.user;
    closeAuthModal();
    updateUserUI();
    await syncFromCloud();
  } catch (e) {
    errEl.textContent = e.message || 'Er ging iets mis';
    errEl.style.display = 'block';
    errEl.style.color = '#DC2626';
  } finally {
    document.getElementById('authSubmitBtn').disabled = false;
  }
}
function openChangePassword() {
  document.getElementById('changePwOverlay').classList.add('open');
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';
  document.getElementById('changePwError').style.display = 'none';
  document.getElementById('newPassword').focus();
}
function closeChangePassword() {
  document.getElementById('changePwOverlay').classList.remove('open');
}
async function doChangePassword() {
  const pw = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;
  const errEl = document.getElementById('changePwError');
  if (!pw || pw.length < 6) {
    errEl.textContent = 'Wachtwoord moet minimaal 6 tekens zijn';
    errEl.style.display = 'block';
    errEl.style.color = '';
    return;
  }
  if (pw !== confirm) {
    errEl.textContent = 'Wachtwoorden komen niet overeen';
    errEl.style.display = 'block';
    errEl.style.color = '';
    return;
  }
  try {
    const { error } = await supabaseClient.auth.updateUser({ password: pw });
    if (error) throw error;
    errEl.textContent = 'Wachtwoord gewijzigd!';
    errEl.style.display = 'block';
    errEl.style.color = 'var(--blue-600)';
    setTimeout(closeChangePassword, 1500);
  } catch(e) {
    errEl.textContent = e.message || 'Fout bij wijzigen';
    errEl.style.display = 'block';
    errEl.style.color = '';
  }
}
async function doLogout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  updateUserUI();
}
function updateUserUI() {
  const info = document.getElementById('userInfo');
  const btn = document.getElementById('loginBtn');
  if (currentUser) {
    info.style.display = 'flex';
    btn.style.display = 'none';
    document.getElementById('userEmail').textContent = currentUser.email;
  } else {
    info.style.display = 'none';
    btn.style.display = '';
  }
}

// Cloud sync
async function syncFromCloud() {
  if (!currentUser) return;
  const ind = document.getElementById('syncIndicator');
  ind.classList.add('syncing');
  try {
    const { data: cloudWords } = await supabaseClient.from('user_words').select('*').eq('user_id', currentUser.id);
    const { data: cloudHistory } = await supabaseClient.from('user_history').select('*').eq('user_id', currentUser.id);

    const localStats = getWordStats();
    if (cloudWords) {
      for (const cw of cloudWords) {
        localStats[cw.word] = {
          lookups: cw.lookups || 0,
          practices: cw.practices || 0,
          reviews: cw.reviews || [],
          level: cw.level || 0,
          lastSeen: cw.last_seen || Date.now(),
        };
        if (cw.word_data) setWordCache(cw.word, cw.word_data);
      }
    }
    localStorage.setItem('poortaal_word_stats', JSON.stringify(localStats));

    if (cloudHistory) {
      const cloudMap = new Map(cloudHistory.map(h => [h.word, h]));
      const localOnly = searchHistory.filter(h => !cloudMap.has(h.word));
      const merged = cloudHistory.map(h => ({
        word: h.word,
        timestamp: h.timestamp || Date.now(),
        wordData: h.word_data || undefined,
      }));
      merged.push(...localOnly);
      merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      searchHistory = merged.slice(0, 50);
      localStorage.setItem('poortaal_history', JSON.stringify(searchHistory));

      if (localOnly.length > 0) {
        const rows = localOnly.map(h => ({
          user_id: currentUser.id,
          word: h.word,
          word_data: h.wordData || null,
          timestamp: h.timestamp || Date.now(),
        }));
        await supabaseClient.from('user_history').upsert(rows, { onConflict: 'user_id,word' });
      }
      const cloudWordSet = new Set((cloudWords || []).map(w => w.word));
      const localOnlyStats = Object.entries(localStats).filter(([w]) => !cloudWordSet.has(w));
      if (localOnlyStats.length > 0) {
        const rows = localOnlyStats.map(([w, s]) => ({
          user_id: currentUser.id,
          word: w,
          lookups: s.lookups || 0,
          practices: s.practices || 0,
          reviews: s.reviews || [],
          level: s.level || 0,
          last_seen: s.lastSeen || Date.now(),
          word_data: getCachedWord(w) || null,
        }));
        await supabaseClient.from('user_words').upsert(rows, { onConflict: 'user_id,word' });
      }
    }

    renderHistory();
    updateReviewBadge();
  } catch (e) {
    console.error('Sync error:', e);
  } finally {
    ind.classList.remove('syncing');
  }
}

async function saveWordStatsToCloud(word) {
  if (!currentUser) return;
  const stats = getWordStats()[word];
  if (!stats) return;
  await supabaseClient.from('user_words').upsert({
    user_id: currentUser.id,
    word: word,
    lookups: stats.lookups || 0,
    practices: stats.practices || 0,
    reviews: stats.reviews || [],
    level: stats.level || 0,
    last_seen: stats.lastSeen || Date.now(),
    word_data: getCachedWord(word) || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,word' }).then(({ error }) => { if (error) console.error('Save word error:', error); });
}

async function saveHistoryToCloud(word, wordData) {
  if (!currentUser) return;
  await supabaseClient.from('user_history').upsert({
    user_id: currentUser.id,
    word: word,
    word_data: wordData || null,
    timestamp: Date.now(),
  }, { onConflict: 'user_id,word' }).then(({ error }) => { if (error) console.error('Save history error:', error); });
}

async function initAuth() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (user) {
    currentUser = user;
    updateUserUI();
    syncFromCloud();
  }
  supabaseClient.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    updateUserUI();
  });
}

// --- State ---
const API_BASE = 'https://poortaal-api.weilin1990.workers.dev';
let searchHistory = JSON.parse(localStorage.getItem('poortaal_history') || '[]');
if (searchHistory.length > 0 && typeof searchHistory[0] === 'string') {
  searchHistory = searchHistory.map(w => ({ word: w, timestamp: Date.now() }));
  localStorage.setItem('poortaal_history', JSON.stringify(searchHistory));
}
let currentWord = null;
let currentWordData = null;
let practiceMessages = [];
let reviewQueue = [];
let reviewIndex = 0;
let reviewResults = { know: 0, again: 0 };
let reviewRevealed = false;
let reviewSessionActive = false;
let practiceLoading = false;
let microReviewTimer = null;
let microReviewInterval = null;

// --- Routing ---
function navigateTo(hash) {
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
  const breakdownParts = [];
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
      <button class="review-start-btn" onclick="startReviewSession()">▶ Begin herhaling</button>
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
  const data = item.entry.wordData || {};
  const word = item.entry.word;
  const total = reviewQueue.length;
  const pct = Math.round((reviewIndex / total) * 100);
  const pill = item.isWilting
    ? `<span class="review-stage-pill">🥀 ${item.overdueDays}d te laat</span>`
    : `<span class="review-stage-pill fresh">🌿 vandaag</span>`;
  const meaningNl = escapeHtml(data.meaning_nl || '');
  const meaningEn = escapeHtml(data.meaning_en || '');
  const safeWord = escapeHtml(word);
  const safeType = escapeHtml(data.type || '');
  const revealedClass = reviewRevealed ? 'revealed' : '';
  const actionsDisabled = reviewRevealed ? '' : 'disabled';
  const back2 = reviewIndex + 2 < total ? '<div class="review-card back-2"></div>' : '';
  const back1 = reviewIndex + 1 < total ? '<div class="review-card back-1"></div>' : '';
  root.innerHTML = `
    <div class="review-session">
      <div class="review-session-header">
        <button class="review-back-btn" onclick="exitReviewSession()" aria-label="Terug">←</button>
        <span class="review-progress-text">${reviewIndex + 1} / ${total}</span>
        <span style="width:2rem;"></span>
      </div>
      <div class="review-progress-track"><div class="review-progress-fill" style="width:${pct}%"></div></div>
      <div class="review-stack" id="reviewStack">
        ${back2}
        ${back1}
        <div class="review-card front" id="reviewFrontCard" onclick="onReviewCardTap()">
          ${pill}
          <div class="review-card-word">${safeWord}</div>
          ${safeType ? `<div class="review-card-type">${safeType}</div>` : ''}
          <button class="tts-btn review-tts-btn" onclick="onReviewTTS(event, this)" onpointerdown="event.stopPropagation()" data-word="${safeWord}" title="Uitspraak beluisteren">🔊</button>
          <div class="review-card-hint" id="reviewCardHint" ${reviewRevealed ? 'hidden' : ''}>tik om te onthullen</div>
          <div class="review-card-answer ${revealedClass}" id="reviewCardAnswer">
            <div class="answer-nl">${meaningNl}</div>
            ${meaningEn ? `<div class="answer-en">${meaningEn}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="review-actions">
        <button class="review-btn-again" id="reviewBtnAgain" onclick="gradeAndAdvance(false)" ${actionsDisabled}>Opnieuw</button>
        <button class="review-btn-know" id="reviewBtnKnow" onclick="gradeAndAdvance(true)" ${actionsDisabled}>Wist ik!</button>
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

function onReviewTTS(e, btn) { e.stopPropagation(); playExTTS(btn, btn.dataset.word || ''); }
function onReviewCardTap() {
  if (reviewRevealed) return;
  reviewRevealed = true;
  const answer = document.getElementById('reviewCardAnswer');
  const hint = document.getElementById('reviewCardHint');
  if (answer) answer.classList.add('revealed');
  if (hint) hint.hidden = true;
  const again = document.getElementById('reviewBtnAgain');
  const know = document.getElementById('reviewBtnKnow');
  if (again) again.disabled = false;
  if (know) know.disabled = false;
}
function gradeAndAdvance(known) {
  if (!reviewSessionActive || !reviewRevealed) return;
  const item = reviewQueue[reviewIndex];
  if (!item) return;
  const word = item.entry.word;
  if (known) { reviewResults.know++; updateWordStats(word, 'review'); }
  else { reviewResults.again++; updateWordStats(word, 'review_again'); }
  updateReviewBadge();
  renderHistory();
  reviewIndex++;
  reviewRevealed = false;
  renderReviewSession();
}
function renderReviewSummary() {
  const root = document.getElementById('reviewSessionSection');
  if (!root) return;
  const know = reviewResults.know;
  const again = reviewResults.again;
  const lines = [];
  if (know > 0) lines.push(`<div class="review-summary-stat">🌳 ${know} wist je</div>`);
  if (again > 0) lines.push(`<div class="review-summary-stat">🥀 ${again} opnieuw</div>`);
  if (lines.length === 0) lines.push('<div class="review-summary-stat">Geen woorden beoordeeld</div>');
  root.innerHTML = `
    <div class="review-summary">
      <div class="review-summary-emoji">🌳</div>
      <div class="review-summary-title">Klaar!</div>
      ${lines.join('')}
      <button class="review-summary-btn" onclick="endReviewSessionToHome()">Tot morgen</button>
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
  if (isReview) renderReviewHome(); else resetReviewSessionIfActive();
}
window.addEventListener('hashchange', handleRoute);

// --- Daily Word ---
const DAILY_EPOCH = new Date(2026, 0, 1);
function getAbsoluteDay() {
  const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); return Math.floor((today - DAILY_EPOCH) / 86400000);
}
function seededShuffle(arr, seed) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) { seed = (seed * 16807 + 0) % 2147483647; const j = seed % (i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
function getTodayWord(words) {
  const absoluteDay = getAbsoluteDay(); const cycle = Math.floor(absoluteDay / words.length); const effectiveList = cycle === 0 ? words : seededShuffle(words, cycle); return effectiveList[absoluteDay % words.length];
}
function getStreak() { try { return JSON.parse(localStorage.getItem('poortaal_streak')) || { lastDate: null, count: 0 }; } catch { return { lastDate: null, count: 0 }; } }
function updateStreak() {
  const streak = getStreak(); const today = new Date().toISOString().slice(0, 10); if (streak.lastDate === today) return streak;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = { lastDate: today, count: streak.lastDate === yesterday ? streak.count + 1 : 1 };
  localStorage.setItem('poortaal_streak', JSON.stringify(newStreak)); return newStreak;
}
function renderDailyWord(word) {
  const container = document.getElementById('dailyWordContainer'); const streak = getStreak(); const streakCount = streak.count || 0;
  container.innerHTML = `<div class="daily-word-card"><div class="daily-word-top"><div class="daily-word-label">Woord van de Dag</div><div class="streak-badge">\u{1F333} Dag ${streakCount}</div></div><div class="daily-word-main"><h2>${escapeHtml(word.word)}</h2><span class="word-type">${escapeHtml(word.category)}</span></div><div class="daily-word-teaser">${escapeHtml(word.teaser)}</div><button class="daily-word-cta" onclick="exploreDailyWord()">Ontdek dit woord</button></div>`;
}
function exploreDailyWord() {
  if (!currentDailyWord) return; const streak = updateStreak(); const badge = document.querySelector('.streak-badge'); if (badge) badge.textContent = '\u{1F333} Dag ' + streak.count; document.getElementById('wordInput').value = currentDailyWord.word; lookupWord();
}
let currentDailyWord = null;
async function loadDailyWord() {
  try { const res = await fetch('words.json'); if (!res.ok) return; const words = await res.json(); if (!Array.isArray(words) || words.length === 0) return; currentDailyWord = getTodayWord(words); renderDailyWord(currentDailyWord); } catch {}
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initAuth(); renderHistory(); updateReviewBadge(); loadDailyWord();
  document.getElementById('wordInput').addEventListener('keydown', e => { if (e.key === 'Enter') lookupWord(); });
  document.getElementById('practiceWordInput').addEventListener('keydown', e => { if (e.key === 'Enter') startPracticeWithInput(); });
  document.getElementById('authPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleAuth(); });
  handleRoute(); window.addEventListener('keydown', onReviewKeydown);
});
function onReviewKeydown(e) {
  if (!reviewSessionActive) return; const tag = (document.activeElement && document.activeElement.tagName) || ''; if (tag === 'INPUT' || tag === 'TEXTAREA') return; if (reviewIndex >= reviewQueue.length) return;
  if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); onReviewCardTap(); }
  else if (e.key === 'Enter' || e.key === 'ArrowRight') { if (!reviewRevealed) return; e.preventDefault(); gradeAndAdvance(true); }
  else if (e.key === 'ArrowLeft') { if (!reviewRevealed) return; e.preventDefault(); gradeAndAdvance(false); }
}

// --- TTS ---
async function _playTTSBlob(text) {
  const url = `https://poortaal-api.weilin1990.workers.dev/tts?q=${encodeURIComponent(text)}&tl=nl`; const res = await fetch(url); if (!res.ok) throw new Error('TTS fetch failed'); const blob = await res.blob(); const blobUrl = URL.createObjectURL(blob); const audio = new Audio(blobUrl); audio.onended = () => URL.revokeObjectURL(blobUrl); await audio.play();
}
function playPronunciation(text) { _playTTSBlob(text).catch(() => showToast('Er ging iets mis')); }
async function playTTS(word) { const btn = document.getElementById('ttsBtn'); if (!btn || btn.classList.contains('loading')) return; btn.classList.add('loading'); btn.innerHTML = '<div class="tts-spinner"></div>'; try { await _playTTSBlob(word); } catch { showToast('Er ging iets mis'); } finally { btn.classList.remove('loading'); btn.innerHTML = '🔊'; } }
async function playExTTS(btn, text) { if (btn.classList.contains('loading')) return; btn.classList.add('loading'); btn.innerHTML = '<span class="tts-spinner"></span>'; try { await _playTTSBlob(text); } catch { showToast('Er ging iets mis'); } finally { btn.classList.remove('loading'); btn.innerHTML = '🔊'; } }

// --- History ---
function toggleHistory() { const panel = document.getElementById('historyPanel'); const overlay = document.getElementById('overlay'); panel.classList.toggle('open'); overlay.classList.toggle('open'); }
function getWordStats() { try { return JSON.parse(localStorage.getItem('poortaal_word_stats') || '{}'); } catch { return {}; } }
function updateWordStats(word, type) {
  const stats = getWordStats(); const w = word.toLowerCase().trim(); if (!stats[w]) stats[w] = { lookups: 0, practices: 0, lastSeen: Date.now(), reviews: [], level: 0 }; if (!stats[w].reviews) stats[w].reviews = []; if (stats[w].level === undefined) stats[w].level = 0; if (type === 'lookup') stats[w].lookups++; if (type === 'practice') stats[w].practices++;
  if (type === 'review' || type === 'practice' || type === 'review_again') { const today = new Date().toDateString(); const lastReview = stats[w].reviews.length > 0 ? stats[w].reviews[stats[w].reviews.length - 1] : 0; const lastReviewDay = new Date(lastReview).toDateString(); const alreadyReviewedToday = lastReview && lastReviewDay === today; if (!alreadyReviewedToday) { stats[w].reviews.push(Date.now()); if (stats[w].reviews.length >= 2 && type !== 'review_again') stats[w].level = Math.min(stats[w].level + 1, 4); } }
  stats[w].lastSeen = Date.now(); localStorage.setItem('poortaal_word_stats', JSON.stringify(stats)); saveWordStatsToCloud(w); return stats[w];
}
function getNextInterval(level) { const intervals = [1, 3, 7, 14, 30]; return intervals[Math.min(level, intervals.length - 1)]; }
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addToHistory(word, wordData) { const w = word.toLowerCase().trim(); searchHistory = searchHistory.filter(h => h.word !== w); const entry = { word: w, timestamp: Date.now() }; if (wordData) entry.wordData = wordData; searchHistory.unshift(entry); if (searchHistory.length > 50) searchHistory = searchHistory.slice(0, 50); localStorage.setItem('poortaal_history', JSON.stringify(searchHistory)); updateWordStats(w, 'lookup'); saveHistoryToCloud(w, wordData); renderHistory(); updateReviewBadge(); }
function getPlantStage(word) {
  const stats = getWordStats()[word.toLowerCase().trim()]; if (!stats) return { emoji: '🌱', label: 'Zaaisel', key: 'seed', hint: '' }; const level = stats.level || 0; const lastSeen = stats.lastSeen || 0; const nextInterval = getNextInterval(level); const today = startOfDay(Date.now()); const dueDay = startOfDay(lastSeen + nextInterval * 86400000); const overdueDays = Math.max(0, Math.round((today - dueDay) / 86400000)); const daysLeft = Math.max(0, Math.round((dueDay - today) / 86400000)); const overdue = dueDay < today; const dueTodayHint = 'Herhaal vandaag!';
  if (overdue && level < 4) return { emoji: '🥀', label: 'Verwelkt', key: 'wilting', hint: `${overdueDays}d te laat` }; if (level >= 4) return { emoji: '🌳', label: 'Sterk', key: 'strong', hint: 'Goed gedaan!' }; if (level >= 3) return { emoji: '🪴', label: 'Groeiend', key: 'growing', hint: daysLeft === 0 ? dueTodayHint : `${daysLeft}d tot herhaling` }; if (level >= 1) return { emoji: '🌿', label: 'Kiempje', key: 'sprout', hint: daysLeft === 0 ? dueTodayHint : `${daysLeft}d tot herhaling` }; const hasPracticed = stats.practices > 0 || stats.reviews.length > 0; const seedHint = hasPracticed ? (daysLeft > 0 ? `${daysLeft}d tot herhaling` : dueTodayHint) : 'Oefen om te groeien'; return { emoji: '🌱', label: 'Zaaisel', key: 'seed', hint: seedHint };
}
function getDueWords() { const stats = getWordStats(); const today = startOfDay(Date.now()); return searchHistory.filter(entry => entry.wordData).map(entry => { const s = stats[entry.word] || {}; const level = s.level || 0; const lastSeen = s.lastSeen || 0; const nextInterval = getNextInterval(level); const dueDay = startOfDay(lastSeen + nextInterval * 86400000); return { entry, stats: s, level, isDue: dueDay <= today && level < 4, isWilting: dueDay < today, overdueDays: Math.max(0, Math.round((today - dueDay) / 86400000)) }; }).filter(x => x.isDue).sort((a, b) => b.overdueDays - a.overdueDays); }
function updateReviewBadge() { const badge = document.getElementById('navReviewBadge'); if (!badge) return; const due = getDueWords(); badge.hidden = due.length === 0; badge.textContent = String(due.length); }
function renderHistory() {
  const list = document.getElementById('historyList'); const summaryEl = document.getElementById('historySummary'); if (searchHistory.length === 0) { list.innerHTML = '<div class="history-empty">Nog geen woorden opgezocht</div>'; summaryEl.innerHTML = ''; return; }
  const counts = { strong: 0, growing: 0, sprout: 0, seed: 0, wilting: 0 };
  const rows = searchHistory.map(entry => { const safe = escapeHtml(entry.word); const plant = getPlantStage(entry.word); counts[plant.key]++; const isWilting = plant.key === 'wilting'; const onclick = isWilting && entry.wordData ? `startMicroReview('${safe.replace(/'/g, "&#39;")}')` : `trySuggestion('${safe.replace(/'/g, "&#39;")}')`; return `<li><div class="swipe-delete" onclick="deleteHistoryItem('${safe.replace(/'/g, "&#39;")}')">Verwijder</div><div class="swipe-content" data-word="${safe.replace(/"/g, '&quot;')}" onclick="${onclick}"><span class="history-word">${safe}</span><span class="plant-stage" title="${plant.hint || ''}"><span class="plant-emoji">${plant.emoji}</span><span class="plant-label">${plant.hint || plant.label}</span></span></div></li>`; });
  list.innerHTML = rows.join(''); initSwipeHandlers(list); const parts = []; if (counts.strong) parts.push(`🌳 ${counts.strong} sterk`); if (counts.growing) parts.push(`🪴 ${counts.growing} groeiend`); if (counts.sprout) parts.push(`🌿 ${counts.sprout} kiempjes`); if (counts.seed) parts.push(`🌱 ${counts.seed} zaaisel`); if (counts.wilting) parts.push(`🥀 ${counts.wilting} verwelkt`); summaryEl.innerHTML = parts.join(' · ');
}
function deleteHistoryItem(word) { const w = word.toLowerCase().trim(); searchHistory = searchHistory.filter(h => h.word !== w); localStorage.setItem('poortaal_history', JSON.stringify(searchHistory)); const cache = getWordCache(); delete cache[w]; localStorage.setItem(WORD_CACHE_KEY, JSON.stringify(cache)); const stats = getWordStats(); delete stats[w]; localStorage.setItem('poortaal_word_stats', JSON.stringify(stats)); if (currentUser) { supabaseClient.from('user_history').delete().eq('user_id', currentUser.id).eq('word', w).then(() => {}); supabaseClient.from('user_words').delete().eq('user_id', currentUser.id).eq('word', w).then(() => {}); } renderHistory(); }
function initSwipeHandlers(list) { const items = list.querySelectorAll('.swipe-content'); items.forEach(el => { let startX = 0, currentX = 0, swiping = false; el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; currentX = 0; swiping = false; el.style.transition = 'none'; }, { passive: true }); el.addEventListener('touchmove', e => { const dx = e.touches[0].clientX - startX; if (dx < -10) swiping = true; if (swiping) { currentX = Math.min(0, Math.max(dx, -120)); el.style.transform = `translateX(${currentX}px)`; } }, { passive: true }); el.addEventListener('touchend', () => { el.style.transition = 'transform 0.2s ease'; if (currentX < -100) { const word = el.dataset.word; el.style.transform = 'translateX(-100%)'; setTimeout(() => deleteHistoryItem(word), 200); } else if (currentX < -40) el.style.transform = 'translateX(-80px)'; else el.style.transform = 'translateX(0)'; }); el.addEventListener('click', e => { if (swiping) { e.stopPropagation(); e.preventDefault(); } }, true); }); }

// --- Toast / OpenAI ---
function showToast(msg) { const existing = document.querySelector('.toast'); if (existing) existing.remove(); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4000); }
async function callOpenAI(messages, temperature = 0.7) { const res = await fetch(`${API_BASE}/openai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature }) }); if (!res.ok) { showToast('Er ging iets mis'); throw new Error('API error'); } const data = await res.json(); return data.choices[0].message.content; }
function trySuggestion(word) { document.getElementById('wordInput').value = word; const panel = document.getElementById('historyPanel'); if (panel.classList.contains('open')) toggleHistory(); lookupWord(); }
const WORD_CACHE_KEY = 'poortaal_word_cache_v4';
function getWordCache() { try { return JSON.parse(localStorage.getItem(WORD_CACHE_KEY) || '{}'); } catch { return {}; } }
function setWordCache(word, data) { const cache = getWordCache(); cache[word.toLowerCase().trim()] = data; const keys = Object.keys(cache); if (keys.length > 200) delete cache[keys[0]]; localStorage.setItem(WORD_CACHE_KEY, JSON.stringify(cache)); }
function getCachedWord(word) { return getWordCache()[word.toLowerCase().trim()] || null; }

async function lookupWord() {
  const input = document.getElementById('wordInput'); const word = input.value.trim(); if (!word) return; const cached = getCachedWord(word); if (cached) { currentWord = word; currentWordData = cached; addToHistory(word, cached); renderWordCard(cached); return; }
  const btn = document.getElementById('searchBtn'); btn.disabled = true; const content = document.getElementById('content'); content.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div><span>Even denken over "${word}"...</span></div>`;
  try {
    const systemPrompt = `You are a friendly, knowledgeable Dutch language tutor. The user will give you a Dutch word. Respond with ONLY valid JSON (no markdown, no code fences) with these fields:
- "word": the word
- "type": part of speech in Dutch (e.g. "bijvoeglijk naamwoord", "zelfstandig naamwoord", "werkwoord")
- "meaning_nl": meaning explained in simple Dutch (1-2 sentences)
- "meaning_en": English translation/meaning
- "examples": array of exactly 2 objects with "nl" (Dutch sentence using the word) and "en" (English translation). Tailor these examples to a parent who lives in the Netherlands and has a six-year-old child attending a Montessori school. Use natural, practical sentences they could actually say in daily life—for example while talking to teachers or other parents, dropping off or picking up their child, arranging playdates, shopping, travelling locally, visiting the huisarts, or handling household and neighbourhood routines. Prefer first-person, conversational A2-B1 Dutch and vary the situations; do not force school or parenting into an example when the word does not fit that context naturally
- "tips": one concise, genuinely useful and factually reliable insight in English. Always provide this field so the learner consistently sees a Tips card. Prioritize information that changes how a learner would form or understand a sentence: irregular grammar or inflection, required articles or prepositions, register, idiomatic usage, a common learner error, or a useful contrast with a similar word. For a transparent compound or a word with a meaningful affix, explain its parts only when the analysis is certain and helps the learner remember or infer the meaning. Avoid merely restating the definition, examples, or obvious spelling/capitalization rules. Silently verify every grammatical claim before responding; if you are not confident that a claim is correct, give a simpler, well-established usage tip instead. For verbs, determine separability from the verb's actual conjugation and stress pattern, never merely from its spelling. In particular, Dutch verbs with unstressed prefixes such as be-, ge-, her-, ont-, and ver- are normally inseparable: do not split the prefix and do not add ge- in the past participle. For example, vervangen is inseparable: use "ik vervang" and "ik heb vervangen", never "ik vang ... ver". Do not describe an inseparable verb as separable
- "fun_fact": an interesting etymology or cultural note (in English), or null if nothing notable`;
    const raw = await callOpenAI([{ role: 'system', content: systemPrompt }, { role: 'user', content: word }]); let cleaned = raw.trim(); if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''); const data = JSON.parse(cleaned); currentWord = word; currentWordData = data; setWordCache(word, data); addToHistory(word, data); renderWordCard(data);
  } catch (e) { content.innerHTML = e.message !== 'API error' ? '<div class="empty-state"><div class="icon">😅</div><p>Kon het woord niet verwerken. Probeer het opnieuw.</p></div>' : '<div class="empty-state"><div class="icon">⚠️</div><p>Er ging iets mis. Probeer het opnieuw.</p></div>'; } finally { btn.disabled = false; }
}
function renderWordCard(data) {
  const content = document.getElementById('content'); const examplesHtml = (data.examples || []).slice(0, 2).map(ex => { const safeNl = ex.nl.replace(/'/g, "\\'").replace(/"/g, '&quot;'); return `<div class="example-item"><div class="example-nl">"${ex.nl}" <button class="ex-tts-btn" onclick="playExTTS(this, '${safeNl}')" title="Uitspraak">🔊</button></div><div class="example-en">${ex.en}</div></div>`; }).join(''); const funFactHtml = data.fun_fact ? `<div class="fun-fact">💡 ${data.fun_fact}</div>` : ''; const tipsHtml = `<div class="card"><div class="card-label">Tips</div><div class="tips-text">${data.tips || 'No additional usage tip is available for this word.'}</div></div>`;
  content.innerHTML = `<div class="card" id="wordCard"><div class="card-label">Woord</div><div class="word-header"><h1>${data.word}</h1><span class="word-type">${data.type}</span><button class="tts-btn" id="ttsBtn" onclick="playTTS('${data.word.replace(/'/g, "\\'")}')" title="Uitspraak beluisteren">🔊</button></div><div class="meaning"><div class="meaning-nl">${data.meaning_nl}</div><div class="meaning-en">${data.meaning_en}</div></div>${funFactHtml}</div><div class="card"><div class="card-label">Voorbeelden</div>${examplesHtml}</div>${tipsHtml}<button class="practice-btn" onclick="goToPractice('${data.word.replace(/'/g, "\\'")}')">🎭 Oefenen met "${data.word}"</button>`;
}

// --- Practice ---
function goToPractice(word) { navigateTo('#practice'); setTimeout(() => startPracticeForWord(word), 50); }
function renderPracticeHistoryList() { const list = document.getElementById('practiceHistoryList'); const wordsWithData = searchHistory.filter(h => h.wordData); if (wordsWithData.length === 0) { list.innerHTML = '<div class="history-empty" style="padding:2rem 0;">Zoek eerst een woord op om mee te oefenen</div>'; return; } list.innerHTML = wordsWithData.map(entry => { const safe = escapeHtml(entry.word); const typeHint = entry.wordData?.type ? escapeHtml(entry.wordData.type) : ''; return `<li onclick="startPracticeForWord('${safe.replace(/'/g, "&#39;")}')"><span class="word-label">${safe}</span><span class="word-type-hint">${typeHint}</span></li>`; }).join(''); }
function startPracticeWithInput() { const input = document.getElementById('practiceWordInput'); const word = input.value.trim(); if (!word) return; input.value = ''; startPracticeForWord(word); }
function showPracticePicker() { if (voiceActive) stopVoiceSession(); const practicedWord = document.getElementById('practiceChatWord')?.textContent?.toLowerCase()?.trim(); const userSentMessages = practiceMessages.filter(m => m.role === 'user').length; if (practicedWord && userSentMessages > 0) { updateWordStats(practicedWord, 'practice'); renderHistory(); } document.getElementById('practicePickerSection').style.display = ''; document.getElementById('practiceChatSection').style.display = 'none'; switchPracticeMode('text'); practiceMessages = []; }
async function startPracticeForWord(word) {
  const entry = searchHistory.find(h => h.word === word.toLowerCase()); const wordData = entry?.wordData || { word, meaning_en: '' }; document.getElementById('practicePickerSection').style.display = 'none'; document.getElementById('practiceChatSection').style.display = ''; document.getElementById('practiceChatWord').textContent = wordData.word; const msgs = document.getElementById('chatMessages'); msgs.innerHTML = '<div class="chat-msg system">Scenario wordt voorbereid...</div>'; const meaningHint = wordData.meaning_en ? ` (${wordData.meaning_en})` : '';
  practiceMessages = [{ role: 'system', content: `You are a friendly Dutch language tutor running a role-play practice session. The student is learning the word "${wordData.word}"${meaningHint}.

Your job:
1. First message: Set up a short, fun real-life scenario in Dutch (with English hint in parentheses) where the student must use "${wordData.word}" naturally. Keep it conversational and simple.
2. In subsequent messages: Stay in character for the scenario. Respond naturally in Dutch.
3. After the student uses the word: Give brief, encouraging feedback on their usage (correct/incorrect, natural/unnatural). Then either continue the conversation or wrap up.
4. Keep messages short (2-3 sentences max).
5. Mix Dutch and English — primarily Dutch with English support in parentheses when needed.
6. Be warm, encouraging, and fun!` }];
  try { const response = await callOpenAI(practiceMessages); practiceMessages.push({ role: 'assistant', content: response }); msgs.innerHTML = `<div class="chat-msg tutor">${formatChat(response)}</div>`; document.getElementById('chatInput').focus(); } catch { msgs.innerHTML = '<div class="chat-msg system">Kon het scenario niet starten. Probeer opnieuw.</div>'; }
}
async function sendChat() { const input = document.getElementById('chatInput'); const text = input.value.trim(); if (!text || practiceLoading) return; const msgs = document.getElementById('chatMessages'); practiceMessages.push({ role: 'user', content: text }); msgs.innerHTML += `<div class="chat-msg user">${escapeHtml(text)}</div>`; input.value = ''; msgs.scrollTop = msgs.scrollHeight; practiceLoading = true; document.getElementById('chatSendBtn').disabled = true; msgs.innerHTML += '<div class="chat-msg system" id="chatLoading">💭 Even denken...</div>'; try { const response = await callOpenAI(practiceMessages); practiceMessages.push({ role: 'assistant', content: response }); document.getElementById('chatLoading')?.remove(); msgs.innerHTML += `<div class="chat-msg tutor">${formatChat(response)}</div>`; } catch { document.getElementById('chatLoading')?.remove(); msgs.innerHTML += '<div class="chat-msg system">Fout bij het versturen. Probeer opnieuw.</div>'; } finally { practiceLoading = false; document.getElementById('chatSendBtn').disabled = false; msgs.scrollTop = msgs.scrollHeight; } }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function formatChat(text) { return escapeHtml(text).replace(/\n/g, '<br>'); }

// --- Micro review ---
function startMicroReview(word) { const entry = searchHistory.find(h => h.word === word); if (!entry || !entry.wordData) { trySuggestion(word); return; } const panel = document.getElementById('historyPanel'); if (panel.classList.contains('open')) toggleHistory(); const data = entry.wordData; document.getElementById('reviewWord').textContent = data.word; document.getElementById('reviewType').textContent = data.type || ''; document.getElementById('reviewNl').textContent = data.meaning_nl || ''; document.getElementById('reviewEn').textContent = data.meaning_en || ''; document.getElementById('reviewAnswer').classList.remove('revealed'); document.getElementById('reviewActions').innerHTML = '<button class="review-btn-reveal" onclick="revealAnswer()">Onthullen</button>'; document.getElementById('microReviewOverlay').classList.add('open'); let remaining = 30; const bar = document.getElementById('reviewTimerBar'); const text = document.getElementById('reviewTimerText'); bar.style.width = '100%'; text.textContent = '30s'; if (microReviewInterval) clearInterval(microReviewInterval); microReviewInterval = setInterval(() => { remaining -= 0.1; if (remaining <= 0) { remaining = 0; clearInterval(microReviewInterval); revealAnswer(); } bar.style.width = ((remaining / 30) * 100) + '%'; text.textContent = Math.ceil(remaining) + 's'; }, 100); }
function revealAnswer() { if (microReviewInterval) { clearInterval(microReviewInterval); microReviewInterval = null; } document.getElementById('reviewAnswer').classList.add('revealed'); document.getElementById('reviewActions').innerHTML = '<button class="review-btn-know" onclick="finishReview(true)">Wist ik!</button><button class="review-btn-again" onclick="finishReview(false)">Opnieuw</button><button class="review-btn-close" onclick="closeMicroReview()">Sluiten</button>'; }
function finishReview(knew) { const word = document.getElementById('reviewWord').textContent.toLowerCase(); const idx = searchHistory.findIndex(h => h.word === word); if (idx !== -1) { searchHistory[idx].timestamp = Date.now(); localStorage.setItem('poortaal_history', JSON.stringify(searchHistory)); } updateWordStats(word, 'practice'); closeMicroReview(); if (!knew) trySuggestion(word); renderHistory(); }
function closeMicroReview() { if (microReviewInterval) { clearInterval(microReviewInterval); microReviewInterval = null; } document.getElementById('microReviewOverlay').classList.remove('open'); }

// --- Voice Practice ---
let voicePeerConnection = null;
let voiceDataChannel = null;
let voiceActive = false;
let currentVoiceWord = '';
function switchPracticeMode(mode) { document.getElementById('textModeBtn').classList.toggle('active', mode === 'text'); document.getElementById('voiceModeBtn').classList.toggle('active', mode === 'voice'); document.getElementById('textPracticePanel').style.display = mode === 'text' ? '' : 'none'; document.getElementById('voicePracticePanel').style.display = mode === 'voice' ? '' : 'none'; if (mode === 'voice') { const word = document.getElementById('practiceChatWord').textContent; document.getElementById('voicePracticeWord').textContent = word; currentVoiceWord = word; } if (mode === 'text' && voiceActive) stopVoiceSession(); }
async function toggleVoiceSession() { if (voiceActive) stopVoiceSession(); else await startVoiceSession(); }
async function startVoiceSession() {
  const word = currentVoiceWord; const statusEl = document.getElementById('voiceStatus'); const btn = document.getElementById('voiceStartBtn'); const transcript = document.getElementById('voiceTranscript'); statusEl.textContent = 'Verbinding maken...'; transcript.innerHTML = '';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const tokenRes = await fetch(`${API_BASE}/realtime-token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ word }) }); if (!tokenRes.ok) throw new Error('Kon geen sessie starten'); const tokenData = await tokenRes.json(); const ephemeralToken = tokenData.client_secret?.value || tokenData.value; if (!ephemeralToken) throw new Error('Geen token ontvangen'); const pc = new RTCPeerConnection(); voicePeerConnection = pc; const audioEl = document.createElement('audio'); audioEl.autoplay = true; pc.ontrack = e => { audioEl.srcObject = e.streams[0]; }; stream.getTracks().forEach(track => pc.addTrack(track, stream)); const dc = pc.createDataChannel('oai-events'); voiceDataChannel = dc; let currentAssistantText = ''; let userPendingEl = null; let assistantStreamEl = null;
    dc.addEventListener('message', e => { const event = JSON.parse(e.data); console.log('🎙️ Event:', event.type, event); if (event.type === 'input_audio_buffer.speech_started') { if (assistantStreamEl) { dc.send(JSON.stringify({ type: 'response.cancel' })); if (currentAssistantText) assistantStreamEl.innerHTML = formatChat(currentAssistantText + '...'); assistantStreamEl = null; currentAssistantText = ''; } setVoiceDots(true); userPendingEl = document.createElement('div'); userPendingEl.className = 'chat-msg user'; userPendingEl.setAttribute('data-pending', 'true'); userPendingEl.textContent = '...'; transcript.appendChild(userPendingEl); transcript.scrollTop = transcript.scrollHeight; } if (event.type === 'input_audio_buffer.speech_stopped') setVoiceDots(false); if (event.type === 'conversation.item.input_audio_transcription.completed') { const text = event.transcript; if (userPendingEl) { userPendingEl.removeAttribute('data-pending'); userPendingEl.innerHTML = escapeHtml(text); userPendingEl = null; } else { const el = document.createElement('div'); el.className = 'chat-msg user'; el.innerHTML = escapeHtml(text); transcript.appendChild(el); } transcript.scrollTop = transcript.scrollHeight; if (dc && dc.readyState === 'open') dc.send(JSON.stringify({ type: 'response.create' })); } if (event.type === 'response.output_audio_transcript.delta') { currentAssistantText += event.delta; if (assistantStreamEl) assistantStreamEl.innerHTML = formatChat(currentAssistantText); else { assistantStreamEl = document.createElement('div'); assistantStreamEl.className = 'chat-msg tutor'; assistantStreamEl.innerHTML = formatChat(currentAssistantText); transcript.appendChild(assistantStreamEl); } transcript.scrollTop = transcript.scrollHeight; setVoiceDots(true); } if (event.type === 'response.output_audio_transcript.done') { if (assistantStreamEl) { assistantStreamEl.innerHTML = formatChat(event.transcript); assistantStreamEl = null; } currentAssistantText = ''; setVoiceDots(false); } });
    dc.addEventListener('open', () => { statusEl.textContent = 'Verbonden — begin te praten!'; btn.classList.add('recording'); document.getElementById('voiceBtnIcon').textContent = '⏹️'; document.getElementById('voiceBtnText').textContent = 'Stop gesprek'; voiceActive = true; }); dc.addEventListener('close', () => stopVoiceSession()); const offer = await pc.createOffer(); await pc.setLocalDescription(offer); const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', body: offer.sdp, headers: { 'Authorization': `Bearer ${ephemeralToken}`, 'Content-Type': 'application/sdp' } }); const answerSdp = await sdpRes.text(); await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  } catch (err) { console.error('Voice session error:', err); statusEl.textContent = `Fout: ${err.message}`; stopVoiceSession(); }
}
function stopVoiceSession() { voiceActive = false; document.querySelectorAll('#voiceTranscript [data-pending]').forEach(el => el.remove()); const viz = document.getElementById('voiceVisualizer'); if (viz) viz.style.display = 'none'; document.querySelectorAll('.voice-dot').forEach(dot => dot.classList.remove('active')); if (voiceDataChannel) { voiceDataChannel.close(); voiceDataChannel = null; } if (voicePeerConnection) { voicePeerConnection.getSenders().forEach(s => { if (s.track) s.track.stop(); }); voicePeerConnection.close(); voicePeerConnection = null; } const btn = document.getElementById('voiceStartBtn'); if (btn) { btn.classList.remove('recording'); document.getElementById('voiceBtnIcon').textContent = '🎙️'; document.getElementById('voiceBtnText').textContent = 'Start gesprek'; } const statusEl = document.getElementById('voiceStatus'); if (statusEl) { statusEl.textContent = 'Gesprek beëindigd'; if (currentVoiceWord) { updateWordStats(currentVoiceWord.toLowerCase(), 'practice'); renderHistory(); } } setVoiceDots(false); }
function setVoiceDots(active) { const viz = document.getElementById('voiceVisualizer'); if (viz) viz.style.display = active ? '' : 'none'; document.querySelectorAll('.voice-dot').forEach(dot => dot.classList.toggle('active', active)); }
