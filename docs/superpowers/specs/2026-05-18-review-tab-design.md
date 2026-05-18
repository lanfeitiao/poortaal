# Herhalen Tab — Design Spec

## Overview

Add a dedicated **Herhalen** (Review) tab to Poortaal that surfaces words due for spaced-repetition review and walks the user through them in a focused, swipeable card-stack session. The goal is to remove the friction of scrolling the history panel to find wilting words and reviewing them one click at a time.

The feature is purely additive: history panel, micro-review modal, spaced-repetition logic, plant stages, daily word, and Supabase sync are unchanged.

## Scope

**In scope — what counts as "due":**

- Words whose `getPlantStage()` returns key `wilting` (overdue past the schedule)
- Words whose spaced-repetition interval has elapsed today but are not yet wilting (i.e., `daysSinceLast >= nextInterval` for their current `level`)

**Out of scope:**

- New review modalities (NL↔EN, fill-in, multiple choice) — same "what does this word mean?" recall prompt as the existing micro-review modal
- Configurable interval schedule
- Replacing or removing the existing micro-review modal in the history panel
- Server-side scheduling or push notifications
- Review-session streaks or session history
- Animated card-stack reshuffle (only the front card animates; back cards re-render statically)

## Architecture

### Routes & view

- A new `#review` route registered alongside the existing `#home` and `#practice` routes
- New `<div id="view-review" class="view">` element in `index.html`
- The existing `route()` and `navigateTo()` functions already handle hash-based switching — extend them to recognise `#review`
- Bottom nav (`.bottom-nav`) gets a third `<a href="#review" id="nav-review">` entry between Zoeken and Oefenen

### Data

No schema changes. Reuse the existing `poortaal_word_stats` localStorage object (and Supabase `user_words` table); every field needed already exists:

- `level` (0–4)
- `lastSeen` (timestamp)
- `reviews` (array of timestamps)
- `practices` (count)

A single new helper `getDueWords()` filters `searchHistory`:

```js
function getDueWords() {
  return searchHistory
    .filter(entry => entry.wordData) // need cached meaning to render the card
    .map(entry => {
      const stats = getWordStats()[entry.word] || {};
      const level = stats.level || 0;
      const lastSeen = stats.lastSeen || 0;
      const daysSinceLast = (Date.now() - lastSeen) / 86400000;
      const nextInterval = getNextInterval(level);
      const isDue = daysSinceLast >= nextInterval && level < 4;
      const overdueBy = daysSinceLast - nextInterval;
      return { entry, stats, isDue, overdueBy };
    })
    .filter(x => x.isDue)
    .sort((a, b) => b.overdueBy - a.overdueBy); // most-overdue first
}
```

### Session state

Module-scope variables (matching existing patterns like `practiceMessages`):

- `reviewQueue` — array of history entries, captured once at session start
- `reviewIndex` — current position in the queue
- `reviewResults` — `{ know: number, again: number }`
- `reviewRevealed` — boolean, whether current card's meaning is shown
- `reviewSwipeState` — transient `{ startX, currentX, dragging }` during a drag

No persistence — exiting mid-session discards progress. Already-graded words remain graded because their stats were saved immediately on each grade.

### Grading

- **"Wist ik"** calls the existing `updateWordStats(word, 'review')`. The existing implementation records a timestamp in `reviews[]` and (from the second review day onwards) increments `level` up to 4.
- **"Opnieuw"** calls `updateWordStats(word, 'review_again')` — a new branch. It records a timestamp in `reviews[]` so the word is no longer overdue today, but does **not** increment `level`. Future practice is still required to advance.

Concretely, the existing function changes:

```js
if (type === 'review' || type === 'practice' || type === 'review_again') {
  // ...existing "only count once per day" guard
  if (!alreadyReviewedToday) {
    stats[w].reviews.push(Date.now());
    if (stats[w].reviews.length >= 2 && type !== 'review_again') {
      stats[w].level = Math.min(stats[w].level + 1, 4);
    }
  }
}
```

Both branches still call `saveWordStatsToCloud(w)`.

### Tab badge

A single function `updateReviewBadge()` reads `getDueWords().length` and toggles a `<span class="nav-badge">` inside `#nav-review`. Called from:

- Initial page load (after `loadCloudData()` completes)
- After `addToHistory()`
- After each grade in a session
- After session ends
- On every `route()` invocation

## UI Components

### Tab home — has due words

```
┌──────────────────────────────────┐
│  Herhalen                        │
│  5 woorden vandaag               │
│                                  │
│  ┌────────────────────────────┐  │
│  │           5                │  │
│  │      WOORDEN VANDAAG       │  │
│  │  🥀 2 verwelkt · 🌿 3 vandaag│  │
│  └────────────────────────────┘  │
│                                  │
│  [   ▶ Begin herhaling      ]    │
│  ~2 min · automatisch volgende   │
└──────────────────────────────────┘
```

- Yellow accent palette to distinguish from the blue daily-word card: `#ca8a04` (button), `#fef9c3` (count card bg), `#fde68a` (border)
- Reuses existing `.card` base styles + design tokens where possible
- Class names: `.review-home`, `.review-count-card`, `.review-start-btn`

### Tab home — empty

Calm, centered:

```
🌳
Alles fris voor vandaag
Kom morgen terug
```

No CTA. Class: `.review-empty`.

### Session view

Replaces the tab-home content in-place (no route change). Layout:

