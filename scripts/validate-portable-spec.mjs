#!/usr/bin/env node

import { readFileSync } from 'node:fs'

function fail(message) {
  console.error(`portable spec validation failed: ${message}`)
  process.exit(1)
}

const specPath = process.argv[2] || 'examples/cross-platform/portable-skill-spec.json'
const spec = JSON.parse(readFileSync(specPath, 'utf8'))
const runtime = spec?.runtimeContract

if (!runtime) fail('runtimeContract is required')
if (runtime.stateScope !== 'project-only') fail('runtimeContract.stateScope must be "project-only"')
if (runtime.sharedState !== 'forbidden') fail('runtimeContract.sharedState must be "forbidden"')
if (runtime?.persistence?.mode !== 'file-backed') fail('runtimeContract.persistence.mode must be "file-backed"')
if (!runtime?.persistence?.baseDir || typeof runtime.persistence.baseDir !== 'string') {
  fail('runtimeContract.persistence.baseDir must be a non-empty string')
}
if (!runtime?.determinism?.resumeFromArtifactsOnly) {
  fail('runtimeContract.determinism.resumeFromArtifactsOnly must be true')
}

console.log(`portable spec OK: ${specPath}`)
