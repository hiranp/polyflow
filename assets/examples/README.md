# Example workflows

Seven complete, runnable workflow scripts. Each is a real, lint-clean file — find
the closest match to what you are building, read it, then adapt it. All seven pass
`scripts/validate-workflow.mjs`.

| File | Topology | Demonstrates |
| --- | --- | --- |
| `review-branch.js` | pipeline + nested `parallel` | structured `schema` on every stage, a Haiku verify stage, `phase` set inside stages |
| `implement-and-review.js` | `do/while` loop | a round cap, a `schema` with a `passed` boolean that drives the loop, `args` used as a plain task string |
| `triage-sentry.js` | list → pipeline | `args` normalization, a `.filter()` + early `return`, an MCP tool call inside an agent |
| `dead-code-sweep.js` | loop-until-dry | a dry-streak counter, a hard `MAX_ROUNDS` cap, parallel removal that self-reverts |
| `api-contract-drift-detector.js` | fan-out with a barrier | a deliberate `parallel()` barrier, `args` with defaults, `model: 'haiku'` on the fan-out |
| `customer-feedback-theme-extractor.js` | parallel → barrier | a barrier because clustering needs the whole set, a Haiku summarize stage |
| `software-dev-pipeline.js` | spec-intake → recall → pipeline → verify → persist | pre-approved spec intake, scoped memory recall/persist, plan/execution checkpoints, selective worktree isolation |

## What to copy from them

**Setting a model.** `review-branch.js`, `api-contract-drift-detector.js`, and
`customer-feedback-theme-extractor.js` push cheap, mechanical leaf work to
`model: 'haiku'`. They also put `model` on the matching `meta.phases[]` entry —
that entry is only a *label* for the permission dialog; the `model` on the
`agent()` call is what actually runs. Set it in both places, or the dialog lies.

**Structured output (`schema`).** Every example that later reads a field off a
result defines a JSON Schema `const` and passes it as `schema` — so `agent()`
returns a parsed object and the next line is plain JavaScript (`review.passed`,
`issues.filter(...)`). Schemas are kept small and `required`-tight.

**`args` normalization.** `triage-sentry.js`, `api-contract-drift-detector.js`,
and `customer-feedback-theme-extractor.js` show the parse-only-if-string idiom
for object input. `implement-and-review.js` shows the plain-text-task variant.

**A hard stop on every loop.** `implement-and-review.js` (`MAX_ROUNDS`) and
`dead-code-sweep.js` (`DRY_STREAK` + `MAX_ROUNDS`) — open-ended loops always need
a counter or a budget guard.

**`pipeline` vs `parallel`.** `review-branch.js` and `triage-sentry.js` use
`pipeline` (no barrier — each item advances on its own).
`api-contract-drift-detector.js` and `customer-feedback-theme-extractor.js` use
`parallel` as a *deliberate* barrier — and each says in a comment why the whole
result set is genuinely needed at once.

**Scoped memory across runs.** `software-dev-pipeline.js` shows the file-backed
memory contract: read from `.planning/memory/index.jsonl` before the main work,
then optionally append one compact memory entry after verification. The artifact
shape is anchored by `assets/templates/memory-entry.schema.json`.

## Running one

```js
Workflow({ scriptPath: '<skill-dir>/assets/examples/review-branch.js' })
```

Or copy the file into `.claude/workflows/` and invoke it by its `meta.name`:

```js
Workflow({ name: 'review-branch' })
```

Examples that take input are invoked with `args` — see the header comment in
each file for the exact shape, e.g.:

```js
Workflow({ name: 'triage-sentry', args: { minUsers: 20 } })
```
