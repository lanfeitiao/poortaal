# Herhalen Review Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new bottom-nav `Herhalen` tab with a swipeable card-stack review session for words due for spaced-repetition review.

**Architecture:** Additive only — a new `#review` route, a new `view-review` div, a single new helper `getDueWords()`, a badge updater, and session UI rendered into the same `view-review` element. The existing history panel, micro-review modal, and spaced-repetition logic are unchanged except for a tiny branch in `updateWordStats` to handle `'review_again'`.

**Tech Stack:** Plain HTML/CSS/JS in a single `index.html` file. No build tooling, no automated tests — manual verification by opening `index.html` in a browser. Reuses existing helpers (`getWordStats`, `getPlantStage`, `getNextInterval`, `updateWordStats`, `saveWordStatsToCloud`, `escapeHtml`, `showToast`).

**Spec:** `docs/superpowers/specs/2026-05-18-review-tab-design.md`

**How to run/verify each task:** Open `/Users/jianisong/Projects/poortaal/index.html` directly in a browser (e.g. `open index.html` on macOS). All state is in localStorage. To seed test data, paste into the browser DevTools console (instructions in Task 2).

---

## File Structure

All changes are in **`index.html`**. No new files. No worker or Supabase migration changes.

Logical groupings inside the file:
- **HTML body:** bottom nav (~line 1228), main views (~line 1146-1225) — add new nav entry and `view-review` div
- **CSS (`<style>`):** add `.nav-badge`, `.review-*` rules; place near other view-scoped CSS
- **JS (`<script>`):** add `getDueWords`, `updateReviewBadge`, `renderReviewHome`, `startReviewSession`, `renderReviewSession`, `renderReviewSummary`, `gradeAndAdvance`, swipe + keyboard handlers; extend `handleRoute` and `updateWordStats`; call `updateReviewBadge` from `DOMContentLoaded`, `addToHistory`, end of `loadCloudData`

---

## Task 1: Add #review route, nav entry, and empty view skeleton

**Files:**
- Modify: `index.html` (bottom nav HTML at ~1228, view containers at ~1170-1225, `handleRoute` at ~1599-1613)

**Goal:** Tapping the new "Herhalen" tab routes to an empty `view-review` div with no errors.

- [ ] **Step 1: Add the bottom-nav entry**

Edit the `<nav class="bottom-nav">` block. Replace these lines:

```html
<nav class="bottom-nav">
  <a href="#home" id="nav-home" class="active">
    <span class="nav-icon">🔍</span>
    Zoeken
  </a>
  <a href="#practice" id="nav-practice">
    <span class="nav-icon">🗣️</span>
    Oefenen
  </a>
</nav>
```

with:

```html
<nav class="bottom-nav">
  <a href="#home" id="nav-home" class="active">
    <span class="nav-icon">🔍</span>
    Zoeken
  </a>
  <a href="#review" id="nav-review">
    <span class="nav-icon">🌿</span>
    Herhalen<span class="nav-badge" id="navReviewBadge" hidden>0</span>
  </a>
  <a href="#practice" id="nav-practice">
    <span class="nav-icon">🗣️</span>
    Oefenen
  </a>
</nav>
```

- [ ] **Step 2: Add the `view-review` container**

Inside `<main>`, after the closing `</div>` of `<div id="view-practice" class="view">` (the line `</div>` before `</main>` at ~1224), and before `</main>`, insert:

```html
  <div id="view-review" class="view">
    <div id="reviewHomeSection"></div>
    <div id="reviewSessionSection" style="display:none;"></div>
  </div>
```

- [ ] **Step 3: Extend `handleRoute` to recognise `#review`**

Replace the `handleRoute` function:

```js
function handleRoute() {
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

  if (isPractice) {
    renderPracticeHistoryList();
  }
  if (isReview) {
    renderReviewHome();
  } else {
    // Leaving #review — make sure we drop any in-progress session state
    resetReviewSessionIfActive();
  }
}
```

Note: `renderReviewHome` and `resetReviewSessionIfActive` are defined in later tasks. Define no-op stubs now so this task is self-contained:

Add right above `function handleRoute()`:

```js
function renderReviewHome() { /* defined in Task 3 */ }
function resetReviewSessionIfActive() { /* defined in Task 10 */ }
```

- [ ] **Step 4: Manual verification**

