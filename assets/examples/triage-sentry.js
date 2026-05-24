/**
 * triage-sentry — fix the Sentry issues that affect the most users.
 *
 * Pull unresolved issues, keep only those over a user-count threshold
 * (default 20), then fix and verify each one. The threshold is a single line
 * of ordinary JavaScript — workflow files run real JS, if-statements and all.
 *
 * Workflow({ name: 'triage-sentry', args: { minUsers: 20 } })
 */

export const meta = {
  name: 'triage-sentry',
  description: 'Pull Sentry issues, fix the ones affecting more than a threshold of users, verify each fix',
  phases: [
    { title: 'Pull issues' },
    { title: 'Fix', detail: 'one agent per issue' },
    { title: 'Verify' },
  ],
}

const ISSUES = {
  type: 'object',
  required: ['issues'],
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'userCount'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          userCount: { type: 'number' },
        },
      },
    },
  },
}

const VERDICT = {
  type: 'object',
  required: ['fixed'],
  properties: {
    fixed: { type: 'boolean' },
    note: { type: 'string' },
  },
}

// `args` is passed through from the Workflow tool unchanged. Invoked with
// `args: { minUsers: 20 }` it is already an object; only parse when it is a
// string, and guard that parse — a slash command can pass non-JSON text.
const opts = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { return {} } })()
  : (args ?? {})

const threshold = opts.minUsers ?? 20

phase('Pull issues')
const pulled = await agent(
  'Use the Sentry MCP to list unresolved issues. For each, return its id, title, and affected user count.',
  { label: 'pull-sentry', schema: ISSUES },
)
const issues = Array.isArray(pulled?.issues) ? pulled.issues : []

// Plain JavaScript — keep only the issues over the threshold.
const bigOnes = issues.filter(i => i.userCount > threshold)
log(`${bigOnes.length} of ${issues.length} issue(s) affect more than ${threshold} users`)

if (bigOnes.length === 0) {
  return { fixed: 0, message: `No issues affect more than ${threshold} users` }
}

const results = await pipeline(
  bigOnes,
  // Stage 1 — fix the issue in the codebase.
  issue => agent(
    `Investigate and fix this Sentry issue in the codebase.\n` +
    `ID: ${issue.id}\nTitle: ${issue.title}\nAffected users: ${issue.userCount}`,
    { label: `fix:${issue.id}`, phase: 'Fix' },
  ),
  // Stage 2 — verify the fix.
  (_fix, issue) => agent(
    `Verify the fix for the Sentry issue "${issue.title}" is correct and complete. ` +
    `Run any relevant tests.`,
    { label: `verify:${issue.id}`, phase: 'Verify', schema: VERDICT },
  ).then(v => ({ issue: issue.id, ...v })),
)

const fixed = results.filter(Boolean).filter(r => r.fixed)
return { candidates: bigOnes.length, fixed: fixed.length, results: results.filter(Boolean) }
