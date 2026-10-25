# Structured Practice — Phase 1

Practice defaults to text-based, step-by-step learning. The existing voice tab,
Realtime Tutor, Explore, Review and historical word-learning evidence remain available.

## Learner flow

- First encounter with a concrete use: **Guided** shows a short situation, 2–4
  conversational expressions, a mini dialogue and at most one necessary reminder.
- **Nu jij** hides those examples and asks for 2–3 Dutch sentences.
- Later sessions use **Recall**: a new situation and communication goal appear
  before any reference language. Three optional hints reveal a content question,
  a sentence starter, then a possible response.
- Feedback starts with a strength and separately assesses the communication goal,
  target use and naturalness. At most one improvement is shown, labelled as an
  error or an optional naturalness suggestion, with exact learner evidence.
- The learner can try one changed condition or skip it. A retry never branches
  into another retry. The completion screen returns to word selection.

## State and storage

`structured-session.ts` owns the state machine independently of the live tutor.
`structured-contract.ts` validates scenarios and feedback; `structured-restore.ts`
validates persisted state, including ownership, bounds and phase consistency.

Sessions, drafts, submitted responses, hint levels, feedback and retry outcomes
are saved under `poortaal_structured_practice:<learningOwner>`. Incomplete sessions
and the latest 30 completed sessions are retained. Reloading `#practice` restores
the active session; selecting a word resumes its unfinished use. Sessions are
local to this browser and account; unlike learning results, full transcripts do
not currently sync between devices. Guest sessions stay with the guest owner.

Submissions are saved before AI requests. Busy guards, revision checks and Web
Locks (where available) protect against duplicate and stale-tab submissions.
Interrupted requests require an explicit retry after refresh: the existing Worker
proxy does not provide a durable server-side idempotency cache for OpenAI calls.
Stable per-round IDs prevent duplicate Learning Store evidence, including replay
after an interrupted progress write. Deleting a word clears its attached sessions.

Learning results reuse `recordWordAttempt` and existing `usage_progress` cloud sync.
Guided work, visible Explore examples, explicit hints and feedback-assisted retries
cannot become `independent`. Correct unassisted Recall may become independent;
task failure, missing/incorrect target use or unclear output needs more practice.
Optional naturalness advice alone does not downgrade correct target usage.

AI requests reuse OpenAI Client and the Worker's `/openai` endpoint. A2–B1 language,
authentic everyday contexts, verified Word Usage and no invented collocations are
prompt requirements. Schema/evidence validation cannot prove linguistic quality;
model judgments still need real learner testing. No new Worker deployment is needed.

## Phase 2 handoff

Add an enabled Realtime entry only when a working handoff is implemented. Pass
the session ID, word and selected use, latest situation, learner responses, help
used, three feedback dimensions and the single improvement to the existing
encounter controller. Start with a new conversational condition and an invitation
to respond; do not repeat the examples or mini lesson. Keep help available on demand
and preserve supported/independent provenance across the handoff. Reuse the existing
voice/session lifecycle and transcript machinery rather than replacing it.

## Validation

`npm test` includes contract, transition, request-race, storage-recovery and DOM
interaction coverage. Run `npm run eval:words` and `npm run build` as regression
checks. The default word eval prints cases and scorecards; `--live` is a separate
model-content review, not a claim made by deterministic tests.
