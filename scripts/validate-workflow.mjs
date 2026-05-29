#!/usr/bin/env node
// validate-workflow.mjs — lint a Claude Code workflow file against the parser's
// hard rules before you waste a run.
//
//   node validate-workflow.mjs <path-to-workflow.js>
//
// Exit 0 = clean (warnings allowed). Exit 1 = errors found, or bad usage.

import { readFileSync } from 'node:fs'

const MAX_BYTES = 524288 // 512 KB — scripts above this are rejected before parsing.

const path = process.argv[2]
if (!path) {
  console.error('usage: node validate-workflow.mjs <path-to-workflow.js>')
  process.exit(1)
}

let src
try {
  src = readFileSync(path, 'utf8')
} catch (e) {
  console.error(`cannot read ${path}: ${e.message}`)
  process.exit(1)
}

const errors = []
const warnings = []
const lineOf = (idx) => src.slice(0, idx).split('\n').length

// --- 1. size -----------------------------------------------------------------
const bytes = Buffer.byteLength(src, 'utf8')
if (bytes > MAX_BYTES) {
  errors.push(`script is ${bytes} bytes — over the ${MAX_BYTES}-byte (512 KB) limit`)
}

// --- 2. comment/string-stripped copy (so checks ignore text in comments/strings)
function strip(code) {
  let out = ''
  let i = 0
  const n = code.length
  while (i < n) {
    const c = code[i], d = code[i + 1]
    if (c === '/' && d === '/') {                    // line comment
      while (i < n && code[i] !== '\n') { out += ' '; i++ }
    } else if (c === '/' && d === '*') {             // block comment
      out += '  '; i += 2
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
        out += code[i] === '\n' ? '\n' : ' '; i++
      }
      out += '  '; i += 2
    } else if (c === '"' || c === "'" || c === '`') { // string / template
      const q = c; out += ' '; i++
      while (i < n && code[i] !== q) {
        if (code[i] === '\\') { out += '  '; i += 2; continue }
        out += code[i] === '\n' ? '\n' : ' '; i++
      }
      out += ' '; i++
    } else {
      out += c; i++
    }
  }
  return out
}
const code = strip(src)

// --- 3. meta must exist, be first, and be a literal --------------------------
const metaMatch = code.match(/export\s+const\s+meta\s*=/)
if (!metaMatch) {
  errors.push('no `export const meta = {…}` found — every workflow needs it')
} else {
  const before = code.slice(0, metaMatch.index).trim()
  if (before.length > 0) {
    errors.push(`\`export const meta\` must be the FIRST statement `
      + `(line ${lineOf(metaMatch.index)}) — code precedes it`)
  }
  // crude object span: from the `{` after = to its matching `}`
  const open = code.indexOf('{', metaMatch.index)
  if (open !== -1) {
    let depth = 0, end = -1
    for (let j = open; j < code.length; j++) {
      if (code[j] === '{') depth++
      else if (code[j] === '}' && --depth === 0) { end = j; break }
    }
    if (end !== -1) {
      const metaBody = code.slice(open, end + 1)
      const rawMeta = src.slice(open, end + 1)
      if (!/\bname\s*:/.test(metaBody)) errors.push('meta is missing a `name` field')
      if (!/\bdescription\s*:/.test(metaBody)) {
        errors.push('meta is missing a `description` field')
      }
      // pure-literal heuristics — high-confidence violations only
      if (/\.\.\./.test(metaBody)) errors.push('meta contains a spread `...` — it must be a pure literal')
      if (/`/.test(rawMeta)) errors.push('meta contains a template literal — it must be a pure literal')
      if (/[A-Za-z_$][\w$]*\s*\(/.test(metaBody)) {
        errors.push('meta appears to contain a function call — it must be a pure literal')
      }
      for (const bad of ['__proto__', 'constructor', 'prototype']) {
        if (new RegExp(`\\b${bad}\\s*:`).test(metaBody)) {
          errors.push(`meta uses reserved key \`${bad}\``)
        }
      }
    }
  }
}

// --- 4. banned non-deterministic calls ---------------------------------------
const banned = [
  [/\bDate\s*\.\s*now\b/g, 'Date.now()'],
  [/\bMath\s*\.\s*random\b/g, 'Math.random()'],
  [/\bnew\s+Date\s*\(\s*\)/g, 'new Date()  (argless)'],
]
for (const [re, label] of banned) {
  let m
  while ((m = re.exec(code))) {
    errors.push(`banned non-deterministic call \`${label}\` at line ${lineOf(m.index)} `
      + '— it throws inside a workflow (breaks resume)')
  }
}

