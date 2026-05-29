# Gumloop Adapter Runbook

## Intent

Adapt a polyflow workflow to Gumloop by mapping deterministic stages onto
workbook tabs, subflows, and nodes while keeping the same file-backed memory
contract for recall and persistence.

## Grounded platform facts

- Gumloop workflows live in workbooks with a visual canvas and multiple tabs.
- Gumloop distinguishes deterministic workflows from open-ended agents.
- Gumloop supports MCP integrations, custom MCP servers, and a built-in code sandbox.
- Gumloop supports run history, checkpoints, resume, triggers, and agent nodes.

## Recommended mapping

- `pipeline()` → chained nodes or subflows in one workbook tab.
- `parallel()` → parallel branches or per-item subflows that merge later.
- `agent()` → use `Ask AI`/AI nodes for deterministic leaf work; use an Agent node
  only when the step genuinely needs open-ended tool choice.
- `workflow()` → subflow or separate workbook tab invoked from the parent flow.

## Memory contract

Use the same durable artifacts as polyflow:

- Recall from `.planning/memory/index.jsonl` before the main plan/execute work.
- Keep `assets/templates/memory-entry.schema.json` as the stable entry contract.
- Append one compact entry after verification, not during every intermediate node.

## Procedure

1. Create a workbook with tabs for `Spec Intake`, `Recall`, `Plan`, `Execute`,
   `Verify`, and `Persist`.
2. Use input nodes to capture the approved spec path or spec text.
3. In `Spec Intake`, normalize the approved spec into structured output.
4. In `Recall`, read `.planning/memory/index.jsonl` through the code sandbox or
   a connected storage integration, then retrieve the most relevant entries.
5. In `Plan`, generate file-scoped tasks and write `.planning/PLAN.md`.
6. In `Execute`, use one branch or subflow per task. Merge completed task outputs
   only after each branch writes its own checkpoint artifact.
7. In `Verify`, run one verification node over the completed artifacts, then fan
   out separate AI checks for each reported failure that needs adversarial review.
8. In `Persist`, append one JSONL entry matching the memory schema.

## MCP guidance

- Attach MCP integrations or custom MCP servers only to the steps that need them.
- Keep deterministic orchestration in the workbook; do not hand the full flow to
  a general-purpose agent if a node graph can express it.
- If using an Agent node, give it descriptive workflow tools and a strict output
  contract so it behaves like a polyflow leaf stage, not the whole orchestrator.

## Example translation: API contract drift detector

- Input node: target API specs or endpoints.
- Fan-out subflow: compare each implementation artifact to its contract.
- Merge node: collect all drifts.
- Verify subflow: re-check each claimed drift.
- Output node: confirmed drifts only.

## Known gaps vs Claude Code Workflow

- Gumloop's visual canvas is explicit and durable, but the orchestration is node-based,
  not plain JavaScript.
- Agent nodes can be more adaptive than polyflow leaf stages; keep them narrowly scoped.
- Artifact storage may use Gumloop storage or sandbox files rather than repo-local files,
  depending on deployment.