Open `index.html` in a browser. Expected:
- Bottom nav shows three items: Zoeken, Herhalen, Oefenen
- Clicking "Herhalen" → URL becomes `#review`, nav highlights Herhalen, content area is blank (no error in console)
- Clicking back to Zoeken or Oefenen still works
- DevTools Console: no errors

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(review): add #review route, nav entry, and empty view skeleton"
```

---

## Task 2: Add `getDueWords`, `updateReviewBadge`, and badge CSS

**Files:**
- Modify: `index.html` (CSS section near `.bottom-nav` rules, JS section after `getPlantStage`)

**Goal:** A function returns the list of due words; the nav shows a red badge with the count.

- [ ] **Step 1: Add badge CSS**

Find the `.bottom-nav a .nav-icon { font-size: 1.3rem; }` line (around line 807). Insert immediately after it:

```css
.nav-badge {
  display: inline-block;
  background: #ef4444;
  color: #fff;
  border-radius: 999px;
  padding: 1px 6px;
  font-size: 0.65rem;
  font-weight: 700;
  margin-left: 4px;
  line-height: 1.2;
  min-width: 16px;
  text-align: center;
}
.nav-badge[hidden] { display: none; }
```

- [ ] **Step 2: Add `getDueWords` and `updateReviewBadge` helpers**

Find `function getPlantStage(word) {` (around line 1839). After the closing `}` of `getPlantStage`, insert:

```js
function getDueWords() {
  const stats = getWordStats();
  return searchHistory
    .filter(entry => entry.wordData)
    .map(entry => {
      const s = stats[entry.word] || {};
      const level = s.level || 0;
      const lastSeen = s.lastSeen || 0;
      const daysSinceLast = (Date.now() - lastSeen) / 86400000;
      const nextInterval = getNextInterval(level);
      const isDue = daysSinceLast >= nextInterval && level < 4;
      const overdueBy = daysSinceLast - nextInterval;
      const isWilting = overdueBy > 0;
      return { entry, stats: s, level, isDue, isWilting, overdueBy };
    })
    .filter(x => x.isDue)
    .sort((a, b) => b.overdueBy - a.overdueBy);
}

