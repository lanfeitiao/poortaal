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
- Continue this review/fix/recheck loop until there is no remaining actionable feedback and required checks pass, or until a comment requires a product decision or clarification from the user.
- Do not silently make product-scope decisions merely to satisfy a reviewer; ask the user when the feedback changes intended behavior or scope.
