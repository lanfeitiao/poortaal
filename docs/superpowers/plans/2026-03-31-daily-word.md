# Woord van de Dag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Woord van de Dag" feature that presents a curated Dutch word each day with a streak counter, loaded from a `words.json` file via fetch.

**Architecture:** A `words.json` file holds 1000 curated Dutch words. On page load, the app fetches this file, selects today's word using an absolute-day-from-epoch index, and renders a card above the search area. Clicking the card triggers the existing `lookupWord()` flow. A streak counter in localStorage tracks consecutive daily engagement.

**Tech Stack:** Vanilla HTML/CSS/JS (single-file app), JSON data file

**Spec:** `docs/superpowers/specs/2026-03-31-daily-word-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `words.json` | Create | 1000 curated Dutch word objects with `word`, `teaser`, `category` |
| `index.html` | Modify | Add daily word card CSS, HTML container, and JS logic |

---

### Task 1: Create `words.json` with 1000 curated Dutch words

**Files:**
- Create: `words.json`

This is the data backbone. Each entry has three fields: `word` (Dutch word), `teaser` (English hint, 5-15 words), `category` (one of: everyday, culture, food, expressions, useful, seasonal, nature).

- [ ] **Step 1: Create `words.json` with all 1000 entries**

The file is a flat JSON array. Words are grouped by category for maintainability. Target distribution:
- ~250 everyday, ~150 culture, ~100 food, ~150 expressions, ~150 useful, ~100 seasonal, ~100 nature

Here is the start of the file — the full file must contain exactly 1000 entries following this pattern:

```json
[
  { "word": "gezellig", "teaser": "The untranslatable heart of Dutch culture", "category": "culture" },
  { "word": "lekker", "teaser": "The most versatile word in Dutch — tasty, nice, great", "category": "everyday" },
  { "word": "uitbuiken", "teaser": "To sit back and let your belly digest after a big meal", "category": "culture" },
  { "word": "fiets", "teaser": "The bicycle — the true king of Dutch transport", "category": "useful" },
  { "word": "hagelslag", "teaser": "Chocolate sprinkles eaten on bread for breakfast", "category": "food" },
  { "word": "stamppot", "teaser": "A hearty mashed potato dish with vegetables", "category": "food" },
  { "word": "borrel", "teaser": "Drinks with friends — a Dutch social ritual", "category": "culture" },
  { "word": "schaatsen", "teaser": "Ice skating — a beloved Dutch winter tradition", "category": "seasonal" },
  { "word": "polder", "teaser": "Land reclaimed from water, shaping the Dutch landscape", "category": "nature" },
  { "word": "alsjeblieft", "teaser": "Please, or here you go — used constantly", "category": "everyday" }
]
```

Requirements for the full list:
- No duplicate words
- Teasers should be engaging and hint at meaning or cultural context
- Mix difficulty levels: common words a beginner needs, plus interesting words that reveal Dutch culture
- Valid JSON — no trailing commas, proper escaping

- [ ] **Step 2: Validate the JSON**

Run:
```bash
python3 -c "
import json
with open('words.json') as f:
    words = json.load(f)
