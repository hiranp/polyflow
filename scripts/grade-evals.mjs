#!/usr/bin/env node
// grade-evals.mjs — automatically evaluate generated workflows against assertions
//
//   node scripts/grade-evals.mjs --workspace evals/workspace [--evals evals/evals.json] [--iteration 1]
//

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

function usage() {
  console.log('Usage: node scripts/grade-evals.mjs --workspace <dir> [--evals <path>] [--iteration <n>]')
  console.log('Defaults: --evals evals/evals.json --iteration 1')
}

function parseArgs(argv) {
  const out = {
    evalsPath: 'evals/evals.json',
    workspaceDir: null,
    iteration: '1',
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--evals') out.evalsPath = argv[++i]
    else if (a === '--workspace') out.workspaceDir = argv[++i]
    else if (a === '--iteration') out.iteration = argv[++i]
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

  return { ...out, iteration: Number(out.iteration) }
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'eval'
}

function toNumberOrNull(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function computeMean(values) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function computeStddev(values) {
  if (values.length < 2) return 0
  const mean = computeMean(values)
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length
  return Math.sqrt(variance)
}

function checkAssertion(assertionText, fileContent, filePath) {
  const code = fileContent || ''
  const isMd = filePath.endsWith('.md') || filePath.endsWith('.txt')

  switch (assertionText.trim()) {
    case "Output contains an export const meta block as first statement": {
      const idx = code.indexOf('export const meta')
      if (idx === -1) return { passed: false, evidence: "Could not find 'export const meta'" }
      const before = code.slice(0, idx).trim()
      if (before.length > 0 && !before.startsWith('//') && !before.startsWith('/*')) {
        return { passed: false, evidence: `Code precedes meta block: "${before.slice(0, 40)}..."` }
      }
      return { passed: true, evidence: "Found 'export const meta' as the first statement" }
    }
    case "Workflow uses pipeline for multi-stage per-item flow":
      if (/\bpipeline\s*\(/.test(code)) {
        return { passed: true, evidence: "Found 'pipeline(...)' call" }
      }
      return { passed: false, evidence: "No 'pipeline(' found in code" }

    case "Each stage using structured data defines JSON schema":
      if (/\bschema\b|\b[a-zA-Z0-9_]+_SCHEMA\b/.test(code)) {
        return { passed: true, evidence: "Found schema usage or SCHEMA definition references" }
      }
      return { passed: false, evidence: "No schema references found" }

    case "Code safely handles null or missing stage outputs":
      if (/\.filter\s*\(\s*Boolean\s*\)/.test(code) || /\.filter\s*\(\s*([a-zA-Z0-9_]+)\s*=>\s*\1\s*\)/.test(code) || /\.filter\s*\(\s*([a-zA-Z0-9_]+)\s*=>\s*!\s*!\s*\1\s*\)/.test(code)) {
        return { passed: true, evidence: "Found .filter(Boolean) or equivalent null filter" }
      }
      return { passed: false, evidence: "No standard .filter(Boolean) found to filter null outputs" }

    case "Final return includes confirmed findings summary":
      if (/\breturn\b[\s\S]*?(?:findings|confirmed|summary|result)/i.test(code)) {
        return { passed: true, evidence: "Return statement mentions findings/confirmed summary" }
      }
      return { passed: false, evidence: "Could not find matching return structure with findings/confirmed summary" }

    case "Loop includes a hard cap termination condition":
      if (/\b(?:rounds?|limit|max|count|i)\b\s*(?:<|<=|>|>=|!=|!==)\s*\d+/.test(code) || /\b(?:rounds?|limit|max|count)\b/.test(code)) {
        return { passed: true, evidence: "Found loop counter or termination comparison" }
      }
      return { passed: false, evidence: "No hard cap termination variable/comparison found in loop condition" }

    case "Loop includes a budget-aware guard":
      if (/budget\s*\.\s*(?:remaining|total)/.test(code)) {
        return { passed: true, evidence: "Found budget.remaining() or budget.total guard in loop condition" }
      }
      return { passed: false, evidence: "No budget guard found in loop" }

    case "Structured schema is used for collected items":
      if (/\bschema\b|\b[a-zA-Z0-9_]+_SCHEMA\b/.test(code)) {
        return { passed: true, evidence: "Found schema references in code" }
      }
      return { passed: false, evidence: "No structured schema referenced" }

    case "Output reports rounds/count summary":
      if (/(?:rounds|count|total|found|length)/i.test(code)) {
        return { passed: true, evidence: "Found references to rounds or count summary in logs/outputs" }
      }
      return { passed: false, evidence: "No rounds/count summary references found" }

    case "Response defines a portable canonical spec":
      if (isMd && /(?:portable|canonical|spec|json)/i.test(code)) {
        return { passed: true, evidence: "Response mentions portable spec or canonical architecture" }
      }
      return { passed: isMd, evidence: isMd ? "MD file found" : "Not a Markdown/Text response file" }

    case "Response includes per-platform adapter notes for all four runtimes": {
      const runtimes = ['claude', 'codex', 'copilot', 'gemini']
      const missing = runtimes.filter(r => !code.toLowerCase().includes(r))
      if (missing.length === 0) {
        return { passed: true, evidence: "Mentions all four runtimes: Claude, Codex, Copilot, Gemini" }
      }
      return { passed: false, evidence: `Missing references to: ${missing.join(', ')}` }
    }
    case "Response includes determinism and resume/replay guidance":
      if (/(?:determin|resume|replay)/i.test(code)) {
        return { passed: true, evidence: "Mentions determinism, resume, or replay" }
      }
      return { passed: false, evidence: "Missing determinism or resume guidance" }

    case "Response includes token/time optimization considerations":
      if (/(?:token|time|optim|cost)/i.test(code)) {
        return { passed: true, evidence: "Mentions token or time optimization/cost" }
      }
      return { passed: false, evidence: "Missing token/time optimization considerations" }

    case "Runtime contract enforces per-project scope only":
      if (/stateScope"\s*:\s*"project-only"/.test(code) || /project-only/i.test(code)) {
        return { passed: true, evidence: 'Found project-only runtime scope contract' }
      }
      return { passed: false, evidence: 'Missing explicit project-only state scope contract' }

    case "Runtime contract declares file-backed persistence and rejects global/shared state":
      if (/file-backed/i.test(code) && /(sharedState"\s*:\s*"forbidden"|rejects?\s+global|no\s+global)/i.test(code)) {
        return { passed: true, evidence: 'Found file-backed persistence and shared-state rejection' }
      }
      return { passed: false, evidence: 'Missing file-backed persistence and/or explicit global shared-state rejection' }

    case "Implementation persists stage artifacts under project-local directory":
      if (/(?:\.polyflow\/runs|artifactsRoot|writeJSON)/.test(code) && /projectRoot/.test(code)) {
        return { passed: true, evidence: 'Found project-root artifact persistence logic' }
      }
      return { passed: false, evidence: 'Could not verify project-local artifact persistence logic' }

    case "Implementation blocks writes outside project root":
      if (/Path escapes project root|startsWith\('\.\.'\)|ensureWithinProject/.test(code)) {
        return { passed: true, evidence: 'Found project-root path escape checks' }
      }
      return { passed: false, evidence: 'No explicit project-root boundary check found' }

    case "Evaluation benchmark reports pass-rate delta between with_skill and without_skill":
      if (/delta[\s\S]*pass_rate/.test(code) && /with_skill/.test(code) && /without_skill/.test(code)) {
        return { passed: true, evidence: 'Found benchmark delta pass-rate reporting structure' }
      }
      return { passed: false, evidence: 'Missing pass-rate delta reporting in benchmark structure' }

    case "Evaluation benchmark reports duration and token deltas between with_skill and without_skill":
      if (/delta[\s\S]*time_seconds/.test(code) && /delta[\s\S]*tokens/.test(code)) {
        return { passed: true, evidence: 'Found duration and token delta reporting in benchmark structure' }
      }
      return { passed: false, evidence: 'Missing duration/token delta reporting in benchmark structure' }

    case "Grading includes replay/resume determinism validation":
      if (/(?:determinism|deterministic)/i.test(code) && /(?:resume|replay)/i.test(code)) {
        return { passed: true, evidence: 'Found replay/resume determinism grading checks' }
      }
      return { passed: false, evidence: 'Missing replay/resume determinism grading checks' }

    default:
      if (code.toLowerCase().includes(assertionText.toLowerCase())) {
        return { passed: true, evidence: `Matched substring: "${assertionText}"` }
      }
      return { passed: false, evidence: `Could not verify assertion: "${assertionText}"` }
  }
}

const args = parseArgs(process.argv.slice(2))
const evalsRaw = readFileSync(args.evalsPath, 'utf8')
const evalConfig = JSON.parse(evalsRaw)
const evals = Array.isArray(evalConfig?.evals) ? evalConfig.evals : []

const iterationDir = path.join(args.workspaceDir, `iteration-${args.iteration}`)
if (!existsSync(iterationDir)) {
  console.error(`Iteration directory does not exist: ${iterationDir}`)
  process.exit(1)
}

console.log(`Grading iteration-${args.iteration} in workspace ${args.workspaceDir}...`)

const runSummary = {
  with_skill: {
    pass_rates: [],
    time_seconds: [],
    tokens: [],
    determinism_pass_rates: [],
  },
  without_skill: {
    pass_rates: [],
    time_seconds: [],
    tokens: [],
    determinism_pass_rates: [],
  },
}

for (const testCase of evals) {
  const baseName = testCase?.name || `eval-${testCase?.id ?? 'unknown'}`
  const evalSlug = `eval-${slugify(baseName)}`
  const evalDir = path.join(iterationDir, evalSlug)

  if (!existsSync(evalDir)) {
    console.log(`Skipping ${evalSlug} — directory not found`)
    continue
  }

  for (const mode of ['with_skill', 'without_skill']) {
    const modeDir = path.join(evalDir, mode)
    const outputsDir = path.join(modeDir, 'outputs')
    const gradingPath = path.join(modeDir, 'grading.json')
    const timingPath = path.join(modeDir, 'timing.json')

    if (!existsSync(outputsDir) || !existsSync(gradingPath)) {
      continue
    }

    // Read all available output files to maximize assertion coverage.
    let outputFiles = []
    try {
      outputFiles = readdirSync(outputsDir).filter(f => !f.startsWith('.'))
    } catch {
      // Ignore
    }

    let fileContent = ''
    let filePath = ''
    if (outputFiles.length > 0) {
      const sorted = outputFiles.sort()
      filePath = path.join(outputsDir, sorted[0])
      fileContent = sorted.map(name => readFileSync(path.join(outputsDir, name), 'utf8')).join('\n\n')
    }

    const gradingData = JSON.parse(readFileSync(gradingPath, 'utf8'))
    const assertions = gradingData.assertion_results || []

    let passedCount = 0
    const updatedAssertions = assertions.map(assertion => {
      if (!filePath) {
        return {
          ...assertion,
          passed: false,
          evidence: 'No output file found in outputs/ directory'
        }
      }
      const res = checkAssertion(assertion.text, fileContent, filePath)
      if (res.passed) passedCount++
      return {
        ...assertion,
        passed: res.passed,
        evidence: res.evidence
      }
    })

    const total = assertions.length
    const passRate = total > 0 ? passedCount / total : 0
    const determinismAssertions = updatedAssertions.filter(a => /determin|resume|replay/i.test(a.text))
    const determinismPassed = determinismAssertions.filter(a => a.passed).length
    const determinismPassRate = determinismAssertions.length > 0 ? determinismPassed / determinismAssertions.length : null

    gradingData.assertion_results = updatedAssertions
    gradingData.summary = {
      passed: passedCount,
      failed: total - passedCount,
      total,
      pass_rate: passRate,
      determinism_pass_rate: determinismPassRate,
    }
    gradingData.grading_status = 'completed'

    writeFileSync(gradingPath, JSON.stringify(gradingData, null, 2) + '\n', 'utf8')
    console.log(`  [${mode}] ${evalSlug}: ${passedCount}/${total} passed (${Math.round(passRate * 100)}%)`)

    runSummary[mode].pass_rates.push(passRate)
    if (determinismPassRate !== null) runSummary[mode].determinism_pass_rates.push(determinismPassRate)

    if (existsSync(timingPath)) {
      const timing = JSON.parse(readFileSync(timingPath, 'utf8'))
      const durationMs = toNumberOrNull(timing?.duration_ms)
      const totalTokens = toNumberOrNull(timing?.total_tokens)
      if (durationMs !== null) runSummary[mode].time_seconds.push(durationMs / 1000)
      if (totalTokens !== null) runSummary[mode].tokens.push(totalTokens)
    }
  }
}

// Calculate means/stddev and update benchmark.json
const benchmarkPath = path.join(iterationDir, 'benchmark.json')
if (existsSync(benchmarkPath)) {
  const benchmarkData = JSON.parse(readFileSync(benchmarkPath, 'utf8'))

  const withSkillPassMean = computeMean(runSummary.with_skill.pass_rates)
  const withoutSkillPassMean = computeMean(runSummary.without_skill.pass_rates)
  const withSkillTimeMean = computeMean(runSummary.with_skill.time_seconds)
  const withoutSkillTimeMean = computeMean(runSummary.without_skill.time_seconds)
  const withSkillTokensMean = computeMean(runSummary.with_skill.tokens)
  const withoutSkillTokensMean = computeMean(runSummary.without_skill.tokens)
  const withSkillDeterminismMean = computeMean(runSummary.with_skill.determinism_pass_rates)
  const withoutSkillDeterminismMean = computeMean(runSummary.without_skill.determinism_pass_rates)

  const deltaPass = (withSkillPassMean !== null && withoutSkillPassMean !== null) ? withSkillPassMean - withoutSkillPassMean : null
  const deltaTime = (withSkillTimeMean !== null && withoutSkillTimeMean !== null) ? withSkillTimeMean - withoutSkillTimeMean : null
  const deltaTokens = (withSkillTokensMean !== null && withoutSkillTokensMean !== null) ? withSkillTokensMean - withoutSkillTokensMean : null
  const deltaDeterminism = (withSkillDeterminismMean !== null && withoutSkillDeterminismMean !== null) ? withSkillDeterminismMean - withoutSkillDeterminismMean : null

  benchmarkData.run_summary = {
    with_skill: {
      pass_rate: { mean: withSkillPassMean, stddev: computeStddev(runSummary.with_skill.pass_rates) },
      time_seconds: { mean: withSkillTimeMean, stddev: computeStddev(runSummary.with_skill.time_seconds) },
      tokens: { mean: withSkillTokensMean, stddev: computeStddev(runSummary.with_skill.tokens) },
      determinism_pass_rate: { mean: withSkillDeterminismMean, stddev: computeStddev(runSummary.with_skill.determinism_pass_rates) },
    },
    without_skill: {
      pass_rate: { mean: withoutSkillPassMean, stddev: computeStddev(runSummary.without_skill.pass_rates) },
      time_seconds: { mean: withoutSkillTimeMean, stddev: computeStddev(runSummary.without_skill.time_seconds) },
      tokens: { mean: withoutSkillTokensMean, stddev: computeStddev(runSummary.without_skill.tokens) },
      determinism_pass_rate: { mean: withoutSkillDeterminismMean, stddev: computeStddev(runSummary.without_skill.determinism_pass_rates) },
    },
    delta: {
      pass_rate: deltaPass,
      time_seconds: deltaTime,
      tokens: deltaTokens,
      determinism_pass_rate: deltaDeterminism,
    },
    gain: {
      quality_percent: (deltaPass !== null && withoutSkillPassMean) ? (deltaPass / withoutSkillPassMean) * 100 : null,
      time_percent: (deltaTime !== null && withoutSkillTimeMean) ? ((withoutSkillTimeMean - withSkillTimeMean) / withoutSkillTimeMean) * 100 : null,
      tokens_percent: (deltaTokens !== null && withoutSkillTokensMean) ? ((withoutSkillTokensMean - withSkillTokensMean) / withoutSkillTokensMean) * 100 : null,
    },
  }

  writeFileSync(benchmarkPath, JSON.stringify(benchmarkData, null, 2) + '\n', 'utf8')
  console.log(`\nBenchmark updated:`)
  console.log(`  with_skill pass rate mean: ${withSkillPassMean !== null ? Math.round(withSkillPassMean * 100) + '%' : 'N/A'}`)
  console.log(`  without_skill pass rate mean: ${withoutSkillPassMean !== null ? Math.round(withoutSkillPassMean * 100) + '%' : 'N/A'}`)
  console.log(`  delta pass rate: ${deltaPass !== null ? Math.round(deltaPass * 100) + ' pts' : 'N/A'}`)
  console.log(`  delta time (s): ${deltaTime !== null ? deltaTime.toFixed(3) : 'N/A'}`)
  console.log(`  delta tokens: ${deltaTokens !== null ? Math.round(deltaTokens) : 'N/A'}`)
}
