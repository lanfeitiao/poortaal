# Poortaal Daily Chat MVP

1. Add Daily Chat to the Realtime Tutor area as a voice conversation without a required target word. Use short A2–B1 Dutch replies that follow the learner’s topic, allow pauses, and give wording help when requested.
2. Reuse the WebRTC transport and transcript grouping. On End, pause input and collect the last transcript fragments with a bounded wait. Keep the transcript available if feedback generation fails and allow retry without another call.
3. Analyze the conversation after End using Hoiland's Daily Chat selection rules and `gpt-5.6-terra`. Return zero to eight cards covering requested expressions, partner recasts, translations and useful learner language. Complete fragments from context without inventing facts. Ground quotes in a single turn from the stated speaker, ignoring punctuation and case; deduplicate Dutch sentences. Keep a short English explanation and a new recall situation for Poortaal Review.
4. Let the learner save one card per chat to Review. Store the selected card under the current learner, keep word reviews intact, and prompt recall in a new situation before revealing the Dutch example. Persist saved cards and review scheduling across reloads.
5. Verify transcript grounding, empty and failed feedback, stale async results, save deduplication and Review behavior. Run CI and inspect review feedback on a dedicated PR. Check live audio timing on a real device when available.

## Acceptance checks

- Start a conversation from Practice without choosing a word. Verify that waiting or restarting never leaves the microphone active.
- End after a learner turn and confirm that feedback includes the final usable clause. Retry analysis after a failed request.
- Save an expression, open Review and say a response to the new situation before revealing the example. Confirm the schedule survives reload and is isolated to the learner on this browser.
- Run frontend tests and build in GitHub Actions. Check a real microphone on iPhone (speaker and headphones).
