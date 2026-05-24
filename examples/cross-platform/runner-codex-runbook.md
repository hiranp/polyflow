# Codex Adapter Runbook Example

## Intent

Execute the portable review-and-verify workflow in Codex by using explicit stage artifacts.

## Runbook

1. Create `artifacts/review/` and `artifacts/verify/`.
2. For each dimension (`bugs`, `security`, `tests`):
- Run one isolated task to produce `artifacts/review/<dimension>.json` matching findings schema.
3. Merge all findings into `artifacts/review/all-findings.json`.
4. For each finding in merged file:
- Run one isolated verification task.
- Save result to `artifacts/verify/<finding-id>.json` matching verdict schema.
5. Produce `artifacts/final.json` with confirmed findings only.

## Model mapping

- Review: balanced model class.
- Verify: small-fast model class.

## Determinism rules

- No random/time-based branching.
- No implicit memory handoff.
- Every stage reads only input artifacts and writes output artifacts.
