// fan-out.template.js — research/process a known list in parallel, then synthesize.
// Topology: independent units · one pass each · barrier before the synthesis step.
// Replace the TODOs, rename the file to <your-name>.js, drop it in .claude/workflows/.

export const meta = {
  name: 'TODO-fan-out',                          // required — the workflow's name
  description: 'TODO: one line — what this produces', // required — shown in the permission dialog
  whenToUse: 'TODO: when a reader should pick this',  // optional
  phases: [{ title: 'Work' }, { title: 'Synthesize' }],
}

// The unit of work. Pass a real list as the Workflow `args`, or hardcode one.
// `args` is passed through unchanged — an array stays an array; parse only a string.
const input = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { return args } })()
  : args
const items = Array.isArray(input) && input.length ? input : ['TODO item one', 'TODO item two']

// Structured output — the subagent is forced to return an object matching this.
const ITEM_SCHEMA = {
  type: 'object',
  required: ['summary'],
  properties: {
    summary: { type: 'string' },
    points:  { type: 'array', items: { type: 'string' } },
  },
}

// PHASE 1 — one fresh-context subagent per item, all at once. parallel() is a
// barrier: it waits for every thunk. Note the shape — () => agent(...), a thunk.
phase('Work')
log(`Processing ${items.length} item(s)...`)
const results = await parallel(
  items.map((item, i) => () =>
    agent(`TODO: instruction for one item. Item:\n\n${item}`,
          { label: `item-${i + 1}`, schema: ITEM_SCHEMA }))
)

// parallel()/pipeline() leave null in skipped/failed slots — always filter.
const clean = results
  .map((r, i) => (r ? { item: items[i], ...r } : null))
  .filter(Boolean)
log(`${clean.length}/${items.length} returned usable results.`)

// PHASE 2 — one synthesis agent. It is a fresh context: it never saw the workers.
// It learns the results only because we paste them into its prompt.
phase('Synthesize')
const report = await agent(
  'TODO: instruction — combine the results below into one deliverable.\n\n'
  + JSON.stringify(clean, null, 2))

return { count: clean.length, report }
