# Examples (new)

This folder adds portable, cross-runtime examples and additional use cases beyond the Claude-native examples in `assets/examples`.

## Structure

- `cross-platform/`
  - Canonical portable orchestration spec.
  - One adapter-style example for Claude Code, Codex, Copilot, and Gemini.
- `use-cases/`
  - Additional practical workflow use cases that can be implemented with this skill pattern.

## Why this folder exists

The existing `assets/examples` are excellent Claude Workflow examples.
This new folder demonstrates how to generalize the same orchestration ideas to other agent runtimes.

## Best Use Cases vs. Anti-Patterns

When deciding whether to use a deterministic workflow pattern as shown in these examples, consider the problem domain:

### Optimal Use Cases
These patterns excel at **repeatable, scalable, and well-understood processes**. They are cheaper, faster, and more reliable than conversational agents for:
*   "Review this branch across 5 dimensions, verify each finding, and summarize."
*   "Sweep the codebase for dead code, repeating until no new instances are found."
*   "Extract themes from 1,000 customer feedback tickets in parallel."

### Anti-Patterns
Do not force these static workflow patterns onto **dynamic, open-ended problem solving**. Use a standard conversational agent or ReAct loop instead for:
*   "Debug why this component occasionally drops state."
*   "Figure out why the CI build is failing and fix it."
*   "Design and implement a new feature based on a loose PRD."

Workflows require upfront design of the topology. If the agent needs to form a hypothesis, write a script, read an error, and pivot its strategy on the fly, a workflow is the wrong tool.
