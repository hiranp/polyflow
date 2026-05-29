#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { strip } from './lib/strip-comments.mjs'

const args = process.argv.slice(2)
const jsonFlag = args.includes('--json')
const path = args.find(a => !a.startsWith('--'))
if (!path) {
  console.error('usage: node estimate-cost.mjs <path-to-workflow.js> [--json]')
  process.exit(1)
}

let src
try {
  src = readFileSync(path, 'utf8')
} catch (error) {
  console.error(`cannot read ${path}: ${error.message}`)
  process.exit(1)
}

const code = strip(src)
const lineOf = idx => src.slice(0, idx).split('\n').length

function findMatchingParen(text, openIdx) {
  let depth = 0
  for (let idx = openIdx; idx < text.length; idx++) {
    if (text[idx] === '(') depth++
    else if (text[idx] === ')' && --depth === 0) return idx
  }
  return -1
}

function findMatchingBrace(text, openIdx) {
  let depth = 0
  for (let idx = openIdx; idx < text.length; idx++) {
    if (text[idx] === '{') depth++
    else if (text[idx] === '}' && --depth === 0) return idx
  }
  return -1
}

function findCalls(name) {
  const calls = []
  const regex = new RegExp(`\\b${name}\\s*\\(`, 'g')
  let match
  while ((match = regex.exec(code))) {
    const openIdx = code.indexOf('(', match.index)
    const closeIdx = findMatchingParen(code, openIdx)
    if (closeIdx === -1) continue
    calls.push({
      start: match.index,
      raw: src.slice(match.index, closeIdx + 1),
      line: lineOf(match.index),
    })
    regex.lastIndex = closeIdx + 1
  }
  return calls
}

