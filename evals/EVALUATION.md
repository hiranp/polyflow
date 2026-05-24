# Evaluation Approach (aligned to agentskills.io)

This evaluation loop follows the methodology from:
[Evaluating skill output quality](https://agentskills.io/skill-creation/evaluating-skills)

## Objectives

- Measure quality lift from using this skill.
- Measure cost tradeoff (tokens and time).
- Identify instruction ambiguity and flaky behavior.
- Improve the skill iteratively with evidence.

## Evaluation workflow

- Define test cases in `evals/evals.json`.
- Run each case in two modes: `with_skill` (current skill) and `without_skill` (or prior snapshot).
- Save outputs, timing, and grading per case.
- Aggregate into `benchmark.json`.
- Perform human review and capture `feedback.json`.
- Update skill guidance and rerun next iteration.

Generate scaffold files for an iteration with:

```bash
node scripts/scaffold-evals.mjs --workspace evals/workspace --iteration 1
```

Use `--force` to overwrite existing scaffold JSON files.

## Suggested directory structure

```text
evals/
  evals.json
  files/

<workspace>/iteration-1/
  eval-<id>/
    with_skill/
      outputs/
      timing.json
      grading.json
    without_skill/
      outputs/
      timing.json
      grading.json
  benchmark.json
  feedback.json
```

## Metrics to track

- Quality:
  - Assertion pass rate per case and overall.
  - Blind holistic ranking (optional LLM judge) for usefulness/readability.

- Efficiency:
  - Total tokens.
  - Duration in ms.

- Reliability:
  - Variance across repeated runs.
  - Failure modes by category (instruction miss, schema miss, execution/tool failure).

## Grading rules

- Assertions must have evidence lines.
- No "benefit of the doubt" PASS.
- Prefer script checks for objective assertions (file exists, valid JSON, count checks).
- Keep subjective checks in human review notes.

## Iteration policy

- Start small (2-3 evals).
- Add edge cases after first run.
- Remove assertions that always pass in both modes.
- Rewrite assertions that are unverifiable or brittle.
- Stop when pass-rate gains plateau and human feedback is consistently empty.

## Improvement prompts for next cycle

Use this prompt template when refining the skill:

"Given SKILL.md, eval failures, grading.json evidence, benchmark deltas, and human feedback, propose concise instruction changes that generalize beyond these exact tests, reduce ambiguity, and avoid unnecessary token cost."