// --- 5. host APIs that do not exist in the sandbox ---------------------------
for (const [re, label] of [
  [/\brequire\s*\(/g, 'require()'],
  [/\bimport\s+[^\n]*\bfrom\b/g, 'import … from …'],
  [/\bprocess\s*\./g, 'process.*'],
]) {
  let m
  while ((m = re.exec(code))) {
    warnings.push(`\`${label}\` at line ${lineOf(m.index)} — no Node/host APIs in the `
      + 'orchestrator; do file/shell work inside an agent() instead')
  }
}

// --- 6. parallel() should get thunks, not bare promises ----------------------
{
  const re = /\bparallel\s*\(\s*\[/g
  let m
  while ((m = re.exec(code))) {
    const tail = code.slice(m.index + m[0].length, m.index + m[0].length + 40)
    if (/^\s*agent\s*\(/.test(tail)) {
      warnings.push(`parallel([...]) at line ${lineOf(m.index)} looks like it holds bare `
        + 'agent(...) calls — wrap each as a thunk: () => agent(...)')
    }
  }
}

// --- 6b. large fan-out should usually choose haiku ---------------------------
{
  const arrayRe = /\bparallel\s*\(\s*\[([\s\S]*?)\]\s*\)/g
  let match
  while ((match = arrayRe.exec(src))) {
    const thunkCount = (match[1].match(/=>/g) ?? []).length
    if (thunkCount > 5 && !/model\s*:\s*['"`]haiku['"`]/.test(match[0])) {
      warnings.push(`parallel fan-out at line ${lineOf(match.index)} has ${thunkCount} tasks and no explicit model: 'haiku' — high-volume mechanical work is usually a good Haiku candidate`)
    }
  }

  const fromRe = /\bparallel\s*\(\s*Array\.from\s*\(\s*\{\s*length\s*:\s*(\d+)/g
  while ((match = fromRe.exec(src))) {
    const thunkCount = Number(match[1])
    if (thunkCount > 5) {
      const tail = src.slice(match.index, match.index + 220)
      if (!/model\s*:\s*['"`]haiku['"`]/.test(tail)) {
        warnings.push(`parallel fan-out at line ${lineOf(match.index)} has ${thunkCount} tasks and no explicit model: 'haiku' — high-volume mechanical work is usually a good Haiku candidate`)
      }
    }
  }
}

// --- 7. loop safety checks ---------------------------------------------------
{
  const re = /\bwhile\s*\(([^)]+)\)/g
  let m
  while ((m = re.exec(code))) {
    const cond = m[1]
    const line = lineOf(m.index)
    const hasBudget = /budget\b/.test(cond)
    const hasCounter = /[a-zA-Z_$][\w$]*\s*(?:<|<=|>|>=|!=|!==)\s*\d+/.test(cond) || /\b(?:rounds?|limit|max|count)\b/.test(cond)
    if (!hasBudget && !hasCounter) {
      warnings.push(`while loop at line ${line} lacks a budget guard or hard cap termination condition - this could lead to runaway token usage`)
    }
  }
}

// --- 8. parallel/pipeline filtering ------------------------------------------
if (code.includes('parallel') || code.includes('pipeline')) {
  if (!code.includes('.filter(')) {
    warnings.push(`workflow uses parallel() or pipeline() but does not appear to filter results (e.g. .filter(Boolean)) — skipped/failed agents resolve to null and may cause errors downstream`)
  }
}

// --- 8b. pretty-printed JSON in prompts inflates token use -------------------
{
  const re = /JSON\.stringify\([^\n)]*,\s*null\s*,\s*2\s*\)/g
  let match
  while ((match = re.exec(src))) {
    warnings.push(`JSON.stringify(..., null, 2) at line ${lineOf(match.index)} inflates prompt tokens — use compact JSON.stringify(data) for inter-stage payloads`)
  }
}

// --- 9. phase title consistency ----------------------------------------------
{
  const metaPhases = []
  const phasesMatch = src.match(/phases\s*:\s*\[([\s\S]*?)\]/)
  if (phasesMatch) {
    const phasesBlock = phasesMatch[1]
    const titleRe = /title\s*:\s*['"`](.*?)['"`]/g
    let tm
    while ((tm = titleRe.exec(phasesBlock))) {
      metaPhases.push(tm[1])
    }
  }

  const codePhases = []
  const phaseRe = /\bphase\s*\(\s*['"`](.*?)['"`]\s*\)/g
  let pm
  while ((pm = phaseRe.exec(src))) {
    codePhases.push(pm[1])
  }

  const agentPhaseRe = /\bphase\s*:\s*['"`](.*?)['"`]/g
  let apm
  while ((apm = agentPhaseRe.exec(src))) {
    codePhases.push(apm[1])
  }

  for (const cp of codePhases) {
    if (!metaPhases.includes(cp)) {
      warnings.push(`phase '${cp}' is referenced in the script but not declared in the meta.phases block`)
    }
  }
  for (const mp of metaPhases) {
    if (!codePhases.includes(mp)) {
      warnings.push(`phase '${mp}' is declared in meta.phases but never called or assigned (e.g., via phase('${mp}') or { phase: '${mp}' })`)
    }
  }
}

// --- report ------------------------------------------------------------------
const name = path.split('/').pop()
for (const w of warnings) console.log(`  warn  ${w}`)
for (const e of errors) console.log(`  ERROR ${e}`)

if (errors.length === 0) {
  console.log(`ok — ${name} passes (${bytes} bytes`
    + `${warnings.length ? `, ${warnings.length} warning(s)` : ''})`)
  process.exit(0)
} else {
  console.log(`\n${errors.length} error(s) in ${name} — fix before running.`)
  process.exit(1)
}