function updateReviewBadge() {
  const badge = document.getElementById('navReviewBadge');
  if (!badge) return;
  const due = getDueWords();
  if (due.length === 0) {
    badge.hidden = true;
    badge.textContent = '0';
  } else {
    badge.hidden = false;
    badge.textContent = String(due.length);
  }
}
```

- [ ] **Step 3: Wire badge updates into existing flows**

Find `document.addEventListener('DOMContentLoaded', () => {` (around line 1709). Inside the handler, after `renderHistory();`, add a call:

```js
  renderHistory();
  updateReviewBadge();
  loadDailyWord();
```

Find `function addToHistory(word, wordData) {` (around line 1826). At the end of the function, after `renderHistory();`, add a call:

```js
  renderHistory();
  updateReviewBadge();
}
```

Find the end of `loadCloudData` — there is a line `renderHistory();` right before the `} catch (e) {` block (around line 1529). Replace it with:

```js
    renderHistory();
    updateReviewBadge();
```

Update the `handleRoute` function in Task 1 by adding a call to `updateReviewBadge()` at the top of the function (so the badge stays fresh on every navigation). Replace:

```js
function handleRoute() {
  const hash = window.location.hash || '#home';
```

with:

```js
function handleRoute() {
  updateReviewBadge();
  const hash = window.location.hash || '#home';
```

- [ ] **Step 4: Manual verification**

Open `index.html` in browser. In DevTools Console, paste the following to seed a due word:

```js
const stats = JSON.parse(localStorage.getItem('poortaal_word_stats') || '{}');
const history = JSON.parse(localStorage.getItem('poortaal_history') || '[]');
const TWO_DAYS_AGO = Date.now() - 2 * 86400000;
stats['testwoord'] = { lookups: 1, practices: 0, reviews: [], level: 0, lastSeen: TWO_DAYS_AGO };
const minimalData = { word: 'testwoord', meaning_nl: 'een test', meaning_en: 'a test', type: 'zelfstandig naamwoord' };
const idx = history.findIndex(h => h.word === 'testwoord');
const entry = { word: 'testwoord', timestamp: TWO_DAYS_AGO, wordData: minimalData };
if (idx >= 0) history[idx] = entry; else history.unshift(entry);
localStorage.setItem('poortaal_word_stats', JSON.stringify(stats));
localStorage.setItem('poortaal_history', JSON.stringify(history));
location.reload();
```

After reload, expected:
- The "Herhalen" nav item shows a red badge "1"
- `getDueWords()` in console returns an array of length 1 containing `testwoord`
- No console errors

Cleanup: paste `localStorage.clear(); location.reload();` to wipe the test seed.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(review): add getDueWords helper and nav badge"
```

---

## Task 3: Build the Herhalen tab home view (count card + empty state)

**Files:**
- Modify: `index.html` (CSS section, JS section)

**Goal:** Navigating to `#review` shows either the count card with a "Begin herhaling" button, or a calm empty state.

- [ ] **Step 1: Add tab-home CSS**

Find the CSS block ending with the `.history-empty {` rule (around line 673-680, near the micro-review styles). After the existing rules but inside `<style>`, add this block. A safe insertion point is just before the `</style>` tag (search for `</style>` — there is one in the file near line 1140):

```css
/* --- Review tab home --- */
.review-home { padding: 1rem 0; }
.review-home h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--gray-800);
  margin-bottom: 0.25rem;
}
.review-home .review-sub {
  color: var(--gray-500);
  font-size: 0.9rem;
  margin-bottom: 1rem;
}
.review-count-card {
  background: #fef9c3;
  border: 1px solid #fde68a;
  border-left: 4px solid #ca8a04;
  border-radius: 14px;
  padding: 1.5rem 1rem;
  text-align: center;
  margin-bottom: 1rem;
  animation: fadeUp 0.3s ease-out;
}
.review-count-num {
  font-size: 3rem;
  font-weight: 800;
  color: #92400e;
  line-height: 1;
}
.review-count-label {
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  color: #92400e;
  text-transform: uppercase;
  margin-top: 0.5rem;
  font-weight: 600;
}
.review-count-breakdown {
  font-size: 0.85rem;
  color: #a16207;
  margin-top: 0.5rem;
}
.review-start-btn {
  display: block;
  width: 100%;
  padding: 0.9rem;
  background: #ca8a04;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s;
}
.review-start-btn:hover { background: #b45309; }
.review-start-btn:active { transform: scale(0.99); }
.review-start-meta {
  text-align: center;
  font-size: 0.75rem;
  color: var(--gray-400);
  margin-top: 0.5rem;
}
.review-empty {
  text-align: center;
  padding: 4rem 1rem;
  color: var(--gray-500);
  animation: fadeUp 0.3s ease-out;
}
.review-empty .review-empty-emoji { font-size: 3rem; }
.review-empty .review-empty-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--gray-700);
  margin-top: 0.5rem;
}
.review-empty .review-empty-sub {
  font-size: 0.85rem;
  color: var(--gray-400);
  margin-top: 0.25rem;
}
```

- [ ] **Step 2: Replace the stub `renderReviewHome()` with the real implementation**

Find the stub `function renderReviewHome() { /* defined in Task 3 */ }` and replace it with:

```js
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
  // Implemented in Task 5
}
```

- [ ] **Step 3: Manual verification**

Open `index.html`. Click "Herhalen". Expected with no due words: see the "🌳 Alles fris voor vandaag · Kom morgen terug" empty state.

Seed two due words using DevTools Console:

```js
const stats = JSON.parse(localStorage.getItem('poortaal_word_stats') || '{}');
const history = JSON.parse(localStorage.getItem('poortaal_history') || '[]');
const TWO_DAYS = Date.now() - 2 * 86400000;
const TWELVE_DAYS = Date.now() - 12 * 86400000; // overdue for level 0 (interval 1) — wilting
stats['fiets'] = { lookups: 1, practices: 0, reviews: [], level: 0, lastSeen: TWELVE_DAYS };
stats['kaas']  = { lookups: 1, practices: 0, reviews: [], level: 0, lastSeen: TWO_DAYS  };
const seed = (w, ts, type) => ({ word: w, timestamp: ts, wordData: { word: w, meaning_nl: w, meaning_en: w, type } });
const merged = history.filter(h => h.word !== 'fiets' && h.word !== 'kaas');
merged.unshift(seed('fiets', TWELVE_DAYS, 'zelfstandig naamwoord'));
merged.unshift(seed('kaas',  TWO_DAYS,    'zelfstandig naamwoord'));
localStorage.setItem('poortaal_word_stats', JSON.stringify(stats));
localStorage.setItem('poortaal_history', JSON.stringify(merged));
location.reload();
```

After reload, click Herhalen. Expected:
- Header "Herhalen" + "2 woorden vandaag"
- Yellow count card showing "2" and breakdown "🥀 1 verwelkt · 🌿 1 vandaag"
- Yellow "Begin herhaling" button (does nothing yet — stub in Task 5)
- Nav badge shows "2"

Cleanup: `localStorage.clear(); location.reload();`

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(review): add Herhalen tab home view (count card and empty state)"
```

---

## Task 4: Add `review_again` branch to `updateWordStats`

**Files:**
- Modify: `index.html` (`updateWordStats` function around line 1784-1813)

**Goal:** Calling `updateWordStats(word, 'review_again')` records a review timestamp (so the word is no longer overdue today) without incrementing `level`.

- [ ] **Step 1: Modify `updateWordStats`**

Find:

```js
  if (type === 'review' || type === 'practice') {
    // Only count once per day — check if already reviewed today
    const today = new Date().toDateString();
    const lastReview = stats[w].reviews.length > 0 ? stats[w].reviews[stats[w].reviews.length - 1] : 0;
    const lastReviewDay = new Date(lastReview).toDateString();
    const alreadyReviewedToday = lastReview && lastReviewDay === today;
    
    if (!alreadyReviewedToday) {
      stats[w].reviews.push(Date.now());
      // First practice just records the review — stay at seed (level 0)
      // Spaced repetition level only increases from the second review day onwards
      if (stats[w].reviews.length >= 2) {
        stats[w].level = Math.min(stats[w].level + 1, 4);
      }
    }
  }
```

Replace with:

```js
  if (type === 'review' || type === 'practice' || type === 'review_again') {
    // Only count once per day — check if already reviewed today
    const today = new Date().toDateString();
    const lastReview = stats[w].reviews.length > 0 ? stats[w].reviews[stats[w].reviews.length - 1] : 0;
    const lastReviewDay = new Date(lastReview).toDateString();
    const alreadyReviewedToday = lastReview && lastReviewDay === today;
    
    if (!alreadyReviewedToday) {
      stats[w].reviews.push(Date.now());
      // First practice just records the review — stay at seed (level 0).
      // Spaced repetition level only increases from the second review day onwards,
      // and "review_again" (user clicked Opnieuw) never levels up.
      if (stats[w].reviews.length >= 2 && type !== 'review_again') {
        stats[w].level = Math.min(stats[w].level + 1, 4);
      }
    }
  }
```

- [ ] **Step 2: Manual verification**

In DevTools Console, run:

```js
localStorage.setItem('poortaal_word_stats', JSON.stringify({ foo: { lookups: 0, practices: 0, reviews: [Date.now() - 86400000 * 5], level: 1, lastSeen: Date.now() - 86400000 * 5 } }));
updateWordStats('foo', 'review_again');
const after = JSON.parse(localStorage.getItem('poortaal_word_stats')).foo;
console.log('level (expect 1):', after.level, 'reviews length (expect 2):', after.reviews.length);
```

Expected console output: `level (expect 1): 1 reviews length (expect 2): 2`

Then run:

```js
updateWordStats('foo', 'review');
const after2 = JSON.parse(localStorage.getItem('poortaal_word_stats')).foo;
console.log('level (expect 1 — same day guard):', after2.level);
```

Expected: `level (expect 1 — same day guard): 1` (same-day re-call doesn't double-count).

Cleanup: `localStorage.clear(); location.reload();`

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(review): add review_again branch to updateWordStats"
```

---

## Task 5: Session view skeleton — header, progress bar, card slot, render first word

**Files:**
- Modify: `index.html` (CSS, JS)

**Goal:** Clicking "Begin herhaling" hides the home section, shows a session view with header, progress bar, and the first word on a card (no interaction yet).

- [ ] **Step 1: Add session CSS**

Insert before the closing `</style>` tag (same location used in Task 3):

```css
/* --- Review session --- */
.review-session { display: flex; flex-direction: column; min-height: 70vh; }
.review-session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.25rem;
}
.review-back-btn {
  background: none;
  border: none;
  font-size: 1.4rem;
  color: var(--gray-500);
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  font-family: inherit;
}
.review-back-btn:hover { color: var(--gray-700); }
.review-progress-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--gray-600);
}
.review-progress-track {
  height: 3px;
  background: #f3f4f6;
  border-radius: 2px;
  overflow: hidden;
}
.review-progress-fill {
  height: 100%;
  background: #ca8a04;
  transition: width 0.25s ease-out;
}
.review-stack {
  position: relative;
  width: 100%;
  max-width: 360px;
  height: 320px;
  margin: 2rem auto;
}
.review-card {
  position: absolute;
  inset: 0;
  background: #fff;
  border: 1px solid var(--gray-100);
  border-radius: 18px;
  box-shadow: 0 12px 28px rgba(0,0,0,0.08);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  user-select: none;
  -webkit-user-select: none;
  cursor: pointer;
  touch-action: pan-y;
}
.review-card.back-2 { transform: translateY(14px) scale(0.94); opacity: 0.45; z-index: 1; pointer-events: none; }
.review-card.back-1 { transform: translateY(7px) scale(0.97); opacity: 0.75; z-index: 2; pointer-events: none; }
.review-card.front  { transform: rotate(-2deg); z-index: 3; }
.review-card.front.swipe-anim { transition: transform 0.2s ease-out; }
.review-stage-pill {
  display: inline-block;
  background: #fef9c3;
  color: #92400e;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  margin-bottom: 1rem;
}
.review-stage-pill.fresh { background: #ecfdf5; color: #047857; }
.review-card-word { font-size: 2rem; font-weight: 700; color: var(--gray-900); }
.review-card-type { font-size: 0.85rem; color: var(--blue-600); margin-top: 0.25rem; }
.review-card-hint { font-size: 0.8rem; color: var(--gray-400); margin-top: 1.25rem; }
.review-card-answer {
  display: none;
  margin-top: 1.25rem;
}
.review-card-answer.revealed { display: block; animation: fadeUp 0.25s ease-out; }
.review-card-answer .answer-nl { font-size: 1rem; color: var(--gray-700); }
.review-card-answer .answer-en { font-size: 0.85rem; color: var(--gray-500); margin-top: 0.25rem; font-style: italic; }
.review-actions {
  display: flex;
  gap: 0.6rem;
  margin: 1rem 0;
}
.review-actions button {
  flex: 1;
  padding: 0.85rem;
  border: none;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  color: #fff;
  transition: transform 0.15s, opacity 0.2s;
}
.review-actions button:disabled { opacity: 0.4; cursor: not-allowed; }
.review-actions button:not(:disabled):hover { transform: translateY(-1px); }
.review-btn-again { background: #eab308; }
.review-btn-know  { background: #22c55e; }
.review-card-confirm {
  font-size: 0.75rem;
  color: var(--gray-400);
  text-align: center;
}
.review-summary {
  text-align: center;
  padding: 2.5rem 1rem;
  animation: fadeUp 0.3s ease-out;
}
.review-summary-emoji { font-size: 3rem; }
.review-summary-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--gray-800);
  margin: 0.5rem 0 1.5rem 0;
}
.review-summary-stat {
  font-size: 1rem;
  color: var(--gray-700);
  margin: 0.25rem 0;
}
.review-summary-btn {
  display: block;
  width: 100%;
  padding: 0.85rem;
  background: var(--blue-600);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  margin-top: 1.5rem;
}
.review-summary-btn:hover { background: var(--blue-500); }
```

- [ ] **Step 2: Add session state vars and replace stub `startReviewSession`**

Find where other module-scope state lives, around `let practiceMessages = [];` (around line 1589). After that line, add:

```js
let reviewQueue = [];
let reviewIndex = 0;
let reviewResults = { know: 0, again: 0 };
let reviewRevealed = false;
let reviewSessionActive = false;
```

Find the stub `function startReviewSession() {` and replace its body so the function reads:

```js
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
    ? `<span class="review-stage-pill">🥀 ${Math.max(1, Math.floor(item.overdueBy))}d te laat</span>`
    : `<span class="review-stage-pill fresh">🌿 vandaag</span>`;
  const meaningNl = escapeHtml(data.meaning_nl || '');
  const meaningEn = escapeHtml(data.meaning_en || '');
  const safeWord = escapeHtml(word);
  const safeType = escapeHtml(data.type || '');
  const revealedClass = reviewRevealed ? 'revealed' : '';
  const actionsDisabled = reviewRevealed ? '' : 'disabled';
  // Show up to 2 "back" cards behind the front for stack feel
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
          <div class="review-card-hint" id="reviewCardHint" ${reviewRevealed ? 'hidden' : ''}>tik om te onthullen</div>
          <div class="review-card-answer ${revealedClass}" id="reviewCardAnswer">
            <div class="answer-nl">${meaningNl}</div>
            ${meaningEn ? `<div class="answer-en">${meaningEn}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="review-actions">
        <button class="review-btn-again" id="reviewBtnAgain" onclick="gradeAndAdvance(false)" ${actionsDisabled}>Opnieuw</button>
        <button class="review-btn-know"  id="reviewBtnKnow"  onclick="gradeAndAdvance(true)"  ${actionsDisabled}>Wist ik!</button>
      </div>
    </div>
  `;
}

function onReviewCardTap() { /* Task 6 */ }
function gradeAndAdvance(_known) { /* Task 7 */ }
function exitReviewSession() { /* Task 10 */ }
function renderReviewSummary() { /* Task 7 */ }
```

- [ ] **Step 3: Manual verification**

Reload, seed two due words (use the seed snippet from Task 3 Step 3), click Herhalen → "Begin herhaling". Expected:
- Header: `←` arrow, "1 / 2", thin yellow progress track at 0%
- Card stack: one back card visible behind a tilted front card
- Front card shows "🥀 …d te laat" pill, the word, the type, and "tik om te onthullen"
- Below: "Opnieuw" and "Wist ik!" buttons, both disabled (greyed)
- Tapping the card does nothing yet (handler is a stub)

Cleanup: `localStorage.clear(); location.reload();`

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(review): add session view skeleton with card stack"
```

---

## Task 6: Tap-to-reveal interaction

**Files:**
- Modify: `index.html` (replace `onReviewCardTap` stub)

**Goal:** Tapping the front card reveals the meaning (NL + EN), enables the Wist ik / Opnieuw buttons, and hides the "tik om te onthullen" hint.

- [ ] **Step 1: Replace the `onReviewCardTap` stub**

Replace:

```js
function onReviewCardTap() { /* Task 6 */ }
```

with:

```js
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
```

- [ ] **Step 2: Manual verification**

Reload, seed, enter session. Tap the front card. Expected:
- Meaning (Dutch + English in italic) fades in below the word
- "tik om te onthullen" hint disappears
- Both buttons become active (not greyed)
- Tapping the card again does nothing (already revealed)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(review): tap-to-reveal meaning in session card"
```

---

## Task 7: Button-based grading, advance, and summary card

**Files:**
- Modify: `index.html` (replace `gradeAndAdvance` and `renderReviewSummary` stubs)

**Goal:** Clicking Wist ik or Opnieuw records the grade, calls `updateWordStats`, advances to the next card, and shows the summary when done.

- [ ] **Step 1: Replace `gradeAndAdvance` and `renderReviewSummary` stubs**

Replace:

```js
function gradeAndAdvance(_known) { /* Task 7 */ }
```

with:

```js
function gradeAndAdvance(known) {
  if (!reviewSessionActive || !reviewRevealed) return;
  const item = reviewQueue[reviewIndex];
  if (!item) return;
  const word = item.entry.word;
  if (known) {
    reviewResults.know++;
    updateWordStats(word, 'review');
  } else {
    reviewResults.again++;
    updateWordStats(word, 'review_again');
  }
  updateReviewBadge();
  reviewIndex++;
  reviewRevealed = false;
  renderReviewSession();
}
```

Replace:

```js
function renderReviewSummary() { /* Task 7 */ }
```

with:

```js
function renderReviewSummary() {
  const root = document.getElementById('reviewSessionSection');
  if (!root) return;
  const know = reviewResults.know;
  const again = reviewResults.again;
  const lines = [];
  if (know  > 0) lines.push(`<div class="review-summary-stat">🌳 ${know} wist je</div>`);
  if (again > 0) lines.push(`<div class="review-summary-stat">🥀 ${again} opnieuw</div>`);
  if (lines.length === 0) lines.push(`<div class="review-summary-stat">Geen woorden beoordeeld</div>`);
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
  reviewSessionActive = false;
  reviewQueue = [];
  reviewIndex = 0;
  reviewResults = { know: 0, again: 0 };
  reviewRevealed = false;
  renderReviewHome();
}
```

- [ ] **Step 2: Manual verification**

Reload, seed two due words, enter session. For each word: tap to reveal, then click "Wist ik!" or "Opnieuw". Expected:
- After grading word 1: progress text becomes "2 / 2", new front card with second word, buttons reset to disabled
- After grading word 2: summary screen "🌳 Klaar!" with stats
- "Tot morgen" button → returns to tab home, which now shows the empty state (if both were "Wist ik!") or remaining count (if "Opnieuw" was used — note: `updateWordStats('review_again')` still bumps `lastSeen`, so wilting count drops to 0 either way and the word is no longer due today)

Verify in DevTools console:

```js
console.log(JSON.parse(localStorage.getItem('poortaal_word_stats')));
```

Expected: both words have `reviews.length >= 1`, and the one graded "Wist ik!" may have `level: 1` (only if it had a prior review timestamp — first-time graders stay at level 0 by the existing rule).

Cleanup: `localStorage.clear(); location.reload();`

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(review): button grading, advance, and end-of-session summary"
```

---

## Task 8: Swipe gestures on the front card

**Files:**
- Modify: `index.html` (extend `renderReviewSession` to wire pointer events on the front card)

**Goal:** When the front card is revealed, dragging it horizontally past 80px commits to a grade (right = Wist ik, left = Opnieuw) and animates it off-screen before advancing.

- [ ] **Step 1: Add `attachSwipeHandlers` helper and call it from `renderReviewSession`**

Find the end of the `renderReviewSession` function (the closing `}`). Add this immediately after:

```js
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
    // Cancel if user is mostly scrolling vertically
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
      // Right = Wist ik
      card.classList.add('swipe-anim');
      card.style.transform = `translateX(120%) rotate(20deg)`;
      setTimeout(() => gradeAndAdvance(true), 200);
    } else if (dx < -threshold) {
      // Left = Opnieuw
      card.classList.add('swipe-anim');
      card.style.transform = `translateX(-120%) rotate(-20deg)`;
      setTimeout(() => gradeAndAdvance(false), 200);
    } else {
      reset();
    }
  };
  card.addEventListener('pointerup', commitOrReset);
  card.addEventListener('pointercancel', commitOrReset);
}
```

- [ ] **Step 2: Call `attachReviewCardSwipe` after rendering**

At the very end of `renderReviewSession` (just before its closing `}`), add:

```js
  attachReviewCardSwipe();
