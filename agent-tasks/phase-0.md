# Phase 0: Local Repository Understanding

## Agent task

Inspect the local project and confirm integration points.

Use:

```bash
bash scripts/phase0-grep.sh
```

Then inspect:

- `packages/react/src/Panels/WorkspacePanel.tsx`
- `packages/runtime/src/store/index.ts`
- `packages/runtime/src/store/editor.ts`
- `packages/runtime/src/store/tutorial-runner.ts`
- `packages/react/src/core/CodeMirrorEditor/index.tsx`

## Deliverable

Create or update `docs/local-findings.md` with:

- exact editor callback locations
- exact snapshot API shape
- exact path convention used locally
- where debug controls will be placed
- how to run the app
- how to run Playwright

Do not write feature code in Phase 0.
