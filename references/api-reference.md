# The Workflow Tool — Complete Reference

The missing manual for Claude Code's `Workflow` tool. Read this top to bottom the
first time; after that, jump to the section you need.

## Contents

1. [What a workflow is](#1-what-a-workflow-is)
2. [Enabling the tool](#2-enabling-the-tool)
3. [The Workflow tool's input](#3-the-workflow-tools-input)
4. [File anatomy](#4-file-anatomy)
5. [The script API](#5-the-script-api) · [`args` — normalizing input](#args--normalizing-input)
6. [`agent()` in full](#6-agent-in-full) · [Setting the model](#setting-the-model) · [Structured output with `schema`](#structured-output-with-schema) · [Custom agent types](#custom-agent-types)
7. [`pipeline()` vs `parallel()`](#7-pipeline-vs-parallel)
8. [`budget` and token-aware loops](#8-budget-and-token-aware-loops)
9. [`workflow()` — nesting](#9-workflow--nesting)
10. [Caps, limits, and what happens at each](#10-caps-limits-and-what-happens-at-each)
11. [The determinism sandbox](#11-the-determinism-sandbox)
12. [Execution, the journal, and resume](#12-execution-the-journal-and-resume)

---

## 1. What a workflow is

A workflow is a **JavaScript program that orchestrates subagents**. You write one
file; the `Workflow` tool runs it in a sandbox.

The word that matters is **deterministic**. In a normal Claude session, *Claude*
decides the next step — it reads a result, thinks, picks a tool. That control
flow is model-driven and varies run to run. A workflow inverts it: the loops, the
conditionals, the fan-out, the retries are **plain JavaScript**. The model only
does the **leaf work** inside each `agent()` call. The orchestration itself spends
zero tokens and behaves identically every run.

The one-sentence model:

> Claude writes a JS script once → the script runs in a sandbox → every `agent()`
> call spawns a fresh subagent with its own clean context window → the script
> collects the results with ordinary JavaScript → the return value comes back to
> Claude as the tool result.

**Why fresh context windows are the point.** A single Claude session has one
context window. Run a big multi-step job inside it and that window fills with
every file and every intermediate thought until you hit the ceiling. A workflow
makes that fight disappear: each `agent()` call gets a brand-new, empty context,
does its one job, returns only its result, and its context is discarded. The
orchestrator never sees the scratch work. So the main conversation barely grows,
agents cannot contaminate each other, and the job can touch far more material
than any one window could hold.

---

## 2. Enabling the tool

The Workflow tool is **off by default**, gated behind an environment variable.

```bash
# per session
export CLAUDE_CODE_WORKFLOWS=1
claude
```

```jsonc
// or persistently — .claude/settings.local.json
{ "env": { "CLAUDE_CODE_WORKFLOWS": "1" } }
```

With the variable unset, the tool never appears and `/workflows` does nothing.
Enabling the tool also lights up the `/workflows` slash command — a live tree of
phases and agents you can watch, and where you can skip or retry a running agent.

---

## 3. The Workflow tool's input

When Claude calls `Workflow`, it provides one of these. You must supply at least
one of `script`, `name`, or `scriptPath`.

| Field | Type | Meaning |
|---|---|---|
| `script` | string | A self-contained workflow script. Must begin with `export const meta = {…}`. |
| `name` | string | Name of a predefined workflow — built-in, or a file in `.claude/workflows/`. |
| `scriptPath` | string | Path to a workflow file on disk. **Takes precedence over `script` and `name`.** |
| `args` | any | Optional input exposed to the script as the global `args`. The tool's input schema types this field as `unknown`, so it reaches the script **exactly as passed** — an object stays an object, a string stays a string. See the `args` global below. |
| `resumeFromRunId` | string | A prior run ID (`wf_…`) to resume from. Same session only. |

**The persist-and-edit loop.** Every invocation writes the script to a file in
the session directory and returns that path. The intended iteration loop is: run
once → edit the saved file with Write/Edit → re-invoke with `{ scriptPath }`. You
never re-send the full script text after the first run.

---

## 4. File anatomy

Two parts, in this order. The parser is strict about both.

### Part 1 — `meta` (mandatory, first statement, pure literal)

The very first statement must be `export const meta = {…}`, and the object must
be a **pure literal**: no variables, no function calls, no spreads, no template
interpolation. The parser walks the syntax tree and rejects anything else.
Reserved keys (`__proto__`, `constructor`, `prototype`) are also rejected.

```js
export const meta = {
  name: 'find-flaky-tests',            // required — non-empty string
  description: 'Find flaky tests and propose fixes', // required — shown in the permission dialog
  whenToUse: 'CI is intermittently red',  // optional — shown in the workflow list
  phases: [                            // optional — one entry per phase() call
    { title: 'Scan',  detail: 'grep test logs for retries' },
    { title: 'Fix',   detail: 'one agent per flaky test', model: 'haiku' },
  ],
}
```

| `meta` field | Required | Notes |
|---|---|---|
| `name` | yes | Non-empty string. This — not the filename — is the workflow's name. |
| `description` | yes | One line. The text the user sees in the permission dialog. |
| `whenToUse` | no | String. Shown when the workflow is listed. |
| `phases` | no | Array of `{ title, detail?, model? }`. `title` is matched **exactly** against `phase()` calls. `model` here is **display-only** — see the note below. |

> **`phases[].model` is a label, not a setting.** The binary stores it and shows
> it in the permission dialog, but **no code reads it to choose a model**. The
> model is set *only* by the `model` option on each `agent()` call. If a phase
> runs on Haiku, put `model: 'haiku'` both on the `phases[]` entry (so the dialog
> is honest) **and** on every `agent()` call in that phase (so it actually
> happens). The entry alone does nothing.

### Part 2 — the body

Everything after `meta` is the body. It runs inside an `async` function, so you
can `await` at the top level. The orchestration globals are injected — you import
nothing. The body's `return` value becomes the tool result.

Standard JS built-ins (`JSON`, `Math`, `Array`, `Map`, `Set`, …) are available.
See [section 11](#11-the-determinism-sandbox) for what is removed.

---

## 5. The script API

| Global | Signature | Purpose |
|---|---|---|
| `agent` | `agent(prompt, opts?) → Promise<string\|object>` | Spawn one fresh-context subagent. |
| `pipeline` | `pipeline(items, ...stages) → Promise<any[]>` | Stream items through stages, no barrier. |
| `parallel` | `parallel(thunks) → Promise<any[]>` | Run thunks concurrently. A barrier. |
| `phase` | `phase(title) → void` | Start a progress group; later agents join it. |
| `log` | `log(message) → void` | Emit a narrator line above the progress tree. |
| `console` | `console.log(…)`, `.error(…)`, … | A console whose output is routed straight into the workflow log. |
| `setTimeout` / `clearTimeout` | the standard timer pair | Injected, and abort-aware — pending timers are cleared if the workflow is aborted. There is **no** `sleep`; do not busy-wait. Rarely needed in practice. |
| `budget` | `{ total, spent(), remaining() }` | The turn's token target. |
| `args` | any | Whatever was passed as the tool's `args` input, **passed through unchanged** (`undefined` if none). Usually a parsed object/array/value; a string only if a string was passed. Normalize before use — see below. |
| `workflow` | `workflow(nameOrRef, args?) → Promise<any>` | Run another workflow inline. |

> **Undocumented but real.** `console`, `setTimeout`/`clearTimeout`, and the
> `stallMs` option in section 6 exist and work in the runtime but are absent from
> the Workflow tool's own input-schema description — confirmed in the binary. Use
> them; just know they are not officially documented.

### `args` — normalizing input

The Workflow tool's input schema types `args` as `unknown`, so the runtime puts
**whatever was passed straight into the script** — it never stringifies it. What
you get depends on the caller:

- `Workflow({ args: { minUsers: 5 } })` → the script's `args` is the **object**
  `{ minUsers: 5 }`. Read `args.minUsers` directly.
- A slash command or a hand-call may pass a raw **string** (`"build a todo app"`).
- A nested `workflow(name, x)` call delivers `x` to the child unchanged.
- Nothing passed → `args` is `undefined`.

So a script that takes input should **normalize once at the top** — parse only
when it is actually a string:

```js
// Object passes straight through; a JSON string parses; plain text and
// `undefined` fall through unchanged.
const input = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { return args } })()
  : args
const threshold = input?.minUsers ?? 20
```

Do **not** call `JSON.parse(args)` unconditionally — if `args` is already an
object that throws (or worse, silently mangles it).

---

## 6. `agent()` in full

```js
const text = await agent('Summarize the README.')                 // → string
const data = await agent('List the deps.', { schema: DEPS_SCHEMA }) // → validated object
```

**Return value.** Without `schema`, `agent()` returns the subagent's final text
verbatim, as a string. With `schema` (a JSON Schema object), the subagent is
*forced* to return a validated object matching it — no parsing needed; validation
happens at the tool layer and the model retries on a mismatch. If the user skips
the agent from `/workflows`, `agent()` returns `null` — which is why you
`.filter(Boolean)` results.

**Options:**

| Option | Type | Effect |
|---|---|---|
| `label` | string | Display name for this agent in `/workflows`. Defaults to the first 60 chars of the prompt. Not part of the resume cache key — relabelling never invalidates a cached call. |
| `phase` | string | Assign this agent to a named progress group. Use inside `pipeline`/`parallel` stages so concurrent calls land in the right group instead of racing on the global `phase()`. Not part of the cache key. |
| `schema` | object | A JSON Schema. Forces structured output — `agent()` returns the validated object. See **Structured output** below. |
| `model` | string | Per-agent model. `'haiku'`, `'sonnet'`, `'opus'`, `'inherit'`, or a full model ID. Omit to inherit the session model. See **Setting the model** below. |
| `isolation` | `'worktree'` | Run the agent in a fresh git worktree. Expensive (~200–500 ms + disk each). Use **only** when parallel agents mutate files and would otherwise collide; the worktree is auto-removed if unchanged. `'worktree'` is the only accepted value — `'remote'` exists in the binary but is disabled in this build. |
| `agentType` | string | Run as a registered subagent type instead of the default workflow subagent. See **Custom agent types** below. |
| `stallMs` | number | Override this agent's stall timeout (default **180000 ms / 3 min**). Raise it for a legitimately slow agent so it is not aborted as "stalled". Real but undocumented. |

`schema`, `model`, `isolation`, and `agentType` are the four options baked into
the resume cache key — change any of them and that `agent()` call re-runs.
`label` and `phase` are cosmetic and never invalidate a cached result.

### Setting the model

Each `agent()` call runs on its own model. The `model` string is resolved by
Claude Code's normal alias resolver:

| You pass | Resolves to |
|---|---|
| `'haiku'` | the current default Haiku |
| `'sonnet'` | the current default Sonnet |
| `'opus'` | the current default Opus |
| `'inherit'` | the session's main-loop model (same as omitting `model`) |
| a full model ID (e.g. `'claude-haiku-4-5'`) | passed through unchanged |
| *omitted* | the session's main-loop model |

**There is no validation.** An unrecognised string (a typo like `'hauku'`) is
**not** rejected at parse time — the resolver passes it through verbatim and the
agent fails later when the API call is made. Spell the alias exactly.

Guidance: omit `model` for judgement-heavy work so it inherits the capable
session model; drop **cheap, high-volume, mechanical** leaf work (one-line
classification, refute-this checks, per-item summaries) to `'haiku'`. A
verification or fan-out stage is the usual `'haiku'` candidate.

Two things that are **not** how you set a model:

- `meta.phases[].model` — display-only (see section 4). It does not set anything.
- The `CLAUDE_CODE_SUBAGENT_MODEL` env var — if set, it overrides *every*
  per-call `model` for the whole session. It is a user/CI knob, not something a
  script controls; just know a workflow's `model` opts are silently ignored when
  it is set.

### Structured output with `schema`

By default `agent()` returns the subagent's final text as a **string**. Pass a
`schema` (a plain JSON Schema object) and you instead get a **validated object**
back — ready for the next line of JavaScript, no `JSON.parse`.

How it works in the binary: the runtime compiles your schema with **AJV**,
synthesises a hidden `StructuredOutput` tool whose input *is* that schema, and
tells the subagent it must call that tool exactly once. The call is
AJV-validated; on a mismatch the agent is handed the validation error and tries
again. If the subagent finishes without ever calling it, the runtime nudges it
up to twice more before failing. The value `agent()` returns is the validated
tool input.

```js
const DEPS = {
  type: 'object',
  required: ['deps'],
  properties: { deps: { type: 'array', items: { type: 'string' } } },
}
const { deps } = await agent('List the npm dependencies.', { schema: DEPS })
```

Rules of thumb for "computing data properly":

- **Use `schema` for anything a later line reads a field off of.** Free text is
  fine only when the result is just passed whole into another agent's prompt.
- **Keep schemas small and `required`-tight.** The schema is a contract — every
  `required` field is one the subagent is forced to produce. Define schemas as
  `const`s in the body (never inside `meta`).
- **To hand data from one stage to the next**, stringify it into the next
  prompt: `agent('Cluster these:\n' + JSON.stringify(items))`. The orchestrator
  has no shared memory the subagent can see — only the prompt text.
- **A skipped or failed agent returns `null`** even with a `schema`. Always
  `.filter(Boolean)` before reading fields off `parallel()`/`pipeline()` results.

### Custom agent types

`agentType` runs the call as a registered subagent type instead of the default
workflow subagent. Valid values are any agent in the live registry — the
built-ins `'workflow-subagent'` and `'workflow-remote-agent'`, plus anything
from `.claude/agents/` or a plugin (e.g. `'Explore'`). An unknown `agentType`
**throws** with the list of available agents (unlike `model`, it *is*
validated). It composes with `schema` — the `StructuredOutput` tool is added on
top of the custom agent's own tools.

**Subagents return raw data, not chat.** A workflow subagent is told its final
text *is* the return value — so prompt it for the data you want, not for a
human-facing message. For structured results, always prefer `schema` over asking
for JSON in prose.

---

## 7. `pipeline()` vs `parallel()`

### `pipeline(items, stage1, stage2, …)`

Runs each item through **all** stages independently. **There is no barrier
between stages** — item A can be in stage 3 while item B is still in stage 1.
This is the **default** for multi-stage work: wall-clock equals the slowest
single item's whole chain, not the sum of the slowest stage at each step.

Every stage callback receives `(prevResult, originalItem, index)` — use
`originalItem`/`index` in later stages to label work without threading context
through earlier return values. A stage that throws drops that item to `null` and
skips its remaining stages.

```js
const out = await pipeline(
  files,
  (file)            => agent(`Review ${file}`, { schema: REVIEW }),
  (review, file, i) => agent(`Verify review of ${file}`, { label: `verify:${i}` }),
)
```

### `parallel(thunks)`

Runs an array of **functions** concurrently and **waits for all of them** — it is
a barrier. Note the shape: an array of thunks, `[() => agent(…), () => agent(…)]`,
**not** an array of promises. A thunk that throws resolves to `null` in the
result array; the call itself never rejects, so `.filter(Boolean)` before use.

```js
const results = await parallel(
  questions.map(q => () => agent(`Research: ${q}`, { schema: RESEARCH }))
)
```

### The rule

**Default to `pipeline()`.** Reach for `parallel()` as a barrier only when a
stage genuinely needs the *entire* previous result set at once:

- dedup or merge across the full set before expensive downstream work,
- an early-exit on a total count ("0 findings → skip verification"),
- a stage whose prompt compares one item against all the others.

Not justified by "I need to flatten/filter first" (do that inside a pipeline
stage) or "it is cleaner" (a pipeline models separate stages fine). A barrier
wastes the idle time of every fast item while it waits for the slowest.

---

## 8. `budget` and token-aware loops

`budget` reflects a token target the user can set with a `"+500k"`-style
directive in their message.

| Member | Meaning |
|---|---|
| `budget.total` | The target, or `null` if none was set. |
| `budget.spent()` | Output tokens spent this turn — across the main loop **and all workflows**. The pool is shared, not per-workflow. |
| `budget.remaining()` | `max(0, total − spent())`, or `Infinity` if no target. |

The target is a **hard ceiling**. Once `spent()` reaches `total`, further
`agent()` calls throw. Guard budget loops on `budget.total` — with no target,
`remaining()` is `Infinity` and the loop runs to the agent cap:

```js
const found = []
while (budget.total && budget.remaining() > 50_000) {
  const r = await agent('Find one more issue.', { schema: ISSUE })
  found.push(...r.issues)
}
```

---

## 9. `workflow()` — nesting

`workflow(nameOrRef, args?)` runs another workflow inline as a sub-step and
returns whatever it returns. Pass a name for a saved workflow, or
`{ scriptPath }` for a file. The child shares this run's concurrency cap, agent
counter, abort signal, and token budget; its agents appear under a nested group
in `/workflows`.

**Nesting is one level only** — calling `workflow()` inside a child throws.
`workflow()` throws on an unknown name, an unreadable path, or a child syntax
error — catch it if you want to degrade gracefully.

---

## 10. Caps, limits, and what happens at each

| Limit | Value | Behaviour when hit |
|---|---|---|
| Lifetime `agent()` calls per run | **1000** | Throws `WorkflowAgentCapError`. A runaway-loop backstop, set far above any real workflow — add a counter or budget guard to your loops. |
| Concurrent agents | **min(16, max(2, cores − 2))** | Not an error — excess `agent()` calls **queue** and run as slots free. You can pass 100 items to `parallel()`; ~10 run at once on a typical machine, all 100 finish. The `max(2, …)` floor guarantees at least 2 even on a tiny machine. |
| Script size | **524288 bytes (512 KB)** | The script is rejected before parsing. |
| Token budget | user-set | Throws `WorkflowBudgetExceededError` once `spent()` reaches `total`. In-flight agents finish and their results are kept; no *new* agents start. |
| Per-agent stall | **180000 ms** (3 min); per-agent override via `stallMs` | An agent with no progress for this long is aborted and retried — up to **5×** — then abandoned (its `agent()` call resolves, so the workflow continues). |
| VM synchronous timeout | **30000 ms** | Bounds *synchronous* execution only — it catches an infinite sync loop. The body is `async`, so a real workflow still runs for many minutes; this is not a wall-clock cap. |

You set the script size and the loop caps directly, and the per-agent stall
window via `stallMs`. The rest is automatic — a wedged agent will not hang the
whole workflow forever.

---

## 11. The determinism sandbox

The script runs in a hardened sandbox — not a normal Node process. Two
consequences:

**Non-reproducible calls are banned.** These would make a resume produce
different results, so they **throw**:

| Banned | Use instead |
|---|---|
| `Math.random()` | Vary the agent prompt/label by loop index. |
| `Date.now()` | Pass timestamps in via `args`; stamp results after the workflow returns. |
| argless `new Date()` / `Date()` | `new Date(specificValue)` still works — only "what time is it now" is blocked. |

**No host access.** The orchestrator has **no filesystem and no Node.js APIs** —
no `require`, `fs`, `process`, network. Standard JS built-ins are available. Any
file or shell work belongs **inside an `agent()`**: the subagent has the normal
Read/Write/Bash tools; the orchestrator does not.

This is not a restriction to fight — it is the contract that makes resume work.
The orchestrator's job is pure control flow over `agent()` calls.

---

## 12. Execution, the journal, and resume

A workflow does **not** block the conversation:

1. Claude calls `Workflow`. The script is parsed, checked, and persisted to a
   file in the session directory.
2. It launches as a background task. The tool returns immediately with a run ID
   (`wf_…`) and the script path.
3. The body runs; progress events stream to `/workflows`.
4. On completion a `<task-notification>` is delivered into the conversation with
   a summary, the agent count, and the run ID.

**The journal.** While it runs, the workflow records every `agent()` call —
keyed by a hash of its `(prompt, opts)` — together with the result. Subagent
transcripts are written as `agent-<id>.jsonl` files in the run's transcript
directory.

**Resume.** Because the orchestrator is deterministic, re-running the same script
produces the same sequence of `agent()` calls with the same keys. Relaunch with
`Workflow({ scriptPath, resumeFromRunId })` and:

- a call whose key matches a completed journal entry returns the **cached result
  instantly** — no model call;
- the first new or changed call, and everything after it, runs live.

So **same script + same args = a 100% cache hit**, and an edited script replays
every unchanged call before it from cache. This is what makes a workflow file
genuinely editable mid-flight, and what lets a crashed run resume from where it
died. Resume works **only within the session that created the run**; if the prior
run is still going, stop it first.

For portable adapters outside Claude runtime internals, mirror this behavior with
project-local, file-backed artifacts only (for example `./.polyflow/runs/<run-id>`).
Do not rely on global/shared singleton state when implementing plugin runtimes.
Replay and resume should be computed from persisted artifacts plus deterministic
inputs only.
