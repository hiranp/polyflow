# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `assets/examples/software-dev-pipeline.js`: full SDLC workflow with
  spec-intake → recall → plan → execute → verify → persist cycle
- `assets/templates/workflow-spec.template.md`: topology-first design spec
  template with sign-off gate
- `assets/templates/memory-entry.schema.json`: stable JSON Schema for scoped
  memory entries
- `assets/templates/memory-index.example.jsonl`: example memory store content
- `scripts/validate-workflow-spec.mjs`: linter for workflow design specs
- `scripts/estimate-cost.mjs`: static pre-run cost estimator for workflow files
- `scripts/grade-evals.mjs`: automated evaluation grading script
- Patterns 13-16 in `references/patterns.md`: GSD spec-driven pipeline,
  two-stage review, pressure-test, memory-augmented pre-flight
- Pattern 17 in `references/patterns.md`: generalized MCP tool call in a leaf
  `agent()` stage for deterministic, portable MCP integration
- `examples/cross-platform/runner-kilocode-runbook.md`: Kilo Code adapter
  runbook
- `examples/cross-platform/runner-gumloop-runbook.md`: Gumloop adapter runbook
- OpenCode adapter coverage in conformance checklist
- `examples/use-cases/README.md`: six high-value use case scenarios with
  pattern recommendations
- `docs/FRAMEWORK-COMPARISON.md`: polyflow vs Superpowers vs Vanilla
  Spec-Driven comparison
- `docs/DEVELOPMENT-PLAN.md`: architecture and implementation plan document

### Changed
- SKILL.md: added topology-first design gate (Step 2 hard checkpoint), scope
  discipline section, state externalization guidance, scoped memory contract
  guidance, Nyquist verification principle
- `references/patterns.md`: expanded from 12 to 17 patterns
- `assets/examples/README.md`: updated from six to seven examples
- `examples/cross-platform/ADAPTER-CONFORMANCE-CHECKLIST.md`: added Kilo Code,
  Gumloop, and OpenCode rows
- `scripts/validate-workflow.mjs`: added loop safety checks, result filtering
  warnings, and phase title consistency checks

## [0.1.0] - 2026-05-23

### Added
- Cross-platform support: portable spec, adapter conformance checklist, and
  per-platform runbooks for Claude Code, Codex, Copilot, and Gemini
- `scripts/validate-workflow.mjs` linter
- `scripts/scaffold-evals.mjs` eval scaffolding generator
- Six complete example workflows in `assets/examples/`
- Starter evaluation test cases in `evals/evals.json`
- CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md
- GitHub issue templates and CI workflow
