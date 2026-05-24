# Workflow Patterns

Copy-paste orchestration shapes. Each says when to use it, then gives runnable
code. Match the pattern to the Step 2 answers in `SKILL.md`: known list vs
unknown count, one pass vs staged, barrier needed or not.

JSON Schemas are shown abbreviated as `SCHEMA`; define real ones — see the bottom
of this file.

---

## 1. Fan-out then synthesize

**When:** a known list of independent questions/items, one pass each, and you
need one combined answer at the end. The synthesis genuinely needs every result,
so the barrier (`parallel`) is correct here.

```js
export const meta = {
  name: 'research-fanout',
  description: 'Research independent questions in parallel, synthesize one report',
  phases: [{ title: 'Research' }, { title: 'Synthesize' }],
}

// `args` is passed through as-is — an array stays an array; parse only a string.
const input = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { return args } })()
  : args
const questions = Array.isArray(input) && input.length ? input : ['demo question']

phase('Research')
const findings = await parallel(
  questions.map((q, i) => () =>
    agent(`Research and report verified facts:\n\n${q}`,
          { label: `q${i + 1}`, schema: RESEARCH_SCHEMA }))
)
const clean = findings
  .map((f, i) => (f ? { question: questions[i], ...f } : null))
  .filter(Boolean)

phase('Synthesize')
const report = await agent(
  'Combine the research below into one cohesive briefing; call out disagreements.\n\n'
  + JSON.stringify(clean))

return { questionCount: clean.length, report }
```

---

## 2. Pipeline: review then verify (the default multi-stage shape)

**When:** items flow through ordered stages and each item should advance the
moment *it* is ready — no waiting for the slowest sibling. This is the default;
prefer it over two `parallel()` calls with a barrier between them.

```js
export const meta = {
  name: 'review-and-verify',
  description: 'Review each dimension, verify each finding as soon as its review lands',
  phases: [{ title: 'Review' }, { title: 'Verify' }],
}

const DIMENSIONS = [
  { key: 'bugs', prompt: 'Find logic bugs in the changed files.' },
  { key: 'perf', prompt: 'Find performance regressions in the changed files.' },
]

const results = await pipeline(
  DIMENSIONS,
  d => agent(d.prompt, { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }),
  review => parallel((review?.findings ?? []).map(f => () =>
    agent(`Adversarially verify: ${f.title}`,
          { label: `verify:${f.file}`, phase: 'Verify', schema: VERDICT_SCHEMA })
      .then(v => ({ ...f, verdict: v }))))
)

return { confirmed: results.flat().filter(Boolean).filter(f => f.verdict?.isReal) }
```

Dimension `bugs` verifies its findings while `perf` is still being reviewed.

---

## 3. Barrier when you must dedup first

**When:** the next stage needs the *entire* previous result set in hand — to
dedup, merge, or early-exit on a count. This is the legitimate use of `parallel`
as a barrier.

```js
const all = await parallel(
  DIMENSIONS.map(d => () => agent(d.prompt, { schema: FINDINGS_SCHEMA })))

const deduped = dedupeByFileAndLine(
  all.filter(Boolean).flatMap(r => r.findings))   // genuinely needs ALL at once

if (deduped.length === 0) return { confirmed: [], note: 'nothing to verify' }

const verified = await parallel(
  deduped.map(f => () => agent(verifyPrompt(f), { schema: VERDICT_SCHEMA })))
return { confirmed: verified.filter(Boolean).filter(v => v.isReal) }
```

---

## 4. Loop until a target count

**When:** discovery with a fixed goal — "find 10 bugs". A plain counter is fine.

```js
const bugs = []
while (bugs.length < 10) {
  const r = await agent('Find bugs not already listed below.\n\n'
    + JSON.stringify(bugs.map(b => b.title)), { schema: BUGS_SCHEMA })
  bugs.push(...r.bugs)
  log(`${bugs.length}/10 found`)
}
return { bugs: bugs.slice(0, 10) }
```

---

## 5. Loop until the budget runs low

**When:** you want depth to scale to the user's token target. The
`budget.total &&` guard is essential — without a target, `remaining()` is
`Infinity` and the loop runs to the 1000-agent cap.

```js
const issues = []
while (budget.total && budget.remaining() > 50_000) {
  const r = await agent('Find one more issue in this codebase.', { schema: ISSUE_SCHEMA })
  issues.push(...r.issues)
  log(`${issues.length} found · ${Math.round(budget.remaining() / 1000)}k tokens left`)
}
return { issues }
```

---

## 6. Adversarial verification (skeptic vote)

**When:** a finding will be acted on and a plausible-but-wrong one is costly.
Spawn N independent skeptics, each told to *refute*; keep the finding only on a
majority. Stops confident hallucinations from surviving.

