# Timeline Exercise Points

## Implementation plan

Status: implemented through Phase 8; Phase 9 remains planned

This document translates the Timeline Exercise Points product specification into a phased implementation plan for the TutorialKit Thesis prototype. It describes the intended architecture, delivery order, and boundaries without defining every UI state or edge case.

## 1. Confirmed decisions

The first version will use the following product and technical decisions:

- Exercise validation runs in WebContainer. Pyodide validation is deferred.
- Teachers author checks as code using validation files and helpers.
- Private validation files are hidden from the normal learner workspace and sanitized from learner feedback. They are not security-grade secrets against deliberate browser inspection.
- Publication requires at least one automated check.
- The starter workspace must execute successfully and must not pass all checks.
- An optional reference solution must pass all checks.
- Changes to starter files, tests, helpers, validation configuration, or the reference solution invalidate previous teacher verification.
- Learners may create files and folders according to exercise path policy, matching the existing file-tree creation experience.
- Exercise authoring activity must not become teacher timeline activity.
- Exercise content, learner attempts, and learner checkpoints remain separate from immutable teacher events and files.
- Published exercise versions are immutable. New attempts normally use the newest active version, while existing attempts remain pinned to their original version.

## 2. Architectural direction

### 2.1 Exercise points are recording metadata

Exercise points should be attached to a `TeacherRecording` as metadata rather than represented as ordinary timeline events.

A point records:

- a stable point id;
- a stable exercise id;
- `teacherTimestampMs`;
- `lastAppliedTeacherEventSeq`;
- the exercise version active when the lecture was published;
- creation metadata.

The teacher recording continues to own the immutable location of the point. Exercise instructions, starter files, tests, helpers, feedback, and reference solutions live in separate exercise records.

This keeps exercise authoring out of `TeacherRecording.events` and allows exercise content to receive new versions without rewriting a published recording.

### 2.2 Exercise drafts and versions

Exercise authoring uses a mutable local draft. Publication converts a complete draft into an immutable version.

A version contains:

- title and concise instructions;
- a learner-safe exercise explanation;
- hints and learner-facing feedback;
- starter files;
- file roles;
- private validation files;
- optional reference solution files;
- WebContainer validation configuration;
- ownership and publication metadata;
- a content hash.

A small catalog record identifies the active version of each exercise series. Advancing the active version does not modify older versions or existing attempts.

### 2.3 File roles and creation policy

Existing exercise files use one of these roles:

- `editable`: visible and editable;
- `read-only`: visible but not editable;
- `private-validation`: visible to the teacher in authoring tools but absent from the normal learner workspace.

Exercise policy also defines allowed creation paths. The default should permit creation throughout the visible exercise workspace while reserving private validation namespaces. Newly created learner files are editable by default.

The application must reject attempts to overwrite a read-only path or create content inside a private validation path. Created text files are included in autosaves, checkpoints, and validation. Directories containing files reconstruct from their file paths; standalone empty folders retain the current TutorialKit limitation unless directory persistence is expanded separately.

### 2.4 Exercise attempts reuse learner history

The existing append-only learner branch, working-tree, and checkpoint model should be reused rather than creating a second history engine.

Exercise branches gain explicit context containing:

- attempt id;
- exercise point id;
- exercise id and version;
- starter workspace hash.

They retain the exact teacher origin pair and teacher-state hash. The teacher origin proves where the exercise was reached; the exercise starter hash proves what the learner attempt started from.

Attempt status is stored separately from branch history and supports:

- active;
- skipped;
- passed.

Lecture experiments and exercise attempts are filtered into separate UI views. Exercise checkpoints do not create additional markers on the Lesson timeline.

### 2.5 Validation privacy boundary

Private validation files are not placed in the learner's `TutorialStore`, file tree, or normal editor state. During Check Solution, they are mounted with a temporary validation copy of the learner workspace and removed afterward.

Because validation runs in a browser WebContainer, a determined learner may still inspect browser or WebContainer internals. The first version guarantees UI hiding and feedback sanitization, not secure remote secrecy. The Astro persistence server must never execute arbitrary teacher-authored validation code on the host.

Implementation checkpoint:

- Phases 0–8 are implemented on `feature/timeline-exercise-points-phase-8`.
- The validation contract uses a private JavaScript module exporting a `checks` array of `{ id, run }` entries.
- The application injects the protocol runner, executes it in a temporary WebContainer directory, and classifies structured results as passed, failed, or broken.
- Lecture publication creates immutable exercise versions, pins recording points, and advances active catalog versions only after immutable records exist.
- Learner playback intercepts published points at their timestamp-and-sequence boundary and enters an isolated Exercise Mode.
- Exercise attempts reuse learner branches, working trees, checkpoints, and local-first synchronization while remaining pinned to their original exercise version.
- Passed, active, and skipped attempts drive marker and revisit behavior. Phase 9 compatibility work remains intentionally deferred.

