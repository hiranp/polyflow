#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

function usage() {
  console.log('Usage: node scripts/scaffold-evals.mjs --workspace <dir> [--evals <path>] [--iteration <n>] [--force]')
  console.log('Defaults: --evals evals/evals.json --iteration 1')
}

function parseArgs(argv) {
  const out = {
    evalsPath: 'evals/evals.json',
    workspaceDir: null,
    iteration: '1',
    force: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--evals') out.evalsPath = argv[++i]
    else if (a === '--workspace') out.workspaceDir = argv[++i]
    else if (a === '--iteration') out.iteration = argv[++i]
    else if (a === '--force') out.force = true
    else if (a === '--help' || a === '-h') {
      usage()
      process.exit(0)
    } else {
      console.error(`Unknown arg: ${a}`)
      usage()
      process.exit(1)
    }
  }

  if (!out.workspaceDir) {
    console.error('Missing required --workspace <dir>')
    usage()
    process.exit(1)
  }

  const n = Number(out.iteration)
  if (!Number.isInteger(n) || n < 1) {
    console.error(`Invalid --iteration value: ${out.iteration}`)
    process.exit(1)
  }

  return { ...out, iteration: n }
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'eval'
}

function safeWriteJSON(filePath, data, force) {
  if (!force && existsSync(filePath)) return false
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
  return true
}

const args = parseArgs(process.argv.slice(2))
const evalsRaw = readFileSync(args.evalsPath, 'utf8')
const evalConfig = JSON.parse(evalsRaw)
const evals = Array.isArray(evalConfig?.evals) ? evalConfig.evals : []

const iterationDir = path.join(args.workspaceDir, `iteration-${args.iteration}`)
mkdirSync(iterationDir, { recursive: true })

let created = 0
let skipped = 0

for (const testCase of evals) {
  const baseName = testCase?.name || `eval-${testCase?.id ?? 'unknown'}`
  const evalSlug = `eval-${slugify(baseName)}`
  const evalDir = path.join(iterationDir, evalSlug)

  for (const mode of ['with_skill', 'without_skill']) {
    const modeDir = path.join(evalDir, mode)
    const outputsDir = path.join(modeDir, 'outputs')
    mkdirSync(outputsDir, { recursive: true })

    const timingPath = path.join(modeDir, 'timing.json')
    const timingData = {
      total_tokens: null,
      duration_ms: null,
      run_status: 'pending',
    }

    const assertions = Array.isArray(testCase?.assertions) ? testCase.assertions : []
    const gradingPath = path.join(modeDir, 'grading.json')
    const gradingData = {
      assertion_results: assertions.map(text => ({
        text,
        passed: null,
        evidence: '',
      })),
      summary: {
        passed: 0,
        failed: 0,
        total: assertions.length,
        pass_rate: null,
      },
      grading_status: 'pending',
    }

    if (safeWriteJSON(timingPath, timingData, args.force)) created++
    else skipped++

    if (safeWriteJSON(gradingPath, gradingData, args.force)) created++
    else skipped++
  }
}

const benchmarkPath = path.join(iterationDir, 'benchmark.json')
const benchmarkData = {
  run_summary: {
    with_skill: {
      pass_rate: { mean: null, stddev: null },
      time_seconds: { mean: null, stddev: null },
      tokens: { mean: null, stddev: null },
      determinism_pass_rate: { mean: null, stddev: null },
    },
    without_skill: {
      pass_rate: { mean: null, stddev: null },
      time_seconds: { mean: null, stddev: null },
      tokens: { mean: null, stddev: null },
      determinism_pass_rate: { mean: null, stddev: null },
    },
    delta: {
      pass_rate: null,
      time_seconds: null,
      tokens: null,
      determinism_pass_rate: null,
    },
    gain: {
      quality_percent: null,
      time_percent: null,
      tokens_percent: null,
    },
  },
  generated_from: path.resolve(args.evalsPath),
}

if (safeWriteJSON(benchmarkPath, benchmarkData, args.force)) created++
else skipped++

const feedbackPath = path.join(iterationDir, 'feedback.json')
const feedbackData = Object.fromEntries(
  evals.map(tc => {
    const baseName = tc?.name || `eval-${tc?.id ?? 'unknown'}`
    return [`eval-${slugify(baseName)}`, '']
  }),
)

if (safeWriteJSON(feedbackPath, feedbackData, args.force)) created++
else skipped++

console.log(`Scaffold ready at ${iterationDir}`)
console.log(`Files created: ${created}`)
console.log(`Files skipped (already existed): ${skipped}`)