```js
async function survives(claim) {
  const votes = await parallel(Array.from({ length: 3 }, (_, i) => () =>
    agent(`Try hard to REFUTE this claim. Default to refuted=true if uncertain.\n\n${claim}`,
          { label: `skeptic:${i + 1}`, schema: VERDICT_SCHEMA })))
  return votes.filter(Boolean).filter(v => !v.refuted).length >= 2
}

const real = []
for (const f of candidateFindings) {
  if (await survives(f.title)) real.push(f)
}
return { real }
```

---

## 7. Judge panel (N attempts, score, synthesize)

**When:** the solution space is wide and one-attempt-iterated is weak. Generate
independent attempts from different angles, score them with parallel judges,
synthesize from the winner while grafting the runners-up's best ideas.

```js
const ANGLES = ['MVP-first', 'risk-first', 'user-first', 'cost-first']

// `args` is passed through as-is; parse only when it is a string.
const idea = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { return args } })()
  : args

phase('Draft')
const drafts = await parallel(ANGLES.map(a => () =>
  agent(`Produce a plan for: ${idea}. Take a strictly ${a} approach.`, { label: a })))

phase('Judge')
const scored = await parallel(drafts.filter(Boolean).map((d, i) => () =>
  agent(`Score this plan 1-10 for feasibility and impact. Return {score, why}.\n\n${d}`,
        { label: `judge:${i + 1}`, schema: SCORE_SCHEMA }).then(s => ({ draft: d, ...s }))))

const ranked = scored.filter(Boolean).sort((a, b) => b.score - a.score)

phase('Synthesize')
const final = await agent(
  'Write the definitive plan. Base it on the WINNER, grafting the best ideas '
  + 'from the runners-up.\n\nWINNER:\n' + ranked[0].draft
  + '\n\nRUNNERS-UP:\n' + ranked.slice(1).map(r => r.draft).join('\n---\n'))
return { final }
```

---

## 8. Loop until dry (unknown-size discovery)

**When:** you do not know how much there is to find. Keep spawning finders until
K consecutive rounds turn up nothing new. Catches the long tail a fixed counter
misses.

```js
const seen = new Set()
const found = []
let dryRounds = 0

while (dryRounds < 2 && found.length < 100) {
  const r = await agent('Find issues NOT in this list:\n' + [...seen].join('\n'),
                        { schema: ISSUE_SCHEMA })
  const fresh = (r.issues ?? []).filter(x => !seen.has(x.id))
  fresh.forEach(x => { seen.add(x.id); found.push(x) })
  dryRounds = fresh.length === 0 ? dryRounds + 1 : 0
  log(`+${fresh.length} new · ${found.length} total · dry streak ${dryRounds}`)
}
return { found }
```

---

## 9. Nested workflow

**When:** a big workflow has a self-contained sub-job that is itself a workflow.
`workflow()` runs it inline and returns its result. Nesting is one level deep —
a workflow called this way cannot itself call `workflow()`.

```js
phase('Gather')
const research = await workflow('research-fanout', ['question one', 'question two'])

phase('Write')
const article = await agent('Write an article from this research:\n'
  + JSON.stringify(research))
return { article }
```

---

## 10. Summarize-compress between heavy stages

**When:** stage 1 produces long per-item text that stage 2 only needs a digest of.
Insert a cheap Haiku compressor stage — it costs a fraction of a full model call
and keeps the synthesis prompt lean regardless of how many items were analyzed.

```js
export const meta = {
  name: 'analyze-compressed-report',
  description: 'Deep-analyze items, compress results with Haiku, synthesize once',
  phases: [
    { title: 'Analyze' },
    { title: 'Compress', model: 'haiku' },
    { title: 'Synthesize' },
  ],
}

// `args` is passed through as-is; parse only when it is a string.
const input = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { return args } })()
  : args
const items = Array.isArray(input) ? input : [input].filter(Boolean)

const summaries = await pipeline(
  items,
  // Stage 1: deep analysis — long free-text per item (expensive, inherited model)
  (item, _, i) => agent(
    `Analyze this item thoroughly:\n\n${JSON.stringify(item)}`,
    { label: `analyze:${i}`, phase: 'Analyze' },
  ),
  // Stage 2: compress to 3 sentences (cheap Haiku) — keeps synthesis prompt lean
  (analysis, item, i) => agent(
    `Compress to 3 sentences, keeping only the most critical findings:\n\n${analysis}`,
    { label: `compress:${i}`, phase: 'Compress', model: 'haiku' },
  ),
)

phase('Synthesize')
const report = await agent(
  'Write a concise executive report from these compressed summaries:\n\n'
  + summaries.filter(Boolean).join('\n\n---\n\n'),
)
return { report }
```

---

## 11. Sliding window in discovery loops

**When:** a discovery loop accumulates a `seen` set over many rounds. Sending the
full history each round inflates input tokens O(n) — for 10 rounds of 20 items
each, the last round sends 190 items of context. A sliding window of K IDs
prevents unbounded growth without breaking deduplication (K recent IDs is enough
for the agent to avoid re-finds).