```
┌──────────────────────────────────┐
│  ←              3 / 5            │
│  ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░       │  ← progress fill (yellow)
│                                  │
│    ┌──────────────────────┐      │
│    │  🥀 2d te laat       │      │  ← back card 2 (faded)
│    └──────────────────────┘      │
│   ┌────────────────────────┐     │  ← back card 1 (faded)
│   │                        │     │
│  ┌──────────────────────────┐    │  ← front card (rotated slightly)
│  │   🥀 2d te laat          │    │
│  │                          │    │
│  │      gezellig            │    │
│  │      adjectief           │    │
│  │                          │    │
│  │  tik om te onthullen     │    │
│  └──────────────────────────┘    │
│                                  │
│  [ Opnieuw ]    [ Wist ik! ]    │
└──────────────────────────────────┘
```

- Top bar: back arrow (`←`), progress text (`reviewIndex + 1 / reviewQueue.length`), thin progress track + yellow fill
- Card stack area: up to 3 cards visible. Back cards are `transform: translateY(8px) scale(0.96)` and `translateY(16px) scale(0.92)` with reduced opacity. Front card has a slight `rotate(-3deg)` for tactile feel.
- Front card content (pre-reveal): plant-stage pill, the Dutch word (~36px), the `type` (small, blue), hint text
- Front card content (post-reveal): same header, then `meaning_nl` and `meaning_en` faded in via existing `fadeUp` animation
- Below card: `Opnieuw` (yellow) and `Wist ik!` (green) buttons. Disabled before reveal.

### Summary card

After the last card is graded:

```
┌──────────────────────────────────┐
│             🌳                   │
│           Klaar!                 │
│                                  │
│  🌳  4  wist je                  │
│  🥀  1  opnieuw                  │
│                                  │
│  [     Tot morgen           ]    │
└──────────────────────────────────┘
```

"Tot morgen" → returns to the Herhalen tab home (now empty state if all graded "Wist ik", or showing remaining count if "Opnieuw" was used).

## Interaction Details

### Session start

When the user taps `Begin herhaling`:

1. `reviewQueue = getDueWords()` — captured once, frozen for the session
2. `reviewIndex = 0`, `reviewResults = { know: 0, again: 0 }`, `reviewRevealed = false`
3. Tab content replaced with session view (DOM swap inside `#view-review`)
4. First card rendered as the front of the stack

### Tap to reveal

- Tap anywhere on the front card → set `reviewRevealed = true`
- `meaning_nl` and `meaning_en` fade in (existing `.fadeUp` keyframes)
- Buttons + swipe become active

### Swipe mechanics

- `pointerdown` / `pointermove` / `pointerup` listeners on the front card (mirrors the existing `initSwipeHandlers` in the history list)
- During drag: `translate3d(deltaX, 0, 0) rotate(deltaX / 20 deg)` on the front card
- Threshold: 80px past origin → commit
  - Right past threshold → Wist ik
  - Left past threshold → Opnieuw
- Below threshold on release → animate back to origin (200ms ease-out)
- On commit: animate card off-screen in the direction (200ms), then advance
- Back cards do **not** animate forward — they are simply re-rendered in their new positions on advance

### Buttons (and keyboard)

- `Wist ik!` / `Opnieuw` are always present below the card; enabled after reveal
- Keyboard parity (desktop): `→` or `Enter` = Wist ik; `←` = Opnieuw; `Space` = reveal
- Buttons fire the same advance logic as a committed swipe (no slide-off animation needed for the button path — just instant advance)

### Advance

On each grade (button or swipe):

1. Increment `reviewResults.know` or `reviewResults.again`
2. Call `updateWordStats(word, 'review')` or `updateWordStats(word, 'review_again')`
3. Call `updateReviewBadge()` so the nav reflects the change immediately
4. `reviewIndex++`
5. If `reviewIndex >= reviewQueue.length` → render summary card
6. Else → reset `reviewRevealed = false`, render next front card

### Back arrow / exit mid-session

- Tapping `←` shows a `confirm()`-style dialog: "Sessie stoppen? Je voortgang van deze sessie gaat verloren."
- Yes → reset session state, render tab home
- No → stay in session
- Already-graded words remain graded (their stats were saved at the time of grading)

### History panel — unchanged

- Tapping a 🥀 wilting entry still opens the existing micro-review modal
- Tapping a non-wilting entry still re-searches via `trySuggestion()`
- The two entry points coexist intentionally: the Herhalen tab is the batch flow; the history modal is the one-off interrupt

## Error Handling

- **No `wordData` cached** on a history entry: filtered out by `getDueWords()`. The word still appears in the history panel with its plant stage but cannot be reviewed in a session.
- **Queue becomes empty during session:** can only happen with a 1-word queue. Summary shows normally with count 1.
- **Navigating away via bottom-nav mid-session:** treated the same as confirmed back-arrow exit, silently — session state is reset, already-graded words remain graded. No confirmation dialog (the nav tap is already a clear intent to leave; matches how the practice chat behaves on nav switch).
- **Cloud sync failure on grade:** local write succeeds first; Supabase upsert fires async. On failure, local state is the source of truth; the next page load re-syncs via the existing merge logic in `loadCloudData()`.
- **Daily-word streak** (`poortaal_streak`) is independent and unchanged.
- **PWA / manifest:** no changes.

## Files Changed

| File | Change |
|------|--------|
| `index.html` | Add `#review` route, `view-review` element, third bottom-nav item, session UI (tab home, card stack, summary), swipe + keyboard handlers, CSS for `.review-*` classes, badge wiring; add `review_again` branch in `updateWordStats` |

No new files. No schema migration. No worker changes.