```

So the function ends like:

```js
  root.innerHTML = `...`;
  attachReviewCardSwipe();
}
```

- [ ] **Step 3: Manual verification**

Reload, seed two due words, enter session, tap to reveal, then drag the card to the right past 80px. Expected:
- Card follows pointer with rotation
- Past threshold + release → card slides off-screen right, advances to next word
- Word stats now show this word as "wist ik" (review counted)

Repeat with a left drag on word 2 → slides off left, marked as "review_again".

Try dragging a few px and releasing → card snaps back to origin.

Try dragging before tapping to reveal → card doesn't move (handlers exit early).

On desktop: use mouse — pointer events handle that. On phone via PWA: should work with touch.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(review): swipe gestures on session card"
```

---

## Task 9: Keyboard shortcuts (Space, Enter, Arrows)

**Files:**
- Modify: `index.html` (add a window-level keydown listener that only acts during an active session)

**Goal:** Space reveals; Enter or Right = Wist ik; Left = Opnieuw.

- [ ] **Step 1: Add a keydown listener**

Find the `document.addEventListener('DOMContentLoaded', () => {` block (around line 1709). Inside that handler, after `handleRoute();`, add:

```js
  handleRoute();
  window.addEventListener('keydown', onReviewKeydown);
});

function onReviewKeydown(e) {
  if (!reviewSessionActive) return;
  // Ignore if focus is in an input/textarea
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  // Only act while a card is on screen (not the summary)
  if (reviewIndex >= reviewQueue.length) return;
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    onReviewCardTap();
  } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
    if (!reviewRevealed) return;
    e.preventDefault();
    gradeAndAdvance(true);
  } else if (e.key === 'ArrowLeft') {
    if (!reviewRevealed) return;
    e.preventDefault();
    gradeAndAdvance(false);
  }
}
```

