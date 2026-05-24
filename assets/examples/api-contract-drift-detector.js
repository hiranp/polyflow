/**
 * api-contract-drift-detector — check every endpoint against its OpenAPI spec.
 *
 * Reads the spec, then fans out one checker per endpoint: each agent calls the
 * live endpoint and compares the real response shape against what the spec
 * promises. parallel() is a deliberate barrier here — we need every result in
 * hand before deciding whether to open a single consolidated PR.
 *
 * Workflow({ name: 'api-contract-drift-detector',
 *            args: { specFile: 'openapi.yaml', baseUrl: 'http://localhost:3000' } })
 */

export const meta = {
  name: 'api-contract-drift-detector',
  description: 'Check each API endpoint against its OpenAPI spec and open a draft PR for any drift',
  phases: [
    { title: 'List endpoints' },
    { title: 'Check', detail: 'one agent per endpoint', model: 'haiku' },
    { title: 'Open PR' },
  ],
}

const ENDPOINTS = {
  type: 'object',
  required: ['endpoints'],
  properties: {
    endpoints: {
      type: 'array',
      items: {
        type: 'object',
        required: ['method', 'path'],
        properties: {
          method: { type: 'string' },
          path: { type: 'string' },
        },
      },
    },
  },
}

const DRIFT = {
  type: 'object',
  required: ['hasDrift'],
  properties: {
    hasDrift: { type: 'boolean' },
    summary: { type: 'string' },
    specFix: { type: 'string' },
  },
}

// `args` is passed through from the Workflow tool unchanged — usually an object,
// a string only if a string was passed. Parse only when it is a string.
const opts = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { return {} } })()
  : (args ?? {})

const specFile = opts.specFile ?? 'openapi.yaml'
const baseUrl  = opts.baseUrl  ?? 'http://localhost:3000'

phase('List endpoints')
const listed = await agent(
  `Read the OpenAPI spec at ${specFile} and list every endpoint it documents.`,
  { label: 'list-endpoints', schema: ENDPOINTS },
)
const endpoints = Array.isArray(listed?.endpoints) ? listed.endpoints : []
log(`${endpoints.length} endpoint(s) to check`)

// Fan out — one checker per endpoint, all at once. Barrier on purpose:
// the PR stage needs the full set of results before it can run.
const checks = await parallel(endpoints.map(ep => () =>
  agent(
    `Call ${ep.method} ${baseUrl}${ep.path} and compare the live response shape against ` +
    `what ${specFile} documents for it. Report whether the spec has drifted, and if so, ` +
    `give a corrected spec snippet.`,
    { label: `check:${ep.method} ${ep.path}`, phase: 'Check', model: 'haiku', schema: DRIFT },
  ).then(d => ({ ...ep, ...d })),
))

const drifted = checks.filter(Boolean).filter(c => c.hasDrift)
log(`${drifted.length} of ${endpoints.length} endpoint(s) drifted`)

if (drifted.length === 0) {
  return { checked: endpoints.length, drifted: 0, message: 'Spec is in sync' }
}

phase('Open PR')
await agent(
  `Open a draft pull request that updates ${specFile} to fix these drifted endpoints, ` +
  `applying each corrected snippet:\n\n` +
  drifted.map(d => `### ${d.method} ${d.path}\n${d.summary}\n\n${d.specFix ?? ''}`).join('\n\n'),
  { label: 'open-pr', phase: 'Open PR' },
)

return { checked: endpoints.length, drifted: drifted.length, endpoints: drifted }
