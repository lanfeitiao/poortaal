# Contextual learning and structured spoken practice

Explore teaches the selected word sense through one coherent everyday situation,
a complete conversation of at most five Dutch sentences and an optional language notice. Verified
Word Usage is retained; ordinary expressions are not labelled as collocations.
Legacy definitions, examples, Review data and usage evidence remain valid.

Lessons are validated and cached with their sense and use, and join existing word
cloud sync. Failed generation shows a retry without fabricating a lesson. Recently
viewed examples are remembered per owner/use for 30 minutes; direct lesson handoff
also carries the studied scene and its assistance provenance into the session.

Learning scenes use GPT-6.1 Sol with medium reasoning and a 4,000-token completion
cap for the writer and a separate editorial request. The
editor checks natural Dutch, conversational coherence and whether the selected word
fits both the study context and the hidden transfer. Synonym-only echoes are also
blocked before review. A failed check supplies concrete feedback for one rewrite;
at most two drafts are attempted. This adds a model request per valid draft and can
increase loading time. A rejected change preserves the existing reviewed scene.
Either speaker can start and use the target, including a child; the learner does not
need to repeat it. Every turn has an English role label and translation, plus audio.
The sentence cap counts all Dutch sentences, including multiple sentences in one
turn. Study scenes no longer contain a forced learner reference answer or hints.
Scene version 5 regenerates older paired scenes without deleting definitions or
learning progress. Full conversations are carried into practice and restored from
saved sessions; older practice-shaped teaching contexts remain readable.

Practice defaults to Realtime Tutor. A new condition invites the same use without
reciting the lesson. The hidden transfer remains a recall task with a neutral
partner opening and a target-using learner example. Learners try first, optionally say “hint” (three progressive
levels), then request “feedback” or finish the round with the button. The live
partner waits for client-validated hints and feedback instead of inventing them.
Verified feedback affirms a strength, separates goal/target/naturalness, and offers
at most one improvement. “Nog een keer” starts one changed condition; “klaar” skips
or finishes it. Typing remains an optional mode with separate resumable sessions.

The session store preserves spoken transcripts, answers, hint exposure and results.
Only settled speech can be assessed. Interrupted rounds can be resumed after reload;
reconnection requires a user gesture. The existing client, opening protection and
transcript grouping remain in use. Feedback is spoken on the live connection, with
a listen button (existing Worker TTS) when restoring a finished round offline.
Full sessions stay local to this browser/account; learning outcomes use existing
Learning Store/cloud sync. Stable per-round IDs and Web Locks prevent duplicate
learning records and concurrent requests. Guided work and retries remain supported.

Run `npm test`, `npm run eval:words` (default dry run) and `npm run build`. Bundled-app
integration tests use mocked WebRTC/model responses and verify voice help, feedback,
retry, lesson handoff and optional typing. Real-device audio and model linguistic
quality still require manual acceptance; no Worker API/deployment change is needed.