Note: the snippet above splits the existing arrow callback. Concretely the diff is: after the existing `handleRoute();` line inside the `DOMContentLoaded` callback (before the closing `});`), insert `window.addEventListener('keydown', onReviewKeydown);`. Then place the `onReviewKeydown` function definition immediately after the `DOMContentLoaded` block.

- [ ] **Step 2: Manual verification**

Reload, seed two due words, enter session. On desktop:
- Press Space → card flips to reveal
- Press → (right arrow) → advances as Wist ik
- New card on screen, press Space → reveal
- Press ← (left arrow) → advances as Opnieuw
- After both: summary visible
- Pressing keys after summary: no effect

Focus a text input on Zoeken view, press Space — search input receives the space (no review action). Confirms the input-focus guard works.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(review): keyboard shortcuts for session (Space/Enter/Arrows)"
```

---

## Task 10: Mid-session exit — back arrow with confirm, plus nav-switch cleanup

**Files:**
- Modify: `index.html` (replace `exitReviewSession` and `resetReviewSessionIfActive` stubs)

**Goal:** Back arrow asks for confirmation and returns to tab home. Tapping a different bottom-nav tab silently ends the session.

- [ ] **Step 1: Replace the `exitReviewSession` and `resetReviewSessionIfActive` stubs**

Replace `function exitReviewSession() { /* Task 10 */ }` with:

```js
function exitReviewSession() {
  if (!reviewSessionActive) return;
  // Already on the summary screen? Just go home.
  if (reviewIndex >= reviewQueue.length) {
    endReviewSessionToHome();
    return;
  }
  const ok = window.confirm('Sessie stoppen? Je voortgang van deze sessie gaat verloren.');
  if (!ok) return;
  endReviewSessionToHome();
}
```

Replace `function resetReviewSessionIfActive() { /* defined in Task 10 */ }` with:

```js
function resetReviewSessionIfActive() {
  if (!reviewSessionActive) return;
  reviewSessionActive = false;
  reviewQueue = [];
  reviewIndex = 0;
  reviewResults = { know: 0, again: 0 };
  reviewRevealed = false;
  const session = document.getElementById('reviewSessionSection');
  const home = document.getElementById('reviewHomeSection');
  if (session) session.style.display = 'none';
  if (home) home.style.display = '';
}
```

- [ ] **Step 2: Manual verification**

Reload, seed two due words, enter session.

Test back arrow:
- Click `←` mid-session → confirm dialog appears
- Cancel → still in session, card unchanged
- Click `←` again → confirm → OK → returns to Herhalen tab home, which still shows the same count (no grades were committed)

Test nav-switch cleanup:
- Enter session again
- Click "Zoeken" in bottom nav → switches to home view silently (no confirm)
- Click "Herhalen" again → tab home shows (not the mid-session card)

Test summary-screen back arrow:
- Enter session, grade all words → summary shows
- Click `←` (would only show on summary if you re-render; on the summary view there is no `←`. The "Tot morgen" button handles return.) — no action needed; this verification is for the back arrow case during cards only.

Cleanup: `localStorage.clear(); location.reload();`

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(review): mid-session exit handling (back arrow + nav switch)"
```

