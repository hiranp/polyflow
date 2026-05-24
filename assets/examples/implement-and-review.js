/**
 * implement-and-review — implement a feature, then loop review-and-fix.
 *
 * Implement once, then review. If the review fails, fix the listed issues and
 * review again — up to 3 rounds. The loop lives in JavaScript, so unlike a
 * hand-orchestrated chat it physically cannot forget to re-review.
 *
 * Workflow({ name: 'implement-and-review', args: 'add rate limiting to the API' })
 */

export const meta = {
  name: 'implement-and-review',
  description: 'Implement a feature, then loop review-and-fix until the review passes',
  phases: [
    { title: 'Implement' },
    { title: 'Review' },
    { title: 'Fix' },
  ],
}

// The reviewer must answer two things: did it pass, and if not, what is wrong.
const REVIEW = {
  type: 'object',
  required: ['passed', 'issues'],
  properties: {
    passed: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
  },
}

// `args` is whatever the caller passed. This workflow expects a plain-text task
// string; a JSON-encoded string is unwrapped, anything else falls back to a default.
const task = (() => {
  if (typeof args !== 'string' || !args.trim()) return 'the feature described in TASK.md'
  try { const v = JSON.parse(args); return typeof v === 'string' ? v : args }
  catch { return args }
})()
const MAX_ROUNDS = 3 // hard cap — every loop in a workflow needs one.

phase('Implement')
await agent(`Implement ${task}. Make the change in the codebase.`, { label: 'implement' })

let review
let round = 0
let passed = false
let issues = []

do {
  round++

  phase('Review')
  review = await agent(
    `Review the current uncommitted changes for: ${task}. List concrete, specific issues.`,
    { label: `review:round-${round}`, schema: REVIEW },
  )

  passed = Boolean(review?.passed)
  issues = Array.isArray(review?.issues) ? review.issues : []

  if (passed) {
    log(`Review passed on round ${round}`)
    break
  }

  log(`Round ${round}: ${issues.length} issue(s) — fixing`)
  phase('Fix')
  await agent(
    `Fix these review issues in the codebase:\n${issues.map(i => `- ${i}`).join('\n')}`,
    { label: `fix:round-${round}` },
  )
} while (round < MAX_ROUNDS)

return {
  passed,
  rounds: round,
  remainingIssues: passed ? [] : issues,
}
