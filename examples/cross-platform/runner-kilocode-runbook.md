# Kilo Code Adapter Runbook

## Intent

Run a polyflow-style deterministic workflow in Kilo Code by keeping orchestration
explicit in artifacts, using fresh tasks or cloud agents for unit work, and
preserving the scoped memory contract across runs.

## Grounded platform facts

- Kilo Code runs in VS Code, CLI, and cloud agents.
- Kilo exposes multiple agent modes such as Ask, Architect, Code, and Debug.
- Kilo supports many model providers and BYOK via Kilo Gateway.
- Kilo documents automation and MCP support under its Automate docs.

## Recommended mapping

- `agent()` → one fresh Kilo task, one fresh cloud agent run, or one clearly
  separated session when context isolation matters.
- `pipeline()` → ordered artifact-driven stages. Each stage reads the prior
  stage's outputs and writes the next outputs immediately.
- `parallel()` → multiple Kilo tasks or cloud agents launched against the same
  input set, coordinated through files rather than chat history.
- `phase()` → a named artifact directory or file prefix such as
  `artifacts/plan/`, `artifacts/execute/`, `artifacts/verify/`.

## Memory contract

Use the same file-backed format as polyflow:

- Recall from `.planning/memory/index.jsonl` before main work.
- Validate entries against `assets/templates/memory-entry.schema.json`.
- Persist at most one compact entry per run after verification.

## Procedure

1. Install Kilo Code in VS Code or use the Kilo CLI.
2. Connect the required model provider and any MCP servers before starting.
3. Prepare artifacts:
   - `.planning/spec.normalized.json`
   - `.planning/PLAN.md`
   - `.planning/task-<id>.md`
   - `.planning/VERIFICATION_REPORT.md`
   - `.planning/memory/index.jsonl`
4. Start in `Architect` or equivalent planning mode to normalize the approved spec.
5. Run a recall task against `.planning/memory/index.jsonl` and save the result to
   `.planning/memory/recall.json`.
6. Generate file-scoped tasks and save them to `.planning/PLAN.md`.
7. For execution, launch one fresh Kilo task per planned item. If two tasks may
   touch the same file, do not run them in parallel.
8. Save each execution result to `.planning/task-<id>.md` immediately.
9. Run one verification task over the completed artifacts. If failures appear,
   run separate Kilo verification tasks to re-check each failure.
10. Append one memory entry to `.planning/memory/index.jsonl` after verification.

## Model guidance

- Use a higher-capability model for spec intake, planning, and final verification.
- Use lower-cost models for mechanical recall, classification, and adversarial
  failure checks.

## Known gaps vs Claude Code Workflow

- No direct `pipeline()`/`parallel()` primitive; you emulate both with explicit
  tasks and artifact passing.
- Resume semantics depend on Kilo task/session history rather than workflow-run
  cache replay.
- Progress grouping is manual; use directories and filenames as your phase board.

## Migration checklist

- Keep the topology and barrier decision in `WORKFLOW-SPEC.md`.
- Keep every inter-stage handoff in files, not in chat memory.
- Preserve the memory contract exactly.
- Prefer fresh tasks for leaf work instead of one long chat thread.
- Use Kilo modes to separate planning from implementation, but do not let modes
  replace explicit artifacts.