```js
export const meta = {
  name: 'discover-sliding',
  description: 'Discover items across many rounds with bounded per-round context',
  phases: [{ title: 'Discover' }],
}

const ITEM = {
  type: 'object',
  required: ['items'],
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title'],
        additionalProperties: false,
        properties: {
          id:    { type: 'string' },
          title: { type: 'string' },
        },
      },
    },
  },
}

const WINDOW = 30     // IDs sent per round — enough to avoid re-finds
const MAX_ROUNDS = 8
const DRY_STREAK = 2
const seen = new Set()
const found = []
let dry = 0, round = 0

while (dry < DRY_STREAK && round < MAX_ROUNDS
       && (!budget.total || budget.remaining() > 40_000)) {
  round++
  // Sliding window: only the most recent WINDOW IDs, not the full history
  const hint = [...seen].slice(-WINDOW).join('\n')
  const r = await agent(
    `Round ${round}. Find items NOT already in this list:\n\n${hint}`,
    { label: `discover:r${round}`, phase: 'Discover', schema: ITEM },
  )
  const fresh = (r?.items ?? []).filter(x => x?.id && !seen.has(x.id))
  fresh.forEach(x => { seen.add(x.id); found.push(x) })
  dry = fresh.length === 0 ? dry + 1 : 0
  log(`Round ${round}: +${fresh.length} new · ${found.length} total · dry ${dry}/${DRY_STREAK}`)
}

return { found, rounds: round }
```

---

## 12. Two-tier model fan-out (Haiku extract → Sonnet synthesize)

**When:** many items need mechanical extraction or classification (cheap, parallel)
followed by one high-quality synthesis (expensive). Route the fan-out to
`model: 'haiku'` — ~10× cheaper for work that is essentially mechanical. Project
the extracted fields before passing to synthesis; never send the full items.

```js
export const meta = {
  name: 'tiered-fanout',
  description: 'Extract key points from many items with Haiku, synthesize with capable model',
  phases: [
    { title: 'Extract', model: 'haiku' },
    { title: 'Synthesize' },
  ],
}

const EXTRACT = {
  type: 'object',
  required: ['key_points'],
  additionalProperties: false,
  properties: {
    key_points: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string' },
    },
  },
}

// `args` is passed through as-is; parse only when it is a string.
const input = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { return args } })()
  : args
const items = Array.isArray(input) ? input : [input].filter(Boolean)

phase('Extract')
const extractions = await parallel(
  items.map((item, i) => () =>
    agent(
      `Extract the 3–5 most important points from:\n\n${JSON.stringify(item)}`,
      { label: `extract:${i}`, phase: 'Extract', model: 'haiku', schema: EXTRACT },
    ).then(r => r?.key_points ?? []),
  ),
)

// Project before passing: send only the extracted points, not the full items
const points = extractions.filter(Boolean).filter(a => a.length > 0)

phase('Synthesize')
const synthesis = await agent(
  'Synthesize these extracted points into one coherent analysis:\n\n'
  + points.map((pts, i) => `[${i + 1}] ${pts.join('; ')}`).join('\n'),
)
return { synthesis, sourcesCount: points.length }
```

---

## Defining schemas

A schema is a plain JSON Schema object. Keep them small and `required`-tight so
the subagent returns exactly what you need.

```js
const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'file'],
        properties: {
          title: { type: 'string' },
          file:  { type: 'string' },
          line:  { type: 'number' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['isReal'],
  properties: {
    isReal:   { type: 'boolean' },
    refuted:  { type: 'boolean' },
    reason:   { type: 'string' },
  },
}
```

Define schemas in the body (after `meta`), as `const`s — never inside `meta`.

### Reduce output tokens with `additionalProperties: false` and `maxItems`

`additionalProperties: false` stops the model from emitting verbose extra fields
or explanation keys you did not declare. `maxItems: N` caps array length when the
count is bounded. Both reduce output tokens and make downstream JavaScript safer:

```js
const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        required: ['title', 'file'],
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          file:  { type: 'string' },
          line:  { type: 'number' },
        },
      },
    },
  },
}
```

### Project before you pass between stages

A schema captures more fields than the next stage always needs. Strip to the
minimum before stringifying — the subagent only sees what you inject into its
prompt, so leaner payloads mean lower input token cost:

```js
// ❌ sends all schema fields including ones the verifier ignores
agent('Verify these:\n' + JSON.stringify(reviews, null, 2))

// ✅ project to what verify actually reads, compact form
const slim = reviews.map(({ title, file }) => ({ title, file }))
agent('Verify these:\n' + JSON.stringify(slim))
```

Use `JSON.stringify(data)` (compact) for inter-stage payloads. The 2-space indent
in `JSON.stringify(data, null, 2)` inflates large arrays by 20–40% for no benefit
to the subagent — reserve it for the final human-facing return value only.
