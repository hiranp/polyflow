#!/usr/bin/env node
// validate-runtime-plugin.mjs — smoke-tests for runtime-file-backed-plugin.mjs
//
// Verifies:
//   1. Contract validation rejects bad specs (missing runtimeContract, wrong stateScope, etc.)
//   2. Adapter validation rejects incomplete adapters
//   3. Fresh run writes artifacts strictly under project root
//   4. Resume returns cached result without invoking adapter
//   5. RunId with traversal characters is sanitized before path construction

import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runPortableReviewAndVerify } from '../examples/cross-platform/runtime-file-backed-plugin.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let passed = 0
let failed = 0

function ok(label) {
  console.log(`  PASS  ${label}`)
  passed++
}

function fail(label, err) {
  console.error(`  FAIL  ${label}: ${err?.message ?? String(err)}`)
  failed++
}

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'polyflow-rt-'))
  try {
    await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function writeSpec(dir, spec) {
  const specPath = path.join(dir, 'spec.json')
  await writeFile(specPath, JSON.stringify(spec, null, 2), 'utf8')
  return specPath
}

const VALID_SPEC = {
  name: 'test-skill',
  version: '0.0.1',
  runtimeContract: {
    stateScope: 'project-only',
    sharedState: 'forbidden',
    persistence: { mode: 'file-backed', baseDir: '.polyflow/runs', artifactFormat: 'json' },
    determinism: { resumeFromArtifactsOnly: true, forbidTimeBasedBranching: true, forbidRandomBranching: true },
  },
  inputs: { target: 'test', dimensions: ['bugs', 'security'] },
}

const GOOD_ADAPTER = {
  review: async ({ dimension }) => ({
    findings: [{ title: `${dimension} finding`, file: 'src/test.js', severity: 'low' }],
  }),
  verify: async ({ finding }) => ({ isReal: true, reason: `Verified: ${finding.title}` }),
}

// Test 1: Missing runtimeContract is rejected
await withTempDir(async (dir) => {
  const label = 'contract-validation: missing runtimeContract'
  try {
    const specPath = await writeSpec(dir, { name: 'no-contract' })
    await runPortableReviewAndVerify({ projectRoot: dir, specPath, adapter: GOOD_ADAPTER })
    fail(label, new Error('Expected error — did not throw'))
  } catch (err) {
    if (err.message.includes('runtimeContract')) ok(label)
    else fail(label, err)
  }
})

// Test 2: Wrong stateScope is rejected
await withTempDir(async (dir) => {
  const label = 'contract-validation: wrong stateScope'
  try {
    const bad = { ...VALID_SPEC, runtimeContract: { ...VALID_SPEC.runtimeContract, stateScope: 'global' } }
    const specPath = await writeSpec(dir, bad)
    await runPortableReviewAndVerify({ projectRoot: dir, specPath, adapter: GOOD_ADAPTER })
    fail(label, new Error('Expected error — did not throw'))
  } catch (err) {
    if (err.message.includes('stateScope')) ok(label)
    else fail(label, err)
  }
})

// Test 3: sharedState not "forbidden" is rejected
await withTempDir(async (dir) => {
  const label = 'contract-validation: sharedState not forbidden'
  try {
    const bad = { ...VALID_SPEC, runtimeContract: { ...VALID_SPEC.runtimeContract, sharedState: 'allowed' } }
    const specPath = await writeSpec(dir, bad)
    await runPortableReviewAndVerify({ projectRoot: dir, specPath, adapter: GOOD_ADAPTER })
    fail(label, new Error('Expected error — did not throw'))
  } catch (err) {
    if (err.message.includes('sharedState')) ok(label)
    else fail(label, err)
  }
})

// Test 4: persistence.mode not "file-backed" is rejected
await withTempDir(async (dir) => {
  const label = 'contract-validation: persistence.mode not file-backed'
  try {
    const bad = {
      ...VALID_SPEC,
      runtimeContract: {
        ...VALID_SPEC.runtimeContract,
        persistence: { ...VALID_SPEC.runtimeContract.persistence, mode: 'memory' },
      },
    }
    const specPath = await writeSpec(dir, bad)
    await runPortableReviewAndVerify({ projectRoot: dir, specPath, adapter: GOOD_ADAPTER })
    fail(label, new Error('Expected error — did not throw'))
  } catch (err) {
    if (err.message.includes('persistence.mode')) ok(label)
    else fail(label, err)
  }
})

// Test 5: Incomplete adapter (missing verify) is rejected
await withTempDir(async (dir) => {
  const label = 'adapter-validation: missing verify()'
  try {
    const specPath = await writeSpec(dir, VALID_SPEC)
    await runPortableReviewAndVerify({
      projectRoot: dir,
      specPath,
      adapter: { review: async () => ({ findings: [] }) },
    })
    fail(label, new Error('Expected error — did not throw'))
  } catch (err) {
    if (err.message.includes('adapter must implement')) ok(label)
    else fail(label, err)
  }
})

// Test 6: Fresh run writes artifacts strictly under project root
await withTempDir(async (dir) => {
  const label = 'path-isolation: fresh-run artifacts are under project root'
  try {
    const specPath = await writeSpec(dir, VALID_SPEC)
    const { mode, artifactDir, result } = await runPortableReviewAndVerify({
      projectRoot: dir,
      specPath,
      adapter: GOOD_ADAPTER,
      runId: 'test-fresh',
    })
    if (mode !== 'fresh') return fail(label, new Error(`Expected mode=fresh, got ${mode}`))
    const resolvedRoot = path.resolve(dir)
    if (!artifactDir.startsWith(resolvedRoot)) {
      return fail(label, new Error(`artifactDir ${artifactDir} is outside project root ${resolvedRoot}`))
    }
    const finalPath = path.join(artifactDir, 'final.json')
    const final = JSON.parse(await readFile(finalPath, 'utf8'))
    if (final.replay?.deterministic !== true) {
      return fail(label, new Error('final.json missing replay.deterministic=true'))
    }
    if (final.replay?.source !== 'file-backed-artifacts') {
      return fail(label, new Error('final.json missing replay.source="file-backed-artifacts"'))
    }
    ok(label)
  } catch (err) {
    fail(label, err)
  }
})

// Test 7: Resume reads cached final.json without invoking adapter
await withTempDir(async (dir) => {
  const label = 'resume: returns cached result without adapter calls'
  try {
    const specPath = await writeSpec(dir, VALID_SPEC)
    const common = { projectRoot: dir, specPath, adapter: GOOD_ADAPTER, runId: 'test-resume' }

    const first = await runPortableReviewAndVerify(common)
    if (first.mode !== 'fresh') return fail(label, new Error('First run should be fresh'))

    let adapterCalled = false
    const trackingAdapter = {
      review: async (...a) => { adapterCalled = true; return GOOD_ADAPTER.review(...a) },
      verify: async (...a) => { adapterCalled = true; return GOOD_ADAPTER.verify(...a) },
    }
    const second = await runPortableReviewAndVerify({ ...common, adapter: trackingAdapter })
    if (second.mode !== 'resume') return fail(label, new Error(`Expected mode=resume, got ${second.mode}`))
    if (adapterCalled) return fail(label, new Error('Adapter was called on resume — must read from cache only'))
    ok(label)
  } catch (err) {
    fail(label, err)
  }
})

// Test 8: RunId with traversal characters is sanitized (artifacts stay within project root)
await withTempDir(async (dir) => {
  const label = 'path-isolation: traversal chars in runId are sanitized'
  try {
    const specPath = await writeSpec(dir, VALID_SPEC)
    const { artifactDir } = await runPortableReviewAndVerify({
      projectRoot: dir,
      specPath,
      adapter: GOOD_ADAPTER,
      runId: '../../etc/passwd',
    })
    const resolvedRoot = path.resolve(dir)
    if (!artifactDir.startsWith(resolvedRoot)) {
      fail(label, new Error(`artifactDir ${artifactDir} escapes project root after sanitization`))
    } else {
      ok(label)
    }
  } catch (err) {
    if (err.message.includes('Path escapes project root')) ok(label)
    else fail(label, err)
  }
})

console.log(`\nruntime-plugin validation: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
