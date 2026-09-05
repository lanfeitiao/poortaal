# Poortaal AI evals

This folder defines what Poortaal considers a good Dutch word explanation.

The production validator answers a structural question: **is this a valid `WordExplanation` object?** These eval cases answer a quality question: **is the explanation linguistically correct, natural and useful to the learner?**

## Current workflow

The dataset lives in `word-explanation-cases.json`. It records reusable facts, case-specific quality criteria, and a shared human scoring rubric rather than one exact expected paragraph.

Run a dry run first:

```bash
npm run eval:words
```

This parses the dataset and prints every case, scoring dimension, and blank scorecard without sending any AI requests.

To generate current Poortaal outputs for manual review:

```bash
npm run eval:words -- --live
```

The live runner calls the same `generateWordExplanation()` use case used by the app, through the existing Poortaal OpenAI client. It prints the generated `WordExplanation` next to that case's reference facts, critical failures, quality criteria, and manual scorecard.

For the two separability cases, the live runner also applies a deliberately narrow deterministic check for explicit high-confidence contradictions such as `bezighouden is an inseparable verb` or `vervangen is a separable verb`. A detected match is a known critical failure. No match is **not** a PASS; it only means that these few known hard-failure patterns were not found, so human review still continues.

By default the live runner uses the production Poortaal Worker endpoint. To evaluate another compatible endpoint, set `POORTAAL_API_BASE` before running it.

## Scoring dimensions

Do not collapse every quality problem into one pass/fail judgment. Score these dimensions separately:

- **Factual correctness (0-1)** — whether important Dutch grammar, meaning, and usage claims are correct. `0` means a material factual error or contradiction; `1` means the important reference facts are correct.
- **Naturalness (0-2)** — whether the Dutch is idiomatic and safe for a learner to reuse. `0` is clearly unidiomatic/misleading, `1` is understandable but awkward, and `2` is natural everyday Dutch.
- **Coverage (0-2)** — whether the answer covers the important meanings, constructions, or contrasts identified by the case. `0` misses a central point, `1` covers the main point but is incomplete, and `2` covers the important usage well.
- **Learner usefulness (0-2)** — whether the explanation, examples, and Tips give practical reusable value rather than merely restating a translation.
- **A2-B1 fit (0-2)** — whether the explanation is clear, concise, and appropriately simple for the intended learner.

The dimension scores are **diagnostic, not an automatic total**. Case-specific critical failures stay separate from the factual score: a critical failure can be factual, but a case may also define another severe failure such as clearly misleading language.

Keep the final human label:

- **FAIL** — factual correctness is `0`, or any case-specific critical failure occurs.
- **NEEDS_REVIEW** — facts are correct and no critical failure occurs, but one or more softer dimensions reveal a meaningful quality problem or incomplete answer.
- **PASS** — facts are correct, no critical failure occurs, and the answer is natural, sufficiently complete, useful, and appropriate for the learner.

Do not invent a total-score threshold yet. A threshold that looks neat after only a few examples is likely to encode accidental assumptions rather than a stable quality standard.

## What to review for each case

For each case in `word-explanation-cases.json`:

1. Generate a normal Poortaal word explanation for the `input`.
2. Compare the output with `reference_facts`.
3. Check for any `critical_failures`, including any known deterministic finding printed by the runner.
4. Review the case-specific `quality_criteria`.
5. Score factual correctness, naturalness, coverage, learner usefulness, and A2-B1 fit.
6. Assign PASS, NEEDS_REVIEW or FAIL and add short notes explaining the important score deductions.

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

A second live run after that change showed that the targeted factual bug was fixed without reversing the `vervangen` rule. Re-reading that same run with the multidimensional rubric gives a more precise diagnosis:

| Case | Fact | Naturalness | Coverage | Usefulness | A2-B1 | Final label | Main reason |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `vervangen` | 1 | 1 | 2 | 2 | 2 | NEEDS_REVIEW | separability is correct, but one example used less idiomatic `vervangen met` instead of the usual `vervangen door` |
| `bezighouden` | 1 | 0 | 2 | 2 | 1 | NEEDS_REVIEW | the factual bug is fixed, but `dat je jezelf met iets bezig bent` is not wording a learner should copy |
| `gezellig` | 1 | 2 | 2 | 2 | 2 | PASS | examples and Tips capture useful social/togetherness meaning; the definition is slightly circular but not materially harmful |
| `afspraak` | 1 | 1 | 1 | 1 | 2 | NEEDS_REVIEW | useful appointment sense, but broader agreement/arrangement coverage is incomplete and some phrasing is less idiomatic than ideal |

This makes the improvement visible without pretending every remaining issue has the same severity:

```text
bezighouden before prompt change
factual correctness = 0
→ FAIL

bezighouden after prompt change
factual correctness = 1
naturalness still weak
→ NEEDS_REVIEW
```

That distinction is the reason to keep scoring dimensions separate.

## Deterministic checks stay narrow

The first automatic checks are intentionally high-precision rather than broad. They recognize a few explicit wrong separability claims in English or Dutch. Tests also cover the important negation case so text such as `bezighouden is not inseparable` is not mistaken for the original failure.

This is not a general Dutch grammar judge. It will miss differently worded mistakes, and it deliberately does not try to score `gezellig` naturalness or `afspraak` coverage. The purpose is to catch a known regression cheaply without creating false confidence about the rest of the answer.

## What comes later

Add deterministic checks only when repeated real failures reveal another crisp pattern that can be recognized with high confidence. Subjective criteria such as naturalness, usefulness and A2-B1 suitability should remain human-reviewed unless there is enough evidence to justify an LLM judge using the same rubric.

Automation should build on the human-readable dataset and scoring contract rather than replacing the definition of quality.