print(f'Total words: {len(words)}')
cats = {}
for w in words:
    cats[w[\"category\"]] = cats.get(w[\"category\"], 0) + 1
    assert \"word\" in w and \"teaser\" in w and \"category\" in w, f'Missing field in {w}'
    assert w[\"category\"] in [\"everyday\",\"culture\",\"food\",\"expressions\",\"useful\",\"seasonal\",\"nature\"], f'Bad category: {w[\"category\"]}'
assert len(set(w[\"word\"] for w in words)) == len(words), 'Duplicate words found'
print('Categories:', dict(sorted(cats.items())))
print('All valid!')
"
```

Expected:
```
Total words: 1000
Categories: {'culture': ~150, 'everyday': ~250, 'expressions': ~150, 'food': ~100, 'nature': ~100, 'seasonal': ~100, 'useful': ~150}
All valid!
```

- [ ] **Step 3: Commit**

```bash
git add words.json
git commit -m "feat: add 1000 curated Dutch words for daily word feature"
```

---

### Task 2: Add daily word card CSS to `index.html`

**Files:**
- Modify: `index.html` (CSS section, lines ~534-540, before the `</style>` closing tag)

- [ ] **Step 1: Add the daily word card styles**

Insert before the closing `</style>` tag (line 541), after the responsive media query block:

```css
/* Daily word card */
.daily-word-card {
  background: white;
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  border: 1px solid var(--blue-100);
  border-left: 4px solid var(--blue-400);
  animation: fadeUp 0.35s ease-out;
}

.daily-word-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.daily-word-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--blue-500);
}

.streak-badge {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: var(--blue-50);
  color: var(--blue-600);
  padding: 0.25rem 0.65rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}

.daily-word-main {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
}

.daily-word-main h2 {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--blue-800);
}

.daily-word-teaser {
  color: var(--gray-500);
  font-size: 0.95rem;
  margin-bottom: 1rem;
}

.daily-word-cta {
  display: inline-block;
  padding: 0.65rem 1.4rem;
  background: linear-gradient(135deg, var(--blue-600), var(--blue-700));
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 0.9rem;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.daily-word-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37,99,235,0.35);
}
```

- [ ] **Step 2: Add responsive rule for daily word card**

Inside the existing `@media (max-width: 480px)` block (line 535), add:

```css
  .daily-word-main h2 { font-size: 1.4rem; }
  .daily-word-main { flex-wrap: wrap; }
```

- [ ] **Step 3: Verify styles render**

Open `index.html` in a browser. No daily word card should appear yet (the HTML/JS aren't added), but there should be no CSS errors in the browser console.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "style: add daily word card CSS"
```

---

### Task 3: Add daily word HTML container to `index.html`

**Files:**
- Modify: `index.html` (HTML section, inside `<main>`, before the search area)

- [ ] **Step 1: Add the daily word container div**

Insert immediately after `<main>` (line 553) and before the `<div class="search-area">` (line 554):

```html
  <div id="dailyWordContainer"></div>
```

This empty div will be populated by JavaScript after the word list loads.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add daily word container element"
```

---

### Task 4: Add daily word JavaScript logic to `index.html`

**Files:**
- Modify: `index.html` (script section)

- [ ] **Step 1: Add helper functions for day calculation, shuffle, and streak**

Insert after the `let practiceLoading = false;` line (line 611), before the `// --- Init ---` comment:

```js
// --- Daily Word ---
const DAILY_EPOCH = new Date(2026, 0, 1); // Jan 1, 2026

function getAbsoluteDay() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - DAILY_EPOCH) / 86400000);
}

function seededShuffle(arr, seed) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    seed = (seed * 16807 + 0) % 2147483647;
    const j = seed % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getTodayWord(words) {
  const absoluteDay = getAbsoluteDay();
  const cycle = Math.floor(absoluteDay / words.length);
  const effectiveList = cycle === 0 ? words : seededShuffle(words, cycle);
  return effectiveList[absoluteDay % words.length];
}

function getStreak() {
  try {
    return JSON.parse(localStorage.getItem('poortaal_streak')) || { lastDate: null, count: 0 };
  } catch { return { lastDate: null, count: 0 }; }
}

function updateStreak() {
  const streak = getStreak();
  const today = new Date().toISOString().slice(0, 10);
  if (streak.lastDate === today) return streak;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = {
    lastDate: today,
    count: streak.lastDate === yesterday ? streak.count + 1 : 1
  };
  localStorage.setItem('poortaal_streak', JSON.stringify(newStreak));
  return newStreak;
}

function renderDailyWord(word) {
  const container = document.getElementById('dailyWordContainer');
  const streak = getStreak();
  const streakCount = streak.count || 0;
  container.innerHTML = `
    <div class="daily-word-card">
      <div class="daily-word-top">
        <div class="daily-word-label">Woord van de Dag</div>
        <div class="streak-badge">\u{1F333} Dag ${streakCount}</div>
      </div>
      <div class="daily-word-main">
        <h2>${escapeHtml(word.word)}</h2>
        <span class="word-type">${escapeHtml(word.category)}</span>
      </div>
      <div class="daily-word-teaser">${escapeHtml(word.teaser)}</div>
      <button class="daily-word-cta" onclick="exploreDailyWord()">Ontdek dit woord</button>
    </div>
  `;
}

function exploreDailyWord() {
  if (!currentDailyWord) return;
  const streak = updateStreak();
  // Update streak display
  const badge = document.querySelector('.streak-badge');
  if (badge) badge.textContent = '\u{1F333} Dag ' + streak.count;
  // Trigger word lookup
  document.getElementById('wordInput').value = currentDailyWord.word;
  lookupWord();
}

let currentDailyWord = null;

async function loadDailyWord() {
  try {
    const res = await fetch('words.json');
    if (!res.ok) return;
    const words = await res.json();
    if (!Array.isArray(words) || words.length === 0) return;
    currentDailyWord = getTodayWord(words);
    renderDailyWord(currentDailyWord);
  } catch {
    // Silently skip — daily word is non-essential
  }
}
```

- [ ] **Step 2: Call `loadDailyWord()` from the DOMContentLoaded handler**

Modify the existing `DOMContentLoaded` handler (line 614) to add the `loadDailyWord()` call:

Change:
```js
document.addEventListener('DOMContentLoaded', () => {
  if (!apiKey) openApiModal();
  renderHistory();
  document.getElementById('wordInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') lookupWord();
  });
});
```

To:
```js
document.addEventListener('DOMContentLoaded', () => {
  if (!apiKey) openApiModal();
  renderHistory();
  loadDailyWord();
  document.getElementById('wordInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') lookupWord();
  });
});
```

- [ ] **Step 3: Verify in browser**

Open `index.html` via a local server:

```bash
cd /path/to/poortaal && python3 -m http.server 8000
```

Open `http://localhost:8000` and verify:
- The daily word card appears above the search area
- It shows the correct word, teaser, category, and streak count
- Clicking "Ontdek dit woord" fills the search input and triggers a lookup (requires API key)
- The streak badge updates after clicking
- The search box still works independently
- No console errors

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add daily word (Woord van de Dag) feature"
```

---

### Task 5: Manual end-to-end verification

**Files:** None (testing only)

- [ ] **Step 1: Verify daily word loads correctly**

Serve the app and open it:
```bash
cd /path/to/poortaal && python3 -m http.server 8000
```

Check:
- Daily word card appears at top with word, teaser, category tag, streak badge (🌳 Dag 0)
- Card has a blue left border accent
- "Ontdek dit woord" button has gradient styling

- [ ] **Step 2: Verify streak logic**

In browser console:
```js
// Check streak starts at 0
JSON.parse(localStorage.getItem('poortaal_streak'))
// Click "Ontdek dit woord", then check again
JSON.parse(localStorage.getItem('poortaal_streak'))
// Should show { lastDate: "2026-03-31", count: 1 }
```

- [ ] **Step 3: Verify search still works independently**

Type a different word (e.g., "huis") into the search box and click Ontdek. Verify the word lookup works as before.

- [ ] **Step 4: Verify graceful failure**

Temporarily rename `words.json` to `words.json.bak`:
```bash
mv words.json words.json.bak
```

Reload the page. Verify:
- No daily word card appears
- No error shown to user
- Search still works normally

Restore:
```bash
mv words.json.bak words.json
```

- [ ] **Step 5: Verify responsive layout**

Open browser dev tools, toggle device toolbar to a mobile viewport (375px wide). Check:
- Daily word card stacks properly
- Word and category wrap if needed
- Button is still accessible
