# Framework Comparison

This document compares polyflow's workflow-authoring model with Superpowers and
plain spec-driven development.

| Dimension | polyflow | Superpowers | Vanilla Spec-Driven |
| --- | --- | --- | --- |
| Primary abstraction | Deterministic JavaScript workflows | Skill-driven SDLC methodology | Human-authored spec and phase checklist |
| Topology control | Explicit `pipeline()` / `parallel()` / loops | Mostly encoded in skills and process | Manual, implicit in the written plan |
| Resume model | Workflow run resume and replay-safe artifacts | Worktrees, skill-guided continuation | Manual restart from the written spec |
| Verification | Explicit verify stages, skeptic loops, validator tooling | TDD-first and review skills | Whatever the author writes into the spec |
| Memory across runs | Scoped recall/persist contract with file-backed artifacts first | Richer memory and skill ecosystem, often conversationally mediated | Usually none unless the team invents it |
| Token discipline | Author chooses model per leaf stage, cost estimator flags waste | Strong process discipline, but no standalone static estimator in this repo | Depends on user prompt quality |
| Platform portability | Claude Code, Codex, Copilot, Gemini, Kilo, Gumloop, OpenCode via adapters | Broad harness support, but methodology-first rather than workflow-spec-first | Portable anywhere text instructions can be used |
| Best fit | Repeatable multi-agent jobs with explicit orchestration and artifacts | End-to-end coding workflow automation | Lightweight projects that need structure without tooling overhead |

## Selection guidance

- Choose polyflow when the workflow shape itself is the product and you need
  deterministic stages, inspectable artifacts, and replay-safe behavior.
- Choose Superpowers when the main problem is day-to-day software delivery
  discipline across brainstorming, planning, TDD, implementation, and review.
- Choose Vanilla Spec-Driven when the project is small enough that a well-written
  spec and human-guided execution provide sufficient control.

## How they compose

- Superpowers-style planning and review discipline can feed polyflow workflows.
- A vanilla `WORKFLOW-SPEC.md` can be the approval gate before writing a
  polyflow workflow.
- Polyflow's scoped memory contract can preserve durable artifacts even when the
  team uses a lighter-weight prompting system for daily work.