## 3. Phased implementation

## Phase 0 — Technical specification and branch setup

Before implementing behavior:

1. Work on a focused feature branch rather than `main`.
2. Finalize the TypeScript contracts for points, drafts, versions, catalogs, attempts, and branch context.
3. Define the WebContainer validation-result protocol.
4. Define the shared IndexedDB upgrade path and migration behavior.
5. Record legacy defaults for recordings and learner branches that predate exercises.

The validation protocol should provide named checks and distinguish assertion failures from infrastructure failures. It may use a structured JSON payload or sentinel emitted by the teacher's validation entrypoint, but the application should not depend on parsing arbitrary human-readable test output.

**Phase outcome:** implementation contracts are stable enough for persistence and playback work to begin.

## Phase 1 — Exercise domain and persistence foundation

Create pure runtime modules for:

- exercise type definitions;
- path and file-role normalization;
- exercise completeness checks;
- immutable version creation;
- catalog active-version resolution;
- starter/reference workspace materialization;
- learner-safe exercise projection;
- attempt status reduction;
- exercise branch-origin validation.

Suggested runtime location:

```text
packages/runtime/src/interactive-timeline/exercises/
  types.ts
  normalize.ts
  versioning.ts
  attempts.ts
  validation.ts
  storage.ts
  index.ts
```

### Local persistence

Centralize the IndexedDB opening and upgrade logic currently duplicated by timeline and learner-history adapters. This is required because whichever adapter first opens a new database version must create every store required by that version.

Add stores for:

```text
exerciseDrafts
exerciseVersions
exerciseCatalog
exerciseAttempts
```

Current starter and reference verification runs are embedded in `ExerciseDraft.verification` and invalidated by content hashes, so the prototype does not maintain a separate check-run audit store.

Learner branch events, commits, and working trees remain in their existing stores.

### Remote prototype persistence

Extend `.interactive-data/` with exercise series, immutable versions, and attempt metadata. Add teacher-authorized APIs for full authoring records and learner-safe APIs for published exercise content.

Published versions are append-only. The active-version pointer may advance, but an existing `(exerciseId, version)` record cannot be replaced.

**Phase outcome:** exercises can be created, stored, versioned, loaded, and associated with attempts without visible product behavior.

## Phase 2 — Pausable recording and exercise-point capture

Extend `TimelineRecorder` with:

- `pause()`;
- `resume()`;
- `isPaused()`;
- logical elapsed-time accounting excluding authoring time;
- exact current timestamp and last event sequence access;
- suppression of event appends while paused.

Extend `InteractiveMediaRecorder` with equivalent pause/resume behavior, including fake-media mode. Timeline and media must resume from the same logical lecture position.

Add **Pause for Exercise** to the recording studio. Activating it captures:

- teacher timestamp and event sequence;
- visible teacher files;
- selected file and scroll position;
- presentation and whiteboard state;
- materialized execution output needed for restoration.

While paused, editor, runtime, pointer, presentation, and whiteboard activity must not append teacher events.

The paused recording surface is selection-only. It lists verified exercises owned by the teacher and associated with the current lesson. Exercise creation, starter/reference editing, and private-validation editing remain in Teacher Studio's Exercise Library and are never exposed during active recording.

Selection inserts one exercise point and resumes recording. Cancel restores the captured teacher state without adding a point. Both paths use explicit programmatic editor origins before recording resumes.

Recording Review gains visible exercise markers and indicates unfinished references.

**Phase outcome:** a teacher can insert an exercise point and continue recording without changing the recorded lecture workspace or adding authoring actions to teacher events.

## Phase 3 — Teacher exercise authoring

Create a dedicated authoring feature rather than adding all state to `useInteractivePoc.ts`.

Suggested React location:

```text
packages/react/src/Panels/interactive/exercises/
  useExerciseAuthoring.ts
  ExerciseAuthoring.tsx
  ExerciseLibrary.tsx
  ExerciseWorkspaceSelector.tsx
  ExerciseFileRoles.tsx
  ExerciseValidationPanel.tsx
```

Exercise Authoring Mode provides:

- title, concise instructions, a multiline exercise explanation, hints, and feedback fields;
- Starter, Reference Solution, and Validation workspace selectors;
- clone-current-teacher-state actions;
- independent editing of starter and reference snapshots;
- editable, read-only, and private-validation file roles;
- file and folder creation;
- validation command or entrypoint configuration;
- save draft, attach, cancel, and preview actions.

