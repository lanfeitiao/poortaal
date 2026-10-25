# Contextual learning and structured spoken practice

Explore teaches the selected word sense through one coherent everyday situation,
2–4 conversational expressions, a short dialogue and an optional reminder. Verified
Word Usage is retained; ordinary expressions are not labelled as collocations.
Legacy definitions, examples, Review data and usage evidence remain valid.

Lessons are validated and cached with their sense and use, and join existing word
cloud sync. Failed generation shows a retry without fabricating a lesson. Recently
viewed examples are remembered per owner/use for 30 minutes; direct lesson handoff
also carries the studied scene and its assistance provenance into the session.

Practice defaults to Realtime Tutor. A new condition invites the same use without
reciting the lesson. Learners try first, optionally say “hint” (three progressive
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
