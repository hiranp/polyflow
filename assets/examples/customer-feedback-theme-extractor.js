/**
 * customer-feedback-theme-extractor — turn a pile of feedback into ranked themes.
 *
 * Loads a batch of customer feedback, summarizes each item in parallel, then
 * clusters the whole set into themes and ranks them. The parallel() call is a
 * genuine barrier: clustering needs every summary at once — you cannot cluster
 * one item on its own — so this is a case where a barrier is the right call.
 *
 * Workflow({ name: 'customer-feedback-theme-extractor',
 *            args: { feedbackFile: 'feedback.csv', reportFile: 'feedback-themes.md' } })
 */

export const meta = {
  name: 'customer-feedback-theme-extractor',
  description: 'Summarize a batch of customer feedback, cluster it into themes, and rank them',
  phases: [
    { title: 'Load feedback' },
    { title: 'Summarize', detail: 'one agent per item', model: 'haiku' },
    { title: 'Cluster and rank' },
  ],
}

const ITEMS = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'text'],
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
        },
      },
    },
  },
}

// `args` is passed through from the Workflow tool unchanged — usually an object,
// a string only if a string was passed. Parse only when it is a string.
const opts = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { return {} } })()
  : (args ?? {})

const feedbackFile = opts.feedbackFile ?? 'feedback.csv'
const reportFile   = opts.reportFile   ?? 'feedback-themes.md'

phase('Load feedback')
const loaded = await agent(
  `Read the customer feedback in ${feedbackFile} and return every item with an id and its text.`,
  { label: 'load-feedback', schema: ITEMS },
)
const items = Array.isArray(loaded?.items) ? loaded.items : []
log(`${items.length} feedback item(s) loaded`)

// Summarize each item independently. Barrier on purpose — the next step
// clusters across the WHOLE set, so it needs all summaries together.
const summaries = await parallel(items.map(it => () =>
  agent(
    `Summarize this customer feedback in one sentence and name the single issue it is about.\n\n` +
    `ID ${it.id}: ${it.text}`,
    { label: `summarize:${it.id}`, phase: 'Summarize', model: 'haiku' },
  ).then(summary => ({ id: it.id, summary })),
))

const labelled = summaries.filter(Boolean)

phase('Cluster and rank')
const report = await agent(
  `Here are ${labelled.length} summarized customer feedback items. Cluster them into themes, ` +
  `rank the themes by how many items fall under each, pick a representative quote per theme, ` +
  `and save the ranked report to ${reportFile}.\n\n` +
  labelled.map(l => `- [${l.id}] ${l.summary}`).join('\n'),
  { label: 'cluster-and-rank', phase: 'Cluster and rank' },
)

return { itemCount: labelled.length, reportFile, report }
