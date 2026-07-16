# AGENTS.md

## Project purpose

TutorialKit Thesis extends TutorialKit with teacher recording and learner-owned interactive lesson history.

The primary learner flow is:

1. Replay an immutable teacher timeline.
2. Pause automatically on the first learner project mutation.
3. Branch from the exact displayed teacher state.
4. Autosave learner work without modifying teacher data.
5. Create immutable checkpoints with Ctrl/Cmd+S.
6. Review, fork, restore, and synchronize learner work.
7. Resume teacher playback without losing learner history.

Keep changes focused. Avoid unrelated TutorialKit refactors. This is a thesis prototype: prioritize reliable core behavior and iteration speed over upstream-level platform, extension, CLI, and release coverage.

## Architectural invariants

### Teacher truth is immutable

Learner actions must never modify teacher recordings or teacher timeline events.

Teacher positions are identified by both:

- `teacherTimestampMs`
- `lastAppliedTeacherEventSeq`

### Learner history is separate

Learner work uses:

- append-only branch events;
- durable working trees;
- immutable checkpoints;
- explicit parent/fork references;
- teacher-origin file hashes.

Legacy `LearnerDelta` records remain readable but must not be created for new work.

### Takeover is atomic

The first learner project mutation must pause playback and branch from the exact currently displayed teacher state before applying the edit.

Focus, cursor movement, selection, and scrolling must not pause playback or create learner history.

### Drafts and checkpoints differ

- Edits autosave a durable draft.
- Only Ctrl/Cmd+S creates a checkpoint.
- Repeated saves without changes create no duplicate checkpoint.
- Run and Save remain independent.

### Playback cannot destroy learner work

Play restores teacher files at the current Lesson position and resumes playback. Learner branches remain recoverable through My Work.

History navigation changes editor files only. It must not seek Lesson time or media.

### Programmatic changes need explicit origins

Teacher playback, history restoration, resets, and runtime synchronization must use explicit CodeMirror transaction origins.

Programmatic document changes must never be recorded as user edits.

Presentation-only decorations, including learner diffs and cursor presence, must never change `state.doc`, undo history, execution, or persistence.

### Persistence is local-first

IndexedDB is authoritative for learner history. Remote synchronization may fail without making local work unavailable.

Normalize internal file paths to leading-slash form:

```text
/src/App.jsx
/package.json
```

## Important locations

```text
packages/runtime/src/interactive-timeline/
packages/runtime/src/interactive-timeline/learner-history/
packages/react/src/Panels/useInteractivePoc.ts
packages/react/src/Panels/interactive/history/
packages/react/src/core/CodeMirrorEditor/
packages/astro/src/vite-plugins/interactive-persistence.ts
e2e/interactive-poc.spec.ts
docs/interactive-poc-architecture.md
```

Prefer pure runtime functions for materialization, branching, diffing, and persistence behavior. Keep React responsible for orchestration and presentation.

## Development commands

Run the default prototype validation from the repository root:

```bash
pnpm lint
pnpm build
pnpm test:prototype
```

`pnpm test:prototype` runs the React and runtime unit suites that protect the interactive learner experience.

Start the local application:

```bash
pnpm build
pnpm --filter ./e2e dev
```

Open:

```text
http://localhost:4329
```

Run targeted interactive Playwright coverage:

```bash
cd e2e
TUTORIALKIT_E2E_DEFAULT_ONLY=true \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome \
pnpm exec playwright test interactive-poc.spec.ts --project Default
```

Run targeted Playwright scenarios when UI behavior changes; the complete E2E suite is not part of every pull request. CLI integration validation is available as a manually dispatched GitHub workflow for milestone work.

See [`docs/prototype-development-workflow.md`](docs/prototype-development-workflow.md) for the validation scope, exceptions, and pull-request workflow.

## Definition of done

Do not claim completion unless:

1. Relevant unit tests pass.
2. The workspace builds.
3. UI behavior changes have relevant targeted Playwright coverage, or a documented blocker.
4. `git diff --check` passes.
5. Persistence and teacher-immutability guarantees remain intact.
6. The diff is focused and explainable.
7. Documentation is updated when behavior or architecture changes.

## Git workflow

Use this workflow for all non-trivial changes:

```text
main
  ↓
feature branch
  ↓
local lint/tests/build
  ↓
push
  ↓
pull request
  ↓
single Ubuntu Prototype CI check
  ↓
merge
  ↓
automatic remote branch deletion
```

Do not develop directly on `main`.

Do not force-push or rewrite shared history. Do not bypass a product-relevant Prototype CI failure. An unrelated inherited-tooling or runner failure may be accepted only with an explicit, documented reason.

Do not expand routine PR validation into OS/Node matrices, full CLI generation, VS Code extension builds, docs/demo builds, or the complete Playwright suite unless the project moves beyond prototyping or a change directly affects that surface.

Keep tests with the feature they validate. Use separate documentation or behavior-neutral cleanup commits when appropriate.

## Working style

Inspect local code and documentation before asking generic questions.

Ask for product or architecture input only when the answer materially changes data ownership, history semantics, persistence, playback behavior, or learner workspace behavior.

Never commit secrets, generated build output, Playwright reports, temporary files, or local environment configuration.
