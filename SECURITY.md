# Security Policy

## Supported versions

Only the latest version on the `main` branch receives security updates.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report vulnerabilities privately by emailing the maintainers or using
[GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability).

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

You can expect an acknowledgement within 72 hours and a resolution timeline
within 14 days for confirmed issues.

## Scope

This project is a **skill / script library** -- it does not run a server,
handle user authentication, or process untrusted network input. The primary
attack surface is:

- Workflow `.js` files executed by an AI agent runtime
- The `validate-workflow.mjs` linter (reads files from disk)
- The `scaffold-evals.mjs` script (reads/writes files from disk)

If you discover a way a malicious workflow file could escape its intended
sandbox or a script could be exploited for path traversal, that is in scope.
