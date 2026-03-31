# Woord van de Dag — Design Spec

## Overview

Add a "Woord van de Dag" (Word of the Day) feature to Poortaal that automatically presents a curated Dutch word each day, encouraging daily engagement and building vocabulary over time.

## Architecture

### Data source

- A `words.json` file containing an array of 1000 curated Dutch word objects
- Loaded via `fetch('words.json')` on page load
- Each word object:

```json
{
  "word": "gezellig",
  "teaser": "The untranslatable heart of Dutch culture",
  "category": "culture"
}
```

### Categories

Words are organized across these categories (not evenly — weighted by usefulness):

| Category | Description | Approx. count |
|----------|-------------|----------------|
| everyday | Common words for daily life | ~250 |
| culture | Culturally significant or untranslatable words | ~150 |
| food | Food, drink, dining | ~100 |
| expressions | Idioms, colloquialisms, slang | ~150 |
| useful | Practical words (transport, shopping, bureaucracy) | ~150 |
| seasonal | Holidays, weather, seasonal activities | ~100 |
| nature | Geography, animals, landscape | ~100 |

### Word selection logic

- Use an absolute day count from a fixed epoch (Jan 1, 2026) so the index increments continuously across years
- Index into the array: `absoluteDay % words.length`
- When the list wraps (~2.74 years), apply a deterministic cycle-seeded shuffle so the order changes each cycle:

```js
const EPOCH = new Date(2026, 0, 1); // Jan 1, 2026

function getAbsoluteDay() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - EPOCH) / 86400000);
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

const absoluteDay = getAbsoluteDay();
const cycle = Math.floor(absoluteDay / words.length);
const effectiveList = cycle === 0 ? words : seededShuffle(words, cycle);
const todayWord = effectiveList[absoluteDay % words.length];
```

## UI Design

### Daily word card

Position: top of `<main>`, above the search area. Visually distinct from result cards.

**Default state** (word not yet explored today):

```
+--------------------------------------------------+
|  WOORD VAN DE DAG              Dag 7 streak      |
|                                                   |
|  gezellig                          [culture]      |
|  The untranslatable heart of Dutch culture        |
|                                                   |
|  [ Ontdek dit woord ]                             |
+--------------------------------------------------+
```

- Card has a subtle left border accent (using `var(--blue-400)`) to distinguish from regular cards
- Category shown as a small tag (same style as `.word-type`)
- Streak counter in top-right corner
- CTA button styled like the existing `.practice-btn` but smaller

**Completed state** (user has explored today's word):

```
+--------------------------------------------------+
|  WOORD VAN DE DAG              Dag 7 streak      |
|                                                   |
|  gezellig                     [culture]  done     |
|  The untranslatable heart of Dutch culture        |
+--------------------------------------------------+
```

- CTA button replaced with a subtle "done" indicator (checkmark + muted text)
- Card still visible but visually de-emphasized (slightly lower opacity or muted border)
- User can still click the word to revisit it

### Styling

- Reuses existing design tokens (`--blue-*`, `--gray-*`, `.card` base styles)
- Daily word card class: `.daily-word-card`
- Streak badge: small pill-shaped element, `var(--blue-50)` background, `var(--blue-600)` text
- Responsive: on mobile, card stacks vertically (word, teaser, button each on own row)

## Streak Logic

### Storage

`localStorage` key: `poortaal_streak`

```json
{
  "lastDate": "2026-03-31",
  "count": 7
}
```

### Rules

- User opens Poortaal and clicks "Ontdek dit woord" on the daily word card
- If `lastDate` is today: already engaged, show completed state, count unchanged
- If `lastDate` is yesterday: increment count by 1
- If `lastDate` is older or missing: reset count to 1 (streak broken)
- Streak updates when the user clicks the CTA (not just on page load)

## Interaction Flow

1. Page loads → `fetch('words.json')` runs
2. On success → compute today's word, render the daily word card above the search area
3. On failure (network error, 404) → silently skip; the app works normally without the daily word
4. User clicks "Ontdek dit woord" → word is placed in the search input, `lookupWord()` is called, streak is updated, card transitions to completed state
5. If user has already explored today's word (detected from localStorage on load) → card renders directly in completed state
6. User can still use the search box to look up any word at any time — no change to existing behavior

## Error Handling

- If `words.json` fails to load: the daily word card simply doesn't appear. No error shown. The rest of the app works normally.
- If the array is empty or malformed: same as above — silently skip.
- The daily word feature is entirely additive and non-blocking.

## Data: words.json

- A flat JSON array of 1000 objects
- Each object has three string fields: `word`, `teaser`, `category`
- Teasers are in English, 5-15 words, hinting at meaning or cultural significance
- Words are ordered by category clusters for maintainability, but selection is index-based so order in the file doesn't affect daily sequencing
- The list should cover a range of difficulty levels and include both practical vocabulary and culturally interesting words

## Files Changed

| File | Change |
|------|--------|
| `words.json` | New file — 1000 curated Dutch words |
| `index.html` | Add daily word card HTML, CSS, and JS logic |

## Out of Scope

- Notifications / push reminders
- Spaced repetition algorithm
- User accounts or cloud sync
- Customizable difficulty levels
- Multiple words per day
