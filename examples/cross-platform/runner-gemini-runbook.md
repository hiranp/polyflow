# Gemini Adapter Runbook Example

## Intent

Emulate deterministic workflow orchestration using session-per-unit execution and artifact passing.

## Procedure

1. Start one clean session per review dimension.
2. Save each result as `artifacts/review/<dimension>.json`.
3. Aggregate findings into `artifacts/review/all-findings.json`.
4. Start one clean session per finding for adversarial verification.
5. Save each verdict to `artifacts/verify/<id>.json`.
6. Aggregate confirmed findings into `artifacts/final.json` and `artifacts/final.md`.

## Reliability guardrails

- Enforce schema validation after each session.
- Retry once on schema mismatch, then mark as failed.
- Keep strict stop conditions (`maxUnits`, `maxTokens`, `maxDuration`).
