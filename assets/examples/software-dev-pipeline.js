/**
 * software-dev-pipeline — spec intake, recall, plan, execute, verify, persist.
 *
 * This example shows a full development workflow that uses the scoped memory
 * contract end to end:
 * - normalize a pre-approved workflow spec
 * - recall prior run summaries from .planning/memory/index.jsonl
 * - plan and execute file-scoped tasks
 * - verify the result and adversarially re-check failures
 * - optionally persist a compact memory entry for the next run
 *
 * Example:
 * Workflow({
 *   name: 'software-dev-pipeline',
 *   args: {
 *     specPath: 'WORKFLOW-SPEC.md',
 *     runDate: '2026-05-29T18:45:00Z',
 *     runId: 'wf_demo_001',
 *     entryId: '2026-05-29-demo-001',
 *     persistSummary: true,
 *   },
 * })
 */

export const meta = {
  name: 'software-dev-pipeline',
  description: 'Consume an approved spec, recall prior context, plan, execute, verify, and persist a compact memory entry',
  whenToUse: 'For complex, resumable implementation work that benefits from explicit planning and memory across runs',
  phases: [
    { title: 'Spec Intake' },
    { title: 'Recall', model: 'haiku' },
    { title: 'Plan' },
    { title: 'Execute', detail: 'one pipeline item per task' },
    { title: 'Verify', detail: 're-check failures adversarially', model: 'haiku' },
    { title: 'Persist' },
  ],
}

const SPEC = {
  type: 'object',
  required: ['approved', 'title', 'topic', 'acceptanceCriteria', 'constraints', 'outOfScope', 'verificationPlan'],
  additionalProperties: false,
  properties: {
    approved: { type: 'boolean' },
    title: { type: 'string' },
    topic: { type: 'string' },
    acceptanceCriteria: {
      type: 'array',
      items: { type: 'string' },
    },
    constraints: {
      type: 'array',
      items: { type: 'string' },
    },
    outOfScope: {
      type: 'array',
      items: { type: 'string' },
    },
    verificationPlan: { type: 'string' },
    approvalNote: { type: 'string' },
  },
}

const RECALL = {
  type: 'object',
  required: ['summaries'],
  additionalProperties: false,
  properties: {
    summaries: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        required: ['date', 'summary'],
        additionalProperties: false,
        properties: {
          date: { type: 'string' },
          summary: { type: 'string' },
        },
      },
    },
  },
}

const PLAN = {
  type: 'object',
  required: ['tasks'],
  additionalProperties: false,
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'file', 'instruction', 'sharedFileRisk'],
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          file: { type: 'string' },
          instruction: { type: 'string' },
          sharedFileRisk: { type: 'boolean' },
        },
      },
    },
  },
}

const EXECUTION = {
  type: 'object',
  required: ['completed', 'summary', 'touchedFiles'],
  additionalProperties: false,
  properties: {
    completed: { type: 'boolean' },
    summary: { type: 'string' },
    touchedFiles: {
      type: 'array',
      items: { type: 'string' },
    },
  },
}

const VERIFY = {
  type: 'object',
  required: ['allPassed', 'errors', 'summary'],
  additionalProperties: false,
  properties: {
    allPassed: { type: 'boolean' },
    summary: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'file'],
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
        },
      },
    },
  },
}

const FAILURE_VERDICT = {
  type: 'object',
  required: ['isReal'],
  additionalProperties: false,
  properties: {
    isReal: { type: 'boolean' },
    note: { type: 'string' },
  },
}

const input = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { return { specText: args } } })()
  : (args ?? {})

const specPath = input.specPath ?? 'WORKFLOW-SPEC.md'
const memoryStorePath = input.memoryStorePath ?? '.planning/memory/index.jsonl'
const memorySchemaPath = input.memorySchemaPath ?? 'assets/templates/memory-entry.schema.json'
const runDate = input.runDate
const runId = input.runId
const entryId = input.entryId ?? `${specPath}-latest`
const persistSummary = input.persistSummary !== false

async function persistArtifact(path, body, label) {
  return agent(
    `Write the following content to ${path}. Overwrite the file if it exists.\n\n${body}`,
    { label },
  )
}

phase('Spec Intake')
const spec = await agent(
  (typeof input.specText === 'string' && input.specText.trim()
    ? `Normalize this pre-approved workflow spec and determine whether it is sufficiently complete to execute.\n\n${input.specText}`
    : `Read ${specPath}, normalize the workflow spec, and determine whether it is sufficiently complete to execute.`)
  + `\n\nReturn whether the spec is approved, its title, topic, acceptance criteria, constraints, out of scope items, and verification plan.`,
  { label: 'spec-intake', phase: 'Spec Intake', schema: SPEC },
)

await persistArtifact('.planning/spec.normalized.json', JSON.stringify(spec), 'save-spec')

if (!spec?.approved || !spec.title || (spec.acceptanceCriteria ?? []).length === 0) {
  return {
    status: 'needs-approved-spec',
    message: spec?.approvalNote ?? 'Workflow spec is missing or incomplete',
  }
}

