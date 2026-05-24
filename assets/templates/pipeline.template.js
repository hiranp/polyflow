// pipeline.template.js — run each item through ordered stages, no barrier between.
// Topology: each item advances the moment IT is ready. The default multi-stage shape.
// Replace the TODOs, rename the file to <your-name>.js, drop it in .claude/workflows/.

export const meta = {
  name: 'TODO-pipeline',
  description: 'TODO: one line — what this produces',
  phases: [{ title: 'Stage1' }, { title: 'Stage2' }],
}

// `args` is passed through unchanged — an array stays an array; parse only a string.
const input = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { return args } })()
  : args
const items = Array.isArray(input) && input.length ? input : ['TODO item one', 'TODO item two']

const STAGE1_SCHEMA = {
  type: 'object',
  required: ['result'],
  properties: { result: { type: 'string' } },
}

// pipeline(items, stage1, stage2, ...) — each stage callback gets
// (prevResult, originalItem, index). There is NO barrier between stages:
// item A can be in Stage2 while item B is still in Stage1.
const out = await pipeline(
  items,

  // Stage 1 — runs once per item.
  (item, _orig, i) =>
    agent(`TODO: first-stage instruction. Item:\n\n${item}`,
          { label: `s1:${i + 1}`, phase: 'Stage1', schema: STAGE1_SCHEMA }),

  // Stage 2 — receives Stage 1's result for the same item.
  (prev, item, i) =>
    agent(`TODO: second-stage instruction.\nItem: ${item}\nStage 1 said: ${prev?.result}`,
          { label: `s2:${i + 1}`, phase: 'Stage2' }),
)

// A stage that throws drops that item to null — filter before using.
return { done: out.filter(Boolean) }
