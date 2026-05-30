#!/usr/bin/env node

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'

function ensureWithinProject(projectRoot, candidatePath) {
  const root = path.resolve(projectRoot)
  const absolute = path.resolve(candidatePath)
  const relative = path.relative(root, absolute)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes project root: ${absolute}`)
  }
  return absolute
}

function sanitizeFilePart(value) {
  const sanitized = String(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  return (sanitized || 'unnamed').slice(0, 120)
}

function stableHash(value) {
  const input = String(value)
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

async function readJSON(filePath) {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

async function writeJSON(projectRoot, filePath, payload) {
  const outPath = ensureWithinProject(projectRoot, filePath)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function validateRuntimeContract(spec) {
  const contract = spec?.runtimeContract
  if (!contract) throw new Error('portable spec is missing runtimeContract')
  if (contract.stateScope !== 'project-only') throw new Error('runtimeContract.stateScope must be "project-only"')
  if (contract.sharedState !== 'forbidden') throw new Error('runtimeContract.sharedState must be "forbidden"')
  if (contract?.persistence?.mode !== 'file-backed') throw new Error('runtimeContract.persistence.mode must be "file-backed"')
  if (!contract?.determinism?.resumeFromArtifactsOnly) throw new Error('runtimeContract.determinism.resumeFromArtifactsOnly must be true')
  return contract
}

export async function runPortableReviewAndVerify({
  projectRoot,
  specPath = path.join(projectRoot, 'examples/cross-platform/portable-skill-spec.json'),
  adapter,
  target = 'branch_or_diff',
  runId = 'run-default',
}) {
  if (!adapter || typeof adapter.review !== 'function' || typeof adapter.verify !== 'function') {
    throw new Error('adapter must implement async review() and verify() methods')
  }

  const resolvedRoot = path.resolve(projectRoot)
  const spec = await readJSON(specPath)
  const contract = validateRuntimeContract(spec)

  const artifactsRoot = ensureWithinProject(
    resolvedRoot,
    path.join(resolvedRoot, contract.persistence.baseDir, sanitizeFilePart(runId)),
  )
  const finalPath = path.join(artifactsRoot, 'final.json')

  if (await exists(finalPath)) {
    return {
      mode: 'resume',
      artifactDir: artifactsRoot,
      result: await readJSON(finalPath),
    }
  }

  const dimensions = Array.isArray(spec?.inputs?.dimensions) ? spec.inputs.dimensions : []
  const allFindings = []
  const verified = []

  for (const dimension of dimensions) {
    const review = await adapter.review({ target, dimension, projectRoot: resolvedRoot, artifactsDir: artifactsRoot })
    const findings = Array.isArray(review?.findings) ? review.findings : []
    await writeJSON(resolvedRoot, path.join(artifactsRoot, `review-${sanitizeFilePart(dimension)}.json`), {
      dimension,
      findings,
    })
    allFindings.push(...findings.map(f => ({ ...f, dimension })))
  }

  for (const finding of allFindings) {
    const findingFile = finding?.file ?? 'unknown-file'
    const findingTitle = finding?.title ?? 'unknown-title'
    const findingDimension = finding?.dimension ?? 'unknown-dimension'
    const findingId = sanitizeFilePart(`${findingDimension}-${stableHash(`${findingFile}:${findingTitle}:${JSON.stringify(finding)}`)}`)
    const verdict = await adapter.verify({ finding, projectRoot: resolvedRoot, artifactsDir: artifactsRoot })
    const record = { finding, verdict: verdict ?? null }
    verified.push(record)
    await writeJSON(resolvedRoot, path.join(artifactsRoot, 'verify', `${findingId}.json`), record)
  }

  const confirmed = verified.filter(item => item.verdict?.isReal).map(item => ({
    ...item.finding,
    reason: item.verdict.reason ?? '',
  }))

  const result = {
    target,
    totals: {
      findings: allFindings.length,
      confirmed: confirmed.length,
    },
    confirmed,
    replay: {
      deterministic: true,
      source: 'file-backed-artifacts',
    },
  }

  await writeJSON(resolvedRoot, finalPath, result)
  return {
    mode: 'fresh',
    artifactDir: artifactsRoot,
    result,
  }
}
