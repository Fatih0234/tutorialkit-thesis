# Prototype development workflow

TutorialKit Thesis is currently a thesis prototype, not a cross-platform framework release. Its workflow therefore protects the learner-history architecture while keeping feedback fast enough for frequent iteration.

## Routine pull-request validation

Every pull request and push to `main` runs one **Prototype CI** job on Ubuntu with Node.js 22:

1. install the locked dependencies;
2. run the practical ESLint policy;
3. build the TutorialKit workspace packages;
4. run the React and runtime unit suites.

Run the same checks locally from the repository root:

```bash
pnpm lint
pnpm build
pnpm test:prototype
```

The practical lint policy keeps correctness checks, including unused variables, React hooks, braces, block-scoped cases, and unsafe control flow. Cosmetic formatting preferences are not CI blockers.

## Tests chosen for a change

Use the smallest relevant validation in addition to the routine checks:

- Add or update unit tests for pure runtime, persistence, materialization, diffing, and editor-origin behavior.
- Run targeted scenarios from `e2e/interactive-poc.spec.ts` when learner-facing interaction behavior changes.
- Run the standalone Python scenario when Python or Pyodide delivery changes.
- Use the manually dispatched **Manual CLI Integration Test** workflow only when changing CLI generation or preparing a milestone.

The full Playwright suite, OS/Node matrices, docs/demo builds, CLI generation, and VS Code extension build are not routine pull-request requirements. They can be run deliberately when a change affects those surfaces or when preparing a release-quality milestone.

## Git workflow

For non-trivial work:

```text
main
  -> focused feature branch
  -> relevant local validation
  -> push
  -> pull request
  -> Prototype CI
  -> merge
  -> automatic remote branch deletion
```

Do not develop directly on `main`, force-push shared work, or rewrite shared history. Keep behavior, its tests, and necessary documentation together. Separate unrelated cleanup from feature changes.

## Handling failures

Fix failures that indicate a regression in the changed product behavior, build, types, lint correctness rules, or core unit tests.

Do not delay prototype work solely to repair unrelated inherited TutorialKit tooling or runner-specific infrastructure. If such a failure must be accepted, record the reason in the pull request. Repeated or product-relevant failures should be fixed rather than waived.

## When to expand CI

Revisit broader automated validation when the project approaches public deployment, supports multiple development environments as a product requirement, publishes TutorialKit packages, or starts maintaining the inherited CLI and VS Code extension as first-class deliverables.
