# Copilot Adapter Runbook Example

## Intent

Implement portable multi-stage orchestration using VS Code tasks/files as explicit state.

## Procedure

1. Prepare files:
- `artifacts/review-input.json`
- `artifacts/review-results.json`
- `artifacts/verify-results.json`
- `artifacts/final-report.md`

2. Review stage:
- For each dimension, prompt Copilot to generate structured findings into review-results.
- Validate JSON shape after each write.

3. Verify stage:
- For each finding, run adversarial verification and append verdict object.

4. Synthesize stage:
- Keep only `isReal === true`.
- Emit markdown summary and machine-readable final JSON.

## Optimization notes

- Use minimal schemas and short prompts for high-volume checks.
- Keep heavy synthesis in one final pass.
- Run lint/tests only once per batch unless a finding touches critical files.