---

## Task 11: Final end-to-end verification

**Files:** none — verification only.

- [ ] **Step 1: Full happy-path smoke test**

In a clean browser profile (or after `localStorage.clear(); location.reload();`):

```js
// Seed 3 due words: 1 wilting (5d overdue at level 0), 1 due-today (1d at level 0), 1 wilting-at-level-1 (4d overdue at level 1)
const FIVE_DAYS  = Date.now() - 5  * 86400000;
const ONE_DAY    = Date.now() - 1  * 86400000;
const FOUR_DAYS  = Date.now() - 4  * 86400000;
const stats = {
  fiets:    { lookups: 1, practices: 0, reviews: [],          level: 0, lastSeen: FIVE_DAYS },
  kaas:     { lookups: 1, practices: 0, reviews: [],          level: 0, lastSeen: ONE_DAY   },
  gezellig: { lookups: 1, practices: 1, reviews: [FOUR_DAYS - 86400000], level: 1, lastSeen: FOUR_DAYS },
};
const mk = (w, ts, type, mn, me) => ({ word: w, timestamp: ts, wordData: { word: w, type, meaning_nl: mn, meaning_en: me } });
const history = [
  mk('fiets',    FIVE_DAYS,  'zelfstandig naamwoord', 'fiets',    'bicycle'),
  mk('kaas',     ONE_DAY,    'zelfstandig naamwoord', 'kaas',     'cheese'),
  mk('gezellig', FOUR_DAYS,  'adjectief',             'gezellig', 'cozy, sociable'),
];
localStorage.setItem('poortaal_word_stats', JSON.stringify(stats));
localStorage.setItem('poortaal_history',   JSON.stringify(history));
location.reload();
```

