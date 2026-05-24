// Adapter sketch: Portable spec -> Claude Workflow runtime
// This is intentionally minimal and shows mapping strategy, not production code.

export const meta = {
  name: 'portable-review-and-verify-claude',
  description: 'Claude adapter example for a portable review-and-verify workflow',
  phases: [{ title: 'Review' }, { title: 'Verify', model: 'haiku' }],
}

const target = (typeof args === 'string' && args.trim()) ? args : 'current branch vs main'
const dims = ['bugs', 'security', 'tests']

const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'file', 'severity'],
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          severity: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT = {
  type: 'object',
  required: ['isReal'],
  properties: {
    isReal: { type: 'boolean' },
    reason: { type: 'string' },
  },
}

const out = await pipeline(
  dims,
  d => agent(`Review ${target} for ${d}. Return findings.`, {
    label: `review:${d}`,
    phase: 'Review',
    schema: FINDINGS,
  }),
  (review, d) => parallel((review?.findings ?? []).map(f => () =>
    agent(`Adversarially verify finding: ${f.title} in ${f.file}`, {
      label: `verify:${d}:${f.file}`,
      phase: 'Verify',
      model: 'haiku',
      schema: VERDICT,
    }).then(v => ({ ...f, dimension: d, verdict: v })),
  )),
)

const confirmed = out.flat().filter(Boolean).filter(x => x.verdict?.isReal)
return { confirmedCount: confirmed.length, confirmed }