Teacher Studio gains an Exercise Library for creating and reopening prepared exercises. Recording Review can link back to the library or remove a marker, but complete exercise authoring is not embedded in active recording.

Preview as Student uses the same learner-facing projection and validation behavior but keeps its workspace and history in memory. It must not create a persisted learner attempt, checkpoint, or remote sync record.

**Phase outcome:** teachers prepare and verify exercises outside active recording, then select eligible prepared exercises at exact paused recording positions.

## Phase 4 — WebContainer validation

Add an exercise validation service around the existing TutorialStore/WebContainer ownership rather than executing checks in the persistence backend.

Validation entrypoints may import private helper modules statically, but learner project modules must be dynamically imported inside `check.run()`. This keeps missing exports, syntax errors, and learner runtime errors inside the per-check failure boundary instead of misclassifying them as broken validation infrastructure.

For each validation run:

1. Capture the submitted starter, reference, or learner files.
2. Create a reserved temporary directory in the existing WebContainer.
3. Mount the submitted files and private validation files into that directory.
4. Run the configured validation command or entrypoint with a timeout.
5. Read the structured validation result.
6. Capture diagnostics for teacher use.
7. Remove the temporary directory in a `finally` path.
8. Restore or invalidate runtime state if validation changed execution state.

The result contract has three top-level outcomes:

- `passed`: every configured check passed;
- `failed`: validation executed correctly and at least one behavioral check failed;
- `broken`: tests, helpers, configuration, runtime, timeout handling, or result reporting failed.

Teacher diagnostics may include command output, stack traces, private paths, and configuration details. Learner results include only safe check names and configured feedback.

Teacher actions are:

- **Test Starter**;
- **Test Reference** when a reference exists;
- visible validation freshness and configuration errors.

Any relevant content change marks prior verification stale. A complete exercise cannot be published until the current starter verification executes successfully without passing all checks and the current reference verification passes when applicable.

**Phase outcome:** teachers can prove that an exercise is runnable, initially incomplete, and solvable before publication.

## Phase 5 — Publication and immutable exercise versions

Extend the lecture publication workflow to validate exercise references before writing the published recording.

Publication performs:

1. Find all exercise points in the draft recording.
2. Reject references to incomplete drafts.
3. Recheck completeness and current verification hashes.
4. Publish each completed draft as a new immutable exercise version when needed.
5. Record the publication version on each exercise point.
6. Publish the immutable teacher recording and media through the existing flow.
7. Advance active exercise versions only after their immutable records exist.

The learner-facing exercise response excludes reference solutions, private validation source, and teacher-only diagnostics. The validation runner may obtain the private bundle through a separate internal client path when Check Solution begins.

Deleting a lecture removes its linked attempts and learner branches under the existing destructive lesson lifecycle. Reusable exercise series and versions remain available when referenced by other recordings.

**Phase outcome:** a published lecture exposes complete exercise points while retaining immutable recording and exercise-version history.

## Phase 6 — Learner playback interception and Exercise Mode

Render exercise points as distinct markers on the learner Lesson timeline.

Playback interception must happen before a frame applies teacher events beyond a crossed exercise point. Add a pure runtime boundary helper that merges the next teacher event and next exercise point by timestamp and sequence.

When an eligible point is crossed:

1. Apply teacher events only through the point's exact timestamp and sequence.
2. Set media and the fallback clock to that timestamp.
3. Pause all playback drivers.
4. Preserve the exact teacher position.
5. Resolve learner-safe metadata for the active exercise version or pinned unfinished attempt.
6. Show an explicit exercise-checkpoint interstitial over the unchanged, frozen teacher workspace.
7. Wait for Start Exercise, Resume Exercise, Start Over, or Skip for Now.
8. Cover the workspace before installing starter or attempt files and reveal Exercise Mode only after CodeMirror and the file tree are ready.

Entering Exercise Mode loads only visible starter files into the workspace, applies read-only policy, and hides lecture-specific solution/reset actions. It clearly displays instructions, preservation status, and the fact that lecture files will return afterward. The workspace Explanation panel switches from lesson content to the version-pinned exercise explanation, the live Terminal remains available, and the presentation resource surface exposes only Website Preview when the runtime supports it. Exercise preview layout is temporary and cannot modify the teacher presentation layout. Learner-safe metadata is prefetched where possible; private validation remains deferred until Check Solution.

Leaving Exercise Mode first covers the learner workspace, reconstructs teacher truth at the exercise point, and only then reveals and resumes with:

```ts
playRecordingFrom(point.teacherTimestampMs, {
  resetToBase: false,
  startAfterEventSeq: point.lastAppliedTeacherEventSeq,
});
```

Passed points do not interrupt playback by default. Seeking reconstructs teacher state but does not automatically open every skipped point; crossing during playback and clicking a marker do.

