# Poortaal AI evals

This folder defines what Poortaal considers a good Dutch word explanation.

The production validator answers a structural question: **is this a valid `WordExplanation` object?** These eval cases answer a quality question: **is the explanation linguistically correct, natural and useful to the learner?**

## First-stage workflow

For now, these are human-readable golden cases. There is no automated judge and no extra eval framework.

For each case in `word-explanation-cases.json`:

1. Generate a normal Poortaal word explanation for the `input`.
2. Compare the output with `reference_facts`.
3. Check for any `critical_failures`.
4. Review the softer `quality_criteria`.

### Result labels

- **PASS** — no critical failure, the important reference facts are correct, and the answer is natural and useful.
- **NEEDS_REVIEW** — no clear factual failure, but a subjective quality criterion is debatable or the answer is incomplete.
- **FAIL** — any critical failure occurs, or the answer teaches a materially incorrect Dutch fact.

A critical factual error is a gate: a polished or natural answer cannot compensate for teaching the wrong grammar.

## Why not compare with one exact answer?

LLM output is non-deterministic. Several differently worded answers can all be correct. For example, these statements can express the same useful fact:

- `vervangen is inseparable`
- `vervangen is niet scheidbaar`
- `the prefix ver- does not split off in this verb`

The eval therefore records **facts and criteria**, not one golden paragraph that the model must reproduce word-for-word.

## Initial cases

The first dataset deliberately mixes factual and qualitative risks:

- `vervangen` — catches a high-impact separability/conjugation error.
- `bezighouden` — checks the opposite separability pattern and common reflexive usage.
- `gezellig` — checks context-sensitive meaning and natural explanation quality.
- `afspraak` — checks everyday meaning, collocations and practical usage.

This small set is meant to grow from real failures. When Poortaal produces a clearly bad answer that represents a reusable failure pattern, add a case or criterion rather than adding random vocabulary for coverage.

## What comes later

A later step can add a runner that:

- calls the same word-explanation use case used by the app,
- stores model outputs,
- applies deterministic checks where they are reliable,
- optionally asks an LLM judge to score subjective criteria,
- reports regressions across prompt or model changes.

That automation should build on this dataset rather than replacing the human-readable definition of quality.
