#!/usr/bin/env node

import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) {
  console.error('usage: node estimate-cost.mjs <path-to-workflow.js>')
  process.exit(1)
}

let src
try {
  src = readFileSync(path, 'utf8')
} catch (error) {
  console.error(`cannot read ${path}: ${error.message}`)
  process.exit(1)
}

function strip(code) {
  let out = ''
  let i = 0
  const n = code.length
  while (i < n) {
    const c = code[i]
    const d = code[i + 1]
    if (c === '/' && d === '/') {
      while (i < n && code[i] !== '\n') { out += ' '; i++ }
    } else if (c === '/' && d === '*') {
      out += '  '
      i += 2
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
        out += code[i] === '\n' ? '\n' : ' '
        i++
      }
      out += '  '
      i += 2
    } else if (c === '"' || c === "'" || c === '`') {
      const quote = c
      out += ' '
      i++
      while (i < n && code[i] !== quote) {
        if (code[i] === '\\') {
          out += '  '
          i += 2
          continue
        }
        out += code[i] === '\n' ? '\n' : ' '
        i++
      }
      out += ' '
      i++
    } else {
      out += c
      i++
    }
  }
  return out
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

  if (/\.map\s*\(/.test(call.raw)) {
    return { kind: 'dynamic', count: 10, description: 'input-size dependent fan-out (assuming N=10)' }
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

let assumedCalls = 0
for (const [model, count] of Object.entries(modelCounts)) {
  assumedCalls += count
}
for (const call of parallelCalls) {
  const shape = parseParallelShape(call)
  assumedCalls += Math.max(shape.count - 1, 0)
}
if (loopMatches.length > 0) {
  assumedCalls *= 3
}

let minCost = 0
let maxCost = 0
for (const [model, count] of Object.entries(modelCounts)) {
  const [minUnit, maxUnit] = pricing[model]
  minCost += count * minUnit
  maxCost += count * maxUnit
}

const parallelCostMultiplier = parallelCalls
  .map(parseParallelShape)
  .reduce((sum, shape) => sum + Math.max(shape.count - 1, 0), 1)
const loopMultiplier = loopMatches.length > 0 ? 3 : 1
minCost *= parallelCostMultiplier * loopMultiplier
maxCost *= parallelCostMultiplier * loopMultiplier

const phasesLine = phases.length ? phases.join(' -> ') : 'None declared'
const agentSummary = [
  `${agentCalls.length} calls per static pass`,
  `${modelCounts.inherit} inherit`,
  `${modelCounts.haiku} haiku`,
  `${modelCounts.sonnet} sonnet`,
  `${modelCounts.opus} opus`,
  `${modelCounts.custom} custom`,
].join(', ')

console.log(`polyflow cost estimate: ${path.split('/').pop()}`)
console.log('----------------------------------------')
console.log(`Phases:    ${phasesLine}`)
console.log(`Agents:    ${agentSummary}`)
if (parallelCalls.length > 0) {
  console.log(`Fan-out:   ${parallelCalls.map(parseParallelShape).map(s => s.description).join('; ')}`)
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
