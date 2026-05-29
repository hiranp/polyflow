# polyflow

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](CONTRIBUTING.md)

A **skill** that teaches Claude, Codex, Copilot, and Gemini to author **workflows** -- deterministic
multi-agent orchestration scripts that fan work out to fresh-context subagents
under plain JavaScript control flow.

Design principle: **topology before coding**. Pick the workflow shape first
(fan-out, pipeline, or loop), capture it in a workflow spec, then write the
workflow file.

A workflow is a JavaScript file. The loops, the conditionals, the fan-out are
ordinary code that you control. Only the leaf `agent()` calls spend model tokens,
and each one runs in its own clean context window. The result is multi-agent work
that behaves the same way every run and can be resumed if it stops partway.

This skill carries the file format, the judgement calls, and a tested authoring
procedure, so you can just ask Claude to "create a workflow for X" and get a
correct, runnable file back.

## Contents

| Path | What it is |
| --- | --- |
| `SKILL.md` | Skill entry point: the procedure Claude follows to design and write a workflow |
| `references/api-reference.md` | Complete manual: every global, every option, every cap and constant |
| `references/patterns.md` | Copy-paste orchestration patterns (fan-out, pipeline, loop-until-budget, judge panel, and more) |
| `assets/templates/` | Starter files for the three core shapes: fan-out, pipeline, loop |
| `assets/examples/` | Seven complete runnable example workflows |
| `scripts/validate-workflow.mjs` | Linter: checks a workflow file against the parser's hard rules before you run it |
| `scripts/validate-workflow-spec.mjs` | Spec validator: checks required workflow-spec sections and sign-off completeness |
| `scripts/estimate-cost.mjs` | Static estimator: projects agent count, fan-out/loop shape, and rough run cost |
| `scripts/scaffold-evals.mjs` | Generates eval scaffolding from `evals/evals.json` |
| `examples/cross-platform/` | Portable canonical spec and per-platform adapter notes (Claude / Codex / Copilot / Gemini / Kilo / Gumloop / OpenCode) |
| `evals/evals.json` | Starter evaluation test cases |

## Install

```bash
git clone https://github.com/hiranp/polyflow.git
mkdir -p ~/.claude/skills
cp -R polyflow ~/.claude/skills/polyflow
```

The next time Claude Code starts the skill is available.

## Quick start

### 1 -- Enable the Workflow tool

The tool is off by default and requires an environment variable:

```bash
# per session
export CLAUDE_CODE_WORKFLOWS=1
claude
```

Or set it permanently in `.claude/settings.local.json`:

```jsonc
{ "env": { "CLAUDE_CODE_WORKFLOWS": "1" } }
```

### 2 -- Ask an AI to build a workflow

> "Create a workflow that reviews my branch across bugs, security, and tests, then verifies each finding."

Claude (or any supported AI) uses this skill to design, write, and validate the file, then runs it.
Watch live progress with `/workflows`.

### 3 -- Create and validate the workflow spec first

Use [assets/templates/workflow-spec.template.md](assets/templates/workflow-spec.template.md)
to decide topology/barrier/schema/verification before writing JavaScript.

```bash
node scripts/validate-workflow-spec.mjs <path-to-WORKFLOW-SPEC.md>
```

Fix every reported issue before writing the workflow file.

### 4 -- Lint before running

```bash
node ~/.claude/skills/polyflow/scripts/validate-workflow.mjs <path-to-file.js>
```

Exit 0 means the file is clean. Fix any reported errors before invoking the workflow.

### 5 -- Estimate cost before long runs

```bash
node ~/.claude/skills/polyflow/scripts/estimate-cost.mjs <path-to-file.js>
```

This gives a static estimate of model mix, fan-out/loop amplification, and rough
per-run cost range.

## How it works

```
You --> AI (with polyflow skill)
              |
              +-- designs the topology (fan-out / pipeline / loop)
              +-- writes a .js workflow file
              +-- calls Workflow({ scriptPath })
                        |
                        +-- agent("task A")  <- fresh context, own token budget
                        +-- agent("task B")  <- fresh context, own token budget
                        +-- agent("task C")  <- fresh context, own token budget
```

Each `agent()` call runs in isolation -- no shared state, no context bleed. The
orchestration logic (loops, conditions, fan-out) is plain JavaScript you can read and audit.

## Cross-platform support

Polyflow workflows are portable. The `examples/cross-platform/` directory contains:

- A canonical portable spec (`portable-skill-spec.json`)
- Per-platform runner guides for Claude Code, Codex, Copilot, Gemini, Kilo Code, and Gumloop
- An adapter conformance checklist

## Example workflows

Seven production-quality examples live in `assets/examples/`:

| Workflow | Pattern |
| --- | --- |
| `review-branch.js` | pipeline + nested parallel |
| `implement-and-review.js` | do/while loop with schema-driven exit |
| `triage-sentry.js` | list to pipeline with MCP tool call |
| `dead-code-sweep.js` | loop-until-dry with dry-streak counter |
| `api-contract-drift-detector.js` | fan-out with deliberate barrier |
| `customer-feedback-theme-extractor.js` | parallel to barrier to cluster |
| `software-dev-pipeline.js` | spec-intake to recall to execute/verify with scoped memory persist |

## Requirements

- [Claude Code](https://claude.ai/code) 2.1.149+ (or compatible Codex / Copilot / Gemini runtime)
- Node.js 18+ (for validation, estimation, and eval scaffold scripts)

## Contributing

Pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)

## Credits

Inspired by [Ray Amjad](https://www.youtube.com/@RAmjad) and [Claude's workflow capabilities](https://claude.ai/blog/claude-code-workflows).
Built with community feedback, testing, and ideas.
