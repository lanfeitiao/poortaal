# Poortaal AI evals

This folder defines what Poortaal considers a good Dutch word explanation.

The production validator answers a structural question: **is this a valid `WordExplanation` object?** These eval cases answer a quality question: **is the explanation linguistically correct, natural and useful to the learner?**

## Current workflow

The first dataset lives in `word-explanation-cases.json`. It records reusable facts and quality criteria rather than one exact expected paragraph.

Run a dry run first:

```bash
npm run eval:words
```

This parses the dataset and prints every case and rubric without sending any AI requests.

To generate current Poortaal outputs for manual review:

```bash
npm run eval:words -- --live
```

The live runner calls the same `generateWordExplanation()` use case used by the app, through the existing Poortaal OpenAI client. It prints the generated `WordExplanation` next to that case's reference facts, critical failures and quality criteria.

By default the live runner uses the production Poortaal Worker endpoint. To evaluate another compatible endpoint, set `POORTAAL_API_BASE` before running it.

The runner deliberately **does not score the output automatically yet**. A human reviews each generated answer and labels it:

- **PASS** — no critical failure, the important reference facts are correct, and the answer is natural and useful.
- **NEEDS_REVIEW** — no clear factual failure, but a subjective quality criterion is debatable or the answer is incomplete.
- **FAIL** — any critical failure occurs, or the answer teaches a materially incorrect Dutch fact.

A critical factual error is a gate: a polished or natural answer cannot compensate for teaching the wrong grammar.

## What to review for each case

For each case in `word-explanation-cases.json`:

1. Generate a normal Poortaal word explanation for the `input`.
2. Compare the output with `reference_facts`.
3. Check for any `critical_failures`.
4. Review the softer `quality_criteria`.
5. Assign PASS, NEEDS_REVIEW or FAIL.

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

## First feedback loop

The first live baseline immediately caught a real quality failure:

- `vervangen` — PASS; the output correctly described the verb as inseparable.
- `bezighouden` — FAIL; the examples correctly used `houd ... bezig`, but the Tips field incorrectly claimed that `bezighouden` is inseparable.
- `gezellig` — PASS with minor wording quality issues.
- `afspraak` — NEEDS_REVIEW because the appointment sense was useful but the broader agreement/arrangement sense was incomplete and one playdate example was awkward.

That failure led to a production prompt change. The separability guidance now says to inspect actual conjugation, stress and morphological structure rather than inferring the rule from the first letters of a verb. It explicitly contrasts `vervangen` (inseparable `ver-`) with `bezighouden` (separable particle `bezig`).

A second live run after that change showed that the targeted factual bug was fixed without reversing the `vervangen` rule:

- `vervangen` — NEEDS_REVIEW overall: the Tips field still correctly says the verb is inseparable, but one generated example (`vervang ik de speeltijd met ...`) is less idiomatic than the usual `vervangen door` construction.
- `bezighouden` — NEEDS_REVIEW overall: the Tips field is now factually correct and gives `ik houd me bezig` / `ik heb me beziggehouden`, but the Dutch definition (`dat je jezelf met iets bezig bent`) is awkward compared with `dat je je met iets bezighoudt`.
- `gezellig` — PASS / minor wording review: the examples are natural and the Tips field captures the broader social/togetherness meaning, although the Dutch definition is somewhat circular.
- `afspraak` — NEEDS_REVIEW: the output remains broadly useful but still leans toward the appointment/meeting sense and some phrasing is less idiomatic than ideal.

So the target regression moved from a hard factual FAIL to softer wording/naturalness issues. This is the intended feedback loop:

```text
baseline eval
→ observe a real quality failure
→ change prompt/model/context
→ rerun the same cases
→ confirm the target factual failure improved
→ inspect any remaining softer quality issues
```

## What comes later

Do not automate every criterion just because it can be encoded. First collect a few real failures and see which checks are stable.

Good candidates for later automation are crisp factual failures where a deterministic check can be made robustly. Subjective criteria such as naturalness, usefulness and A2-B1 suitability may remain human-reviewed or later use an LLM judge with a clear rubric.

Automation should build on the human-readable dataset and rubric rather than replacing the definition of quality.
