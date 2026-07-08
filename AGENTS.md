# AGENTS.md

## Project goal

Build only the interactivity layer for an interactive programming tutorial platform.

The first POC should prove this flow:

1. Teacher records editor/file actions on a timeline.
2. Learner replays the teacher timeline.
3. Learner pauses playback.
4. Learner edits their own workspace.
5. Learner saves only their changes as a delta/snapshot.
6. Teacher timeline remains unchanged.
7. Learner changes remain recoverable after teacher playback resumes.

## Source constraints

You are working with minimal local tools only:

- read
- write
- edit
- bash
- todo
- Playwright CLI/tests where available

Do not depend on web search, external fetch, planning-mode web tools, or online documentation.

## Scope for this session

Build the interactivity layer only.

Allowed:

- local event recorder
- local timeline playback
- local learner pause/edit mode
- local learner delta/snapshot save/restore
- localStorage persistence for POC
- Playwright tests
- small debug UI

Not allowed in this POC:

- AI tutor layer
- Flue integration
- AI SDK integration
- production backend APIs
- account/auth work
- cloud storage
- analytics
- terminal recording
- iframe internals recording
- patch-based merge engine
- broad TutorialKit refactors

## Architectural rules

### Teacher timeline is immutable

Teacher recording data must never be modified by learner actions.

### Learner work is separate

Learner changes must be saved as learner-owned deltas/snapshots keyed by:

- lesson id
- teacher recording id/version
- teacher timestamp
- base teacher files hash

### No silent overwrite

Teacher playback must not silently destroy saved learner changes.

For the first POC, use separate conceptual modes:

- Teacher Playback
- My Workspace

### File-level deltas first

Use file-level `addedOrModified` and `removed` deltas for the first POC.

Do not implement fine-grained text patches yet.

### Use localStorage first

Use localStorage keys:

- `interactive-poc.teacherRecording`
- `interactive-poc.learnerDeltas`

Backend storage comes only after the full POC is validated.

### Prefer wrapping existing callbacks

Start from TutorialKit workspace/editor callbacks.

Prefer editing:

- `packages/react/src/Panels/WorkspacePanel.tsx`
- small files under `packages/runtime/src/interactive-timeline/`

Avoid editing CodeMirror internals unless the existing editor callbacks are insufficient.

## Testing rules

Every phase must add or update a Playwright test.

Do not claim a phase is complete unless:

1. The app builds or runs.
2. Relevant Playwright test passes or has a clearly documented blocker.
3. `localStorage` data shape can be inspected.
4. `git diff --stat` is small and explainable.

## Path convention

Normalize internal file paths to leading-slash form:

```text
/src/App.jsx
/package.json
```

If a snapshot API returns paths without leading slashes, normalize before diffing or saving deltas.

## Programmatic-change guard

Playback-applied file changes must not be recorded as teacher events or learner edits.

Use an explicit guard such as:

```text
origin: "playback"
suppressRecording = true
```

## Debug UI is acceptable

For the POC, add crude visible controls:

- Start Recording
- Stop Recording
- Play Recording
- Pause
- Save Learner Delta
- Restore Learner Delta

Production UI can come later.

## Stop conditions

Pause and ask for product/architecture input only if the answer materially changes the architecture.

Examples:

- whether learner workspace should be separate or overlaid
- whether backend persistence must be included immediately
- whether exact terminal replay is in-scope

Do not ask generic questions before doing local inspection.
