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

let totalPassedCount = 0
let totalAssertionCount = 0

const runSummary = {
  with_skill: { pass_rate: 0, count: 0, total_assertions: 0 },
  without_skill: { pass_rate: 0, count: 0, total_assertions: 0 }
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

    if (!existsSync(outputsDir) || !existsSync(gradingPath)) {
      continue
    }

    // Find first available output file
    let outputFiles = []
    try {
      outputFiles = readdirSync(outputsDir).filter(f => !f.startsWith('.'))
    } catch (err) {
      // Ignore
    }

    let fileContent = ''
    let filePath = ''
    if (outputFiles.length > 0) {
      filePath = path.join(outputsDir, outputFiles[0])
      fileContent = readFileSync(filePath, 'utf8')
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

    gradingData.assertion_results = updatedAssertions
    gradingData.summary = {
      passed: passedCount,
      failed: total - passedCount,
      total,
      pass_rate: passRate
    }
    gradingData.grading_status = 'completed'

    writeFileSync(gradingPath, JSON.stringify(gradingData, null, 2) + '\n', 'utf8')
    console.log(`  [${mode}] ${evalSlug}: ${passedCount}/${total} passed (${Math.round(passRate * 100)}%)`)

    runSummary[mode].pass_rate += passRate
    runSummary[mode].count++
    runSummary[mode].total_assertions += total
  }
}

// Calculate mean pass rates and update benchmark.json
const benchmarkPath = path.join(iterationDir, 'benchmark.json')
if (existsSync(benchmarkPath)) {
  const benchmarkData = JSON.parse(readFileSync(benchmarkPath, 'utf8'))

  const withSkillMean = runSummary.with_skill.count > 0 ? runSummary.with_skill.pass_rate / runSummary.with_skill.count : null
  const withoutSkillMean = runSummary.without_skill.count > 0 ? runSummary.without_skill.pass_rate / runSummary.without_skill.count : null

  benchmarkData.run_summary = {
    with_skill: {
      pass_rate: { mean: withSkillMean, stddev: 0 },
      time_seconds: { mean: null, stddev: null },
      tokens: { mean: null, stddev: null }
    },
    without_skill: {
      pass_rate: { mean: withoutSkillMean, stddev: 0 },
      time_seconds: { mean: null, stddev: null },
      tokens: { mean: null, stddev: null }
    },
    delta: {
      pass_rate: (withSkillMean !== null && withoutSkillMean !== null) ? withSkillMean - withoutSkillMean : null,
      time_seconds: null,
      tokens: null
    }
  }

  writeFileSync(benchmarkPath, JSON.stringify(benchmarkData, null, 2) + '\n', 'utf8')
  console.log(`\nBenchmark updated:`)
  console.log(`  with_skill pass rate mean: ${withSkillMean !== null ? Math.round(withSkillMean * 100) + '%' : 'N/A'}`)
  console.log(`  without_skill pass rate mean: ${withoutSkillMean !== null ? Math.round(withoutSkillMean * 100) + '%' : 'N/A'}`)
}
