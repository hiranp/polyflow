#!/usr/bin/env node

import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) {
  console.error('usage: node validate-workflow-spec.mjs <path-to-WORKFLOW-SPEC.md>')
  process.exit(1)
}

let src
try {
  src = readFileSync(path, 'utf8')
} catch (error) {
  console.error(`cannot read ${path}: ${error.message}`)
  process.exit(1)
}

const lines = src.split(/\r?\n/)
const errors = []

const normalize = text => text
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const requiredSections = [
  'Goal',
  'Unit Of Work',
  'Item Count And Source',
  'Topology Choice',
  'Barrier Justification',
  'Stage Plan',
  'Verification Strategy',
  'Cost And Safety',
  'Output Contract',
  'Sign-Off',
]

const headingLines = []
for (let index = 0; index < lines.length; index++) {
  const line = lines[index]
  const match = /^##\s+(.+?)\s*$/.exec(line)
  if (!match) continue
  headingLines.push({ index, title: normalize(match[1].replace(/^\d+\.\s*/, '')) })
}

for (const section of requiredSections) {
  const title = normalize(section)
  if (!headingLines.some(heading => heading.title === title)) {
    errors.push(`missing required section: ${section}`)
  }
}

const signOffLine = headingLines.find(heading => heading.title === normalize('Sign-Off'))?.index
if (signOffLine !== undefined) {
  const nextHeading = headingLines.find(heading => heading.index > signOffLine)
  const endLine = nextHeading?.index ?? lines.length
  const signOffBlock = lines.slice(signOffLine + 1, endLine).join('\n')
  const unchecked = signOffBlock.match(/^\s*[-*]\s*\[ \]\s+.+$/gm) ?? []
  if (unchecked.length > 0) {
    errors.push(`sign-off is incomplete: ${unchecked.length} unchecked item(s)`)
  }
} else {
  errors.push('missing required section: Sign-Off')
}

for (const placeholder of ['{name}', '_____']) {
  if (src.includes(placeholder)) {
    errors.push(`placeholder text still present: ${placeholder}`)
  }
}

if (/<!--/.test(src)) {
  errors.push('template comments still present — remove guidance comments from the finished spec')
}

const name = path.split('/').pop()
if (errors.length === 0) {
  console.log(`ok — ${name} passes (${lines.length} line(s))`)
  process.exit(0)
}

for (const error of errors) {
  console.log(`  ERROR ${error}`)
}
console.log(`\n${errors.length} error(s) in ${name} — fix before writing JavaScript.`)
process.exit(1)
