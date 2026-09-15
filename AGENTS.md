# Repository workflow instructions

These instructions apply to AI-assisted changes in this repository.

## Commits

- Keep every commit small and reviewable.
- A single commit must change no more than 100 lines in total (additions + deletions).
- If a change would exceed 100 changed lines, split it into multiple coherent commits before pushing.
- Do not combine unrelated fixes or refactors in one commit.

## Pull requests and review feedback

- After opening or updating a pull request, proactively check its review comments and CI/check status; do not wait for the user to ask.
- Address actionable review feedback on the PR branch when it is safe and clearly within the requested scope.
- Treat correctness, security, race-condition, test, and CI feedback as high priority.
- After pushing review fixes, check the PR again for new review feedback and the latest CI status.
- Inspect all unresolved review threads, including comments GitHub marks as outdated. Do not treat an outdated or hidden comment as resolved.
- After verifying that a review comment has actually been addressed, explicitly resolve its review thread.
- Continue the review/fix/recheck/resolve loop until there are no unresolved actionable threads and required checks pass, or until a comment requires a product decision or clarification from the user.
- Do not silently make product-scope decisions merely to satisfy a reviewer; ask the user when the feedback changes intended behavior or scope.