Walk through:
1. Nav badge shows "3"
2. Click Herhalen → header reads "Herhalen", subtitle "3 woorden vandaag", count card "3 · 🥀 2 verwelkt · 🌿 1 vandaag", yellow Begin button visible
3. Click Begin → first card visible (most overdue = `fiets`), progress "1 / 3"
4. Tap card → meaning fades in, buttons enable
5. Swipe right → card flies off, next card (`gezellig`), progress "2 / 3"
6. Press Space → reveal; press Enter → next card (`kaas`), progress "3 / 3"
7. Tap card → reveal; click "Opnieuw" → summary "🌳 Klaar!  🌳 2 wist je · 🥀 1 opnieuw"
8. Click "Tot morgen" → tab home shows the empty state (all three have updated `lastSeen` so none are due now), badge is hidden

- [ ] **Step 2: Visual / dark-mode / mobile check**

Open the page on a phone (or DevTools responsive mode at 375px width). Verify:
- Bottom nav fits three items without wrapping
- Count card and start button stretch full width
- Session card and stack are centered, card width fits the viewport
- Buttons reachable on a phone (≥44px tap target)

- [ ] **Step 3: Regression sanity**

- Zoeken: search for a known Dutch word → still works
- Geschiedenis side panel: open, see entries with plant stages, tap a 🥀 wilting entry → existing micro-review modal still opens (independent of the new tab)
- Oefenen: still routes correctly
- Daily word: still loads at top of home view

