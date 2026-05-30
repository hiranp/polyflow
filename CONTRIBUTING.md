# Contributing to polyflow

Thank you for your interest in contributing! This document covers how to get
started, what kinds of contributions are most useful, and what to expect from
the review process.

## Ways to contribute

- **Bug reports** -- if a workflow fails or a skill step produces wrong output, open an issue
- **Documentation fixes** -- typos, unclear wording, outdated steps
- **New example workflows** -- add to `assets/examples/` or `examples/use-cases/`
- **Pattern additions** -- new orchestration shapes in `references/patterns.md`
- **Cross-platform adapters** -- improve Codex, Copilot, or Gemini runbooks
- **Eval test cases** -- add cases to `evals/evals.json`

## Before you open a PR

1. **Check existing issues** to avoid duplicate work.
2. For non-trivial changes, open an issue first to discuss the approach.
3. Run the linter on any workflow files you add or modify:

   ```bash
   node scripts/validate-workflow.mjs <path-to-file.js>
   ```

4. Keep pull requests focused -- one logical change per PR.
5. If you change `examples/cross-platform/portable-skill-spec.json`, validate the
   runtime contract:

   ```bash
   node scripts/validate-portable-spec.mjs examples/cross-platform/portable-skill-spec.json
   ```

## Development setup

```bash
git clone https://github.com/hiranp/polyflow.git
cd polyflow
# No build step -- this is a skill/script repo. Node.js 18+ required for scripts.
node scripts/validate-workflow.mjs assets/examples/review-branch.js
```

## Adding a new example workflow

1. Create the file in `assets/examples/<name>.js`.
2. Make sure it passes `validate-workflow.mjs` with exit code 0.
3. Add a row to the table in `assets/examples/README.md` noting the topology and
   what technique it demonstrates.
4. If it introduces a new pattern shape, add a copy-paste snippet to
   `references/patterns.md`.

## Commit style

Use short, imperative subject lines (50 chars or less):

```
Add loop-with-budget-guard pattern to patterns.md
Fix validate-workflow phase-name regex
```

No need for a commit body unless the change requires explanation.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
By participating you agree to abide by its terms.

## License

By contributing you agree that your contributions will be licensed under the
[MIT License](LICENSE).
