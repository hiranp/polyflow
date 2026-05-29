# Additional Use Cases

These are high-value scenarios where deterministic multi-agent orchestration is a good fit.

- Incident postmortem assistant: Gather logs, cluster root causes, generate mitigation actions, verify evidence links.
	Pattern: fan-out then synthesize, followed by pressure-test or adversarial verify for high-risk claims.
	Closest starting point: `customer-feedback-theme-extractor.js` for clustering, then `review-branch.js` for verification.
	Recommended additions: memory recall/persist for recurring incidents.

- Release readiness gate: Parallel checks (tests, security, docs, changelog), then final go/no-go synthesis.
	Pattern: pipeline with per-dimension review and verify, or barrier + synthesis if go/no-go needs the full result set.
	Closest starting point: `review-branch.js`.
	Recommended additions: two-stage review and memory recall/persist for repeated release trains.

- Data migration dry-run auditor: Validate schema drift, detect risky transforms, generate rollback checklist.
	Pattern: barrier when you must dedup first, then verify each risky transform.
	Closest starting point: `api-contract-drift-detector.js`.
	Recommended additions: adversarial verification for rollback claims.

- API changelog and contract verifier: Compare implementation vs OpenAPI/SDK docs and create patch PR.
	Pattern: fan-out with a barrier for cross-contract comparison, then synthesize one report.
	Closest starting point: `api-contract-drift-detector.js`.
	Recommended additions: memory recall/persist to avoid rediscovering known contract gaps.

- Customer support signal miner: Summarize tickets, cluster themes, rank by business impact, produce sprint-ready issues.
	Pattern: summarize-compress between heavy stages, then synthesize.
	Closest starting point: `customer-feedback-theme-extractor.js`.
	Recommended additions: memory recall for long-running trend analysis.

- Dependency risk sweep: Enumerate dependencies, check vulnerabilities/licensing, suggest remediations.
	Pattern: tiered fan-out with cheap extraction, then synthesize and verify policy exceptions.
	Closest starting point: `review-branch.js` or `software-dev-pipeline.js` if changes are applied automatically.
	Recommended additions: pressure-test for policy exceptions and memory recall/persist for weekly sweeps.

Each can be implemented as fan-out, pipeline, or loop patterns with structured stage outputs.
