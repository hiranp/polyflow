# Workflow Design Spec — {name}

Use this template before writing a workflow file. Fill it out, review it with a
human, and only then start the JavaScript.

## 1. Goal

- Workflow name:
- What outcome should this workflow produce?
- Why is a workflow the right tool instead of one `agent()` call or a plain skill?

## 2. Unit Of Work

- What does one subagent do once?
- Name the unit concretely:

## 3. Item Count And Source

- Is the count known up front or discovered dynamically?
- Where do the items come from?
- Input shape (`args`, file, nested workflow, generated list):

## 4. Topology Choice

- Topology: `fan-out` | `pipeline` | `loop-until-target` | `loop-until-budget` | `loop-until-dry` | `nested` | `hybrid`
- Why this topology fits the job:

## 5. Barrier Justification

- Does any later stage need the entire prior result set at once? `yes` / `no`
- If yes, which stage needs it and why?
- If no, why is `pipeline()` the right default?

## 6. Stage Plan

| Stage | Input | Output | Needs schema? | Model | Notes |
|---|---|---|---|---|---|
| | | | | | |

## 7. Verification Strategy

- How will this workflow verify its results automatically?
- Validation type: `tests` | `compiler/lint` | `skeptic vote` | `cross-check` | `human checkpoint between runs`
- What is the cheapest falsifying check?

## 8. Cost And Safety

- Which stages are good `model: 'haiku'` candidates?
- Where could prompt bloat happen?
- What are the loop stop conditions and hard caps?
- Does any stage need `isolation: 'worktree'`?

## 9. Output Contract

- What fields must the workflow return?
- What artifacts should it externalize to disk, if any?

## Sign-Off

- [ ] The workflow shape is explicit.
- [ ] The barrier decision is explicit.
- [ ] Every structured stage has a schema plan.
- [ ] The verification method is explicit.
- [ ] The stop conditions are explicit.
- [ ] A human has reviewed this spec before coding starts.