phase('Recall')
const recall = await agent(
  `Read ${memoryStorePath} and use ${memorySchemaPath} as the entry schema.\n\n`
  + `Find up to 3 prior summaries relevant to: ${spec.topic || spec.title}. Return the date and summary only.`,
  { label: 'recall', phase: 'Recall', model: 'haiku', schema: RECALL },
)

await persistArtifact('.planning/memory/recall.json', JSON.stringify(recall), 'save-recall')

const priorContext = recall?.summaries?.length
  ? '\n\nRelevant prior findings:\n' + recall.summaries.map(s => `[${s.date}] ${s.summary}`).join('\n')
  : ''

phase('Plan')
const plan = await agent(
  `Create a task plan from this spec.\n\n`
  + `Title: ${spec.title}\n`
  + `Topic: ${spec.topic}\n`
  + `Acceptance criteria: ${JSON.stringify(spec.acceptanceCriteria)}\n`
  + `Constraints: ${JSON.stringify(spec.constraints)}\n`
  + `Out of scope: ${JSON.stringify(spec.outOfScope)}\n`
  + `Verification: ${spec.verificationPlan}`
  + priorContext
  + `\n\nReturn file-scoped tasks with an id, target file, implementation instruction, and whether parallel edits would risk shared-file collisions.`,
  { label: 'plan', phase: 'Plan', schema: PLAN },
)

const tasks = plan?.tasks ?? []
await persistArtifact('.planning/PLAN.md', JSON.stringify(tasks), 'save-plan')

if (tasks.length === 0) {
  return {
    status: 'empty',
    message: 'No tasks generated from the approved spec',
  }
}

let stopForBudget = false

phase('Execute')
const executionResults = await pipeline(
  tasks,
  task => {
    if (stopForBudget) return null
    if (budget.total && budget.remaining() < 40_000) {
      stopForBudget = true
      log(`Stopping before task ${task.id} because the budget is too low to continue safely`)
      return null
    }

    const opts = { label: `execute:${task.id}`, phase: 'Execute', schema: EXECUTION }
    if (task.sharedFileRisk) opts.isolation = 'worktree'

    return agent(
      `Implement task ${task.id} in ${task.file}.\n\nInstruction: ${task.instruction}`,
      opts,
    ).then(result => ({ task, result }))
  },
  bundle => {
    if (!bundle?.result) return null
    return persistArtifact(
      `.planning/task-${bundle.task.id}.md`,
      JSON.stringify(bundle),
      `checkpoint:${bundle.task.id}`,
    ).then(() => bundle)
  },
)

const completed = executionResults.filter(Boolean)
const touchedFiles = [...new Set(completed.flatMap(item => item.result.touchedFiles ?? []))]

phase('Verify')
const verification = await agent(
  `Verify the implementation against this plan and spec.\n\n`
  + `Title: ${spec.title}\n`
  + `Verification plan: ${spec.verificationPlan}\n`
  + `Completed tasks: ${JSON.stringify(completed.map(item => ({ id: item.task.id, summary: item.result.summary })))}\n`
  + `Touched files: ${JSON.stringify(touchedFiles)}`,
  { label: 'verify', phase: 'Verify', schema: VERIFY },
)

const failureChecks = await parallel(
  (verification?.errors ?? []).map(error => () =>
    agent(
      `Adversarially verify this reported failure. Default to isReal=false if the evidence is weak.\n\n`
      + `Failure: ${error.title}\nFile: ${error.file}`,
      { label: `failure-check:${error.file}`, phase: 'Verify', model: 'haiku', schema: FAILURE_VERDICT },
    ).then(verdict => ({ ...error, verdict }))
  ),
)

const confirmedFailures = failureChecks.filter(Boolean).filter(item => item.verdict?.isReal)
await persistArtifact(
  '.planning/VERIFICATION_REPORT.md',
  JSON.stringify({ verification, confirmedFailures }),
  'save-verification',
)

phase('Persist')
if (persistSummary) {
  await agent(
    `Append one JSON line to ${memoryStorePath}. The line must match ${memorySchemaPath}.\n\n`
    + JSON.stringify({
      schemaVersion: '1.0',
      entryId,
      workflowName: 'software-dev-pipeline',
      runId,
      runDate,
      topic: spec.topic || spec.title,
      summary: verification?.summary ?? 'No verification summary generated',
      status: verification?.allPassed && confirmedFailures.length === 0 ? 'success' : 'partial',
      sourceSpecPath: specPath,
      artifactPaths: ['.planning/spec.normalized.json', '.planning/PLAN.md', '.planning/VERIFICATION_REPORT.md'],
      relatedFiles: touchedFiles,
      tags: ['software-dev-pipeline', spec.topic || spec.title],
      verification: {
        passed: Boolean(verification?.allPassed && confirmedFailures.length === 0),
        method: spec.verificationPlan,
        note: confirmedFailures.length
          ? `${confirmedFailures.length} verified failure(s) remain`
          : 'Verification passed',
      },
    }),
    { label: 'persist-memory', phase: 'Persist' },
  )
}

return {
  status: verification?.allPassed && confirmedFailures.length === 0 ? 'success' : 'partial',
  specTitle: spec.title,
  recalled: recall?.summaries?.length ?? 0,
  tasksPlanned: tasks.length,
  tasksCompleted: completed.length,
  confirmedFailures,
  summary: verification?.summary ?? 'No summary generated',
}