**Phase outcome:** learners enter an isolated exercise workspace at the exact intended lecture position and can return without losing teacher or learner state.

## Phase 7 — Attempts, autosave, checkpoints, and learner actions

Crossing a point alone does not create an attempt. Create an attempt when the learner starts or resumes work, or create a skipped attempt when Skip for Now is chosen. The root learner branch uses the exact teacher origin plus exercise starter context.

Reuse existing learner history behavior for:

- append-only file changes and file creation;
- durable working trees;
- Ctrl/Cmd+S checkpoints;
- no-op repeated saves;
- historical review and forks.

Add exercise-aware filtering so these branches appear inside the exercise attempt UI instead of the normal My Work timeline.

Implement:

- **Check Solution** with visible progress;
- passed feedback;
- safe failed-check feedback in a terminal-style structured results panel;
- broken-validation feedback that does not blame the learner and never exposes private diagnostics;
- **Skip for Now**;
- **Continue Lecture**;
- **Start Over**;
- attempt and checkpoint selection.

Skip and Continue flush local autosave before restoring teacher truth. Start Over preserves the current attempt and creates a new root attempt from the appropriate starter version.

A successful check stores the checked workspace hash. If the learner edits afterward, the UI reports that the current workspace differs from the successful check and requires another successful check before treating that changed workspace as completed.

**Phase outcome:** the complete first-attempt flow works with local-first autosave, checkpoints, checking, skipping, and continuation.

## Phase 8 — Revisiting, multiple points, and version updates

Complete the lifecycle behavior:

- support multiple exercise points per recording;
- resume the latest active or skipped attempt;
- preserve and browse older attempts;
- allow Start Over from any exercise marker;
- stop again for skipped or unfinished points when crossed later;
- avoid forced stops for exercises with a passed attempt;
- keep passed work reviewable;
- create immutable new versions for post-publication updates;
- pin existing attempts to their original version;
- use the newest active version for new attempts;
- show marker status for not started, in progress, skipped, and passed.

The marker remains the stable lecture entry point. Checkpoints and attempts never replace it or seek lecture time when selected.

**Phase outcome:** exercises remain usable across rewinds, revisits, multiple attempts, and teacher version updates.

## Phase 9 — Compatibility and product integration

Complete integration with retained prototype capabilities:

- include referenced exercise versions in recording export/import;
- preserve compatibility with packages that contain no exercises;
- update deterministic demo data with at least one complete exercise point;
- cascade deletion to exercise attempts without deleting reusable exercise definitions;
- add accessible progress and status announcements;
- add explicit CodeMirror origins for exercise workspace swaps;
- update architecture documentation and development workflow notes;
- keep the diff focused on the interactive prototype.

Each phase should add the smallest relevant runtime and React coverage. Learner-facing behavior should receive targeted Playwright scenarios as it becomes visible. Routine completion validation remains:

```bash
pnpm lint
pnpm build
pnpm test:prototype
git diff --check
```

**Phase outcome:** Timeline Exercise Points behaves as part of the existing interactive product rather than as a disconnected demonstration.

## 4. Expected primary file impact

Existing files likely to change include:

```text
packages/runtime/src/interactive-timeline/types.ts
packages/runtime/src/interactive-timeline/recorder.ts
packages/runtime/src/interactive-timeline/media-recorder.ts
packages/runtime/src/interactive-timeline/indexeddb-storage-adapter.ts
packages/runtime/src/interactive-timeline/remote-storage-adapter.ts
packages/runtime/src/interactive-timeline/learner-history/
packages/runtime/src/execution/
packages/react/src/Panels/useInteractivePoc.ts
packages/react/src/Panels/WorkspacePanel.tsx
packages/react/src/Panels/InteractiveRecordingStudio.tsx
packages/react/src/Panels/InteractiveHistoryTimeline.tsx
packages/react/src/Panels/interactive-session.ts
packages/react/src/core/CodeMirrorEditor/
packages/astro/src/vite-plugins/interactive-persistence.ts
e2e/interactive-poc.spec.ts
docs/interactive-poc-architecture.md
```

Most new product logic should live in focused exercise runtime modules and React hooks/components. `useInteractivePoc.ts` should remain the playback and workspace orchestrator rather than becoming the exercise domain implementation.

## 5. Critical implementation order

The dependency order is:

```text
Domain and storage
  -> pausable recording
  -> teacher authoring
  -> WebContainer validation
  -> publication
  -> learner Exercise Mode
  -> attempts and checkpoints
  -> revisiting and version lifecycle
  -> compatibility integration
```

Phases 1–4 should be specified and implemented most concretely first. Later learner phases should use the proven exercise, validation, and persistence contracts rather than introducing parallel models.