function extractMetaPhases() {
  const phasesMatch = src.match(/phases\s*:\s*\[([\s\S]*?)\]/)
  if (!phasesMatch) return []
  const titles = []
  const titleRe = /title\s*:\s*['"`](.*?)['"`]/g
  let match
  while ((match = titleRe.exec(phasesMatch[1]))) {
    titles.push(match[1])
  }
  return titles
}

function inferModel(agentCall) {
  const match = agentCall.raw.match(/model\s*:\s*['"`](.*?)['"`]/)
  return match?.[1] ?? 'inherit'
}

function formatModel(model) {
  if (['haiku', 'sonnet', 'opus', 'inherit'].includes(model)) return model
  return 'custom'
}

function parseParallelShape(call) {
  if (/\.map\s*\(/.test(call.raw)) {
    return { kind: 'dynamic', count: 10, description: 'input-size dependent fan-out (assuming N=10)' }
  }

  if (/Array\.from\s*\(\s*\{\s*length\s*:\s*(\d+)/.test(call.raw)) {
    const count = Number(call.raw.match(/Array\.from\s*\(\s*\{\s*length\s*:\s*(\d+)/)?.[1])
    return { kind: 'fixed', count, description: `up to ${count} concurrent tasks` }
  }

  if (/\[[\s\S]*\]/.test(call.raw)) {
    const arrowCount = (call.raw.match(/=>/g) ?? []).length
    if (arrowCount > 0) {
      return { kind: 'fixed', count: arrowCount, description: `up to ${arrowCount} concurrent tasks` }
    }
  }

  return { kind: 'unknown', count: 1, description: 'concurrency could not be inferred statically' }
}

function extractSchemaWarnings() {
  const warnings = []
  const schemaRegex = /const\s+([A-Z0-9_]*SCHEMA)\s*=\s*\{/g
  let match
  while ((match = schemaRegex.exec(code))) {
    const openIdx = code.indexOf('{', match.index)
    const closeIdx = findMatchingBrace(code, openIdx)
    if (closeIdx === -1) continue
    const raw = src.slice(openIdx, closeIdx + 1)
    if (!/additionalProperties\s*:\s*false/.test(raw)) {
      warnings.push(`${match[1]} missing additionalProperties: false — output inflation risk`)
    }
  }
  return warnings
}

const phases = extractMetaPhases()
const agentCalls = findCalls('agent')
const parallelCalls = findCalls('parallel')
const pipelineCalls = findCalls('pipeline')
const loopMatches = [
  ...code.matchAll(/\bwhile\s*\(/g),
  ...code.matchAll(/\bfor\s*\(/g),
  ...code.matchAll(/\bdo\s*\{/g),
]

const modelCounts = { haiku: 0, sonnet: 0, opus: 0, inherit: 0, custom: 0 }
for (const call of agentCalls) {
  modelCounts[formatModel(inferModel(call))]++
}

const warnings = []

for (const match of src.matchAll(/JSON\.stringify\([^\n)]*,\s*null\s*,\s*2\s*\)/g)) {
  warnings.push(`JSON.stringify(..., null, 2) at line ${lineOf(match.index)} — indent inflation risk in prompts`)
}

for (const call of parallelCalls) {
  const shape = parseParallelShape(call)
  if (shape.count > 5 && !/model\s*:\s*['"`]haiku['"`]/.test(call.raw)) {
    warnings.push(`parallel fan-out at line ${call.line} has ${shape.description} and no explicit model: 'haiku'`)
  }
}

warnings.push(...extractSchemaWarnings())

const pricing = {
  haiku: [0.002, 0.008],
  sonnet: [0.01, 0.03],
  opus: [0.04, 0.12],
  inherit: [0.01, 0.03],
  custom: [0.01, 0.05],
}

// --- Estimate total agent calls ------------------------------------------------
// findCalls('agent') already counts every literal agent() in the source.
// For fixed parallels like [() => agent(...), () => agent(...)], the agent()
// calls are already counted.  For dynamic fan-outs (.map(() => agent(...))),
// only one agent() appears in source but N execute at runtime — add (N - 1).
let assumedCalls = 0
for (const [model, count] of Object.entries(modelCounts)) {
  assumedCalls += count
}
if (loopMatches.length > 0) {
  assumedCalls *= 3
}

// --- Estimate cost range -------------------------------------------------------
// Dynamic fan-out multiplier: only applies to agents inside .map() patterns,
// not to the entire workflow.  We compute the extra cost from dynamic blocks
// separately rather than multiplying all costs.
let minCost = 0
let maxCost = 0
for (const [model, count] of Object.entries(modelCounts)) {
  const [minUnit, maxUnit] = pricing[model]
  minCost += count * minUnit
  maxCost += count * maxUnit
}

// Add extra cost only for dynamic fan-outs (the one literal agent() call is
// already included in the base cost above; add the remaining N-1 copies).
let dynamicExtraCostMin = 0
let dynamicExtraCostMax = 0
for (const call of parallelCalls) {
  const shape = parseParallelShape(call)
  if (shape.kind !== 'dynamic') continue
  // Find agent calls inside this parallel's source span to price them
  const innerAgents = agentCalls.filter(a => a.start >= call.start && a.start < call.start + call.raw.length)
  const extraCopies = Math.max(shape.count - 1, 0)
  for (const inner of innerAgents) {
    const model = formatModel(inferModel(inner))
    const [minUnit, maxUnit] = pricing[model]
    dynamicExtraCostMin += extraCopies * minUnit
    dynamicExtraCostMax += extraCopies * maxUnit
  }
}
minCost += dynamicExtraCostMin
maxCost += dynamicExtraCostMax

const loopMultiplier = loopMatches.length > 0 ? 3 : 1
minCost *= loopMultiplier
maxCost *= loopMultiplier

const phasesLine = phases.length ? phases.join(' -> ') : 'None declared'
const agentSummary = [
  `${agentCalls.length} calls per static pass`,
  `${modelCounts.inherit} inherit`,
  `${modelCounts.haiku} haiku`,
  `${modelCounts.sonnet} sonnet`,
  `${modelCounts.opus} opus`,
  `${modelCounts.custom} custom`,
].join(', ')

const fanOutDescriptions = parallelCalls.map(parseParallelShape).map(s => s.description)

if (jsonFlag) {
  const result = {
    file: path.split('/').pop(),
    phases: phases.length > 0 ? phases : [],
    agents: {
      staticCount: agentCalls.length,
      byModel: { ...modelCounts },
    },
    fanOut: fanOutDescriptions,
    pipelines: pipelineCalls.length,
    loops: loopMatches.length,
    warnings,
    estimate: {
      minCost: Number(minCost.toFixed(4)),
      maxCost: Number(maxCost.toFixed(4)),
      assumedCalls,
      assumptions: [
        'N=10 for dynamic fan-out',
        ...(loopMatches.length > 0 ? ['3 loop rounds'] : []),
      ],
    },
  }
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`polyflow cost estimate: ${path.split('/').pop()}`)
  console.log('----------------------------------------')
  console.log(`Phases:    ${phasesLine}`)
  console.log(`Agents:    ${agentSummary}`)
  if (parallelCalls.length > 0) {
    console.log(`Fan-out:   ${fanOutDescriptions.join('; ')}`)
  } else {
    console.log('Fan-out:   None')
  }
  console.log(`Pipeline:  ${pipelineCalls.length > 0 ? `${pipelineCalls.length} pipeline stage chain(s)` : 'None'}`)
  console.log(`Loop:      ${loopMatches.length > 0 ? `${loopMatches.length} loop construct(s) detected` : 'None'}`)
  console.log('----------------------------------------')
  if (warnings.length > 0) {
    console.log('Warnings:')
    for (const warning of warnings) {
      console.log(`  - ${warning}`)
    }
  } else {
    console.log('Warnings:')
    console.log('  - None')
  }
  console.log('----------------------------------------')
  console.log(`Rough estimate (assuming N=10 for dynamic fan-out${loopMatches.length ? ', 3 loop rounds' : ''}):`)
  console.log(`  ~$${minCost.toFixed(2)}-$${maxCost.toFixed(2)} per run across ~${assumedCalls} agent calls`)
}
