# Platform Adapter Conformance Checklist

Use this checklist to verify that adapter outputs from Claude Code, Codex, Copilot, Gemini, Kilo, Gumloop, and OpenCode conform to the canonical spec in:

- examples/cross-platform/portable-skill-spec.json

## How to use

1. Run the same canonical task through each platform adapter.
2. Save each platform output in a dedicated artifacts directory.
3. Evaluate each checklist item as PASS/FAIL.
4. Record evidence for every PASS/FAIL decision.
5. Summarize gaps and remediation actions.

## Conformance dimensions

- Input contract parity: Adapter accepts required canonical inputs with equivalent meaning.
- Stage topology parity: Adapter preserves stage order and parallelization intent.
- Schema parity: Stage outputs validate against canonical JSON schemas.
- Determinism parity: No time/random branching in orchestration decisions.
- Stop-condition parity: Loop/budget/max-round guards are preserved.
- Error-handling parity: Null/failed stage outputs are handled safely.
- Model-policy parity: Semantic model classes map correctly to platform-specific models.
- Artifact parity: Intermediate and final outputs are persisted for replay/audit.
- Memory-contract parity: Recall reads from the stable memory store and persistence writes compatible entries back.
- Project-scope parity: Runtime writes only inside project-local artifact roots.
- Shared-state parity: Adapter rejects global/singleton/shared-memory state.

## Checklist matrix

- C01 Required canonical inputs are accepted and parsed
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

- C02 Stage sequence matches canonical definition
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

- C03 Parallel stages preserve intended fan-out behavior
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

- C04 Review stage output validates against findings schema
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

- C05 Verify stage output validates against verdict schema
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

- C06 Null/skip outputs do not crash orchestration
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

- C07 Stop conditions terminate as expected
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

- C08 Deterministic execution (no random/time branching)
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

- C09 Model mapping follows semantic classes
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

- C10 Final output includes required canonical fields
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

- C11 Artifacts are persisted for replay and audit
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

- C12 Retry/failure paths produce explicit error status
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

- C13 Memory contract persists and recalls compatible entries
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

- C14 Runtime writes are confined to project root artifacts only
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

- C15 Adapter rejects global/shared state dependencies
  - Claude: [ ] PASS [ ] FAIL
  - Codex: [ ] PASS [ ] FAIL
  - Copilot: [ ] PASS [ ] FAIL
  - Gemini: [ ] PASS [ ] FAIL
  - Kilo: [ ] PASS [ ] FAIL
  - Gumloop: [ ] PASS [ ] FAIL
  - OpenCode: [ ] PASS [ ] FAIL
  - Evidence:

## PASS/FAIL guidance

- PASS: Requirement is fully met with concrete artifact evidence.
- FAIL: Requirement is unmet, partially met, or unverifiable.

## Evidence expectations

For each row, include:

- Artifact path(s) inspected.
- Validation output (schema check, logs, or transcript excerpt).
- Brief justification for PASS/FAIL.

## Exit criteria

Adapter is conformant when:

- All critical checks pass: C01-C08 and C10.
- For workflows that use cross-run memory, C13 also passes.
- For project-scoped runtimes, C14 and C15 also pass.
- No more than one non-critical check fails.
- Every failed check has a documented remediation owner and ETA.