- [ ] **Step 4: No remaining commits**

```bash
git status
```

Expected: working tree clean. If any uncommitted tweaks emerged during verification, commit them with a descriptive message.

---

## Self-review notes

- **Spec coverage:** every spec section maps to a task — overview (Task 1), data/getDueWords (Task 2), updateWordStats branch (Task 4), tab home UI (Task 3), session view (Task 5), tap-to-reveal (Task 6), grading + summary (Task 7), swipe (Task 8), keyboard (Task 9), exit (Task 10), end-to-end check (Task 11).
- **No placeholders:** every "stub" function is replaced with concrete code in a later task; the stubs exist solely so each commit compiles and renders.
- **Type consistency:** `gradeAndAdvance(boolean)`, `onReviewCardTap()`, `attachReviewCardSwipe()`, `renderReviewSession()`, `renderReviewSummary()`, `endReviewSessionToHome()`, `exitReviewSession()`, `resetReviewSessionIfActive()`, `startReviewSession()`, `getDueWords()`, `updateReviewBadge()` — names match across tasks.
- **Existing helpers reused:** `getWordStats`, `getNextInterval`, `updateWordStats`, `saveWordStatsToCloud` (called transitively via `updateWordStats`), `escapeHtml`, `showToast`, `fadeUp` keyframes.
