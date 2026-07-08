# Local Findings (Phase 0)

Phase 0 only: no feature code was written.

## Command run

```bash
bash scripts/phase0-grep.sh
```

Result: the probe ran, but this checkout does not contain the expected TutorialKit source files. `rg` reported `No such file or directory` for every probed TutorialKit path:

- `packages/react/src/Panels/WorkspacePanel.tsx`
- `packages/runtime/src/store/index.ts`
- `packages/runtime/src/store/editor.ts`
- `packages/react/src/core/CodeMirrorEditor/index.tsx`
- `packages/runtime/src/store/tutorial-runner.ts`
- `packages/runtime/src/webcontainer/utils/files.ts`

## Repository shape found locally

This checkout is a POC starter, not a full TutorialKit app checkout.

Existing implementation files are limited to:

- `packages/runtime/src/interactive-timeline/index.ts`
- `packages/runtime/src/interactive-timeline/types.ts`
- `packages/runtime/src/interactive-timeline/path.ts`
- `packages/runtime/src/interactive-timeline/recorder.ts`
- `packages/runtime/src/interactive-timeline/materialize.ts`
- `packages/runtime/src/interactive-timeline/learner-delta.ts`
- `packages/runtime/src/interactive-timeline/storage.ts`

There is no local `package.json`, no Playwright config, and no local `packages/react/` tree.

## Exact editor callback locations

Not confirmable in this checkout because the expected editor/UI files are absent.

Expected future integration points, from the Phase 0 probe and project instructions, are:

- `packages/react/src/Panels/WorkspacePanel.tsx`
  - candidate callback/API names to inspect when the file exists: `onEditorChange`, `onEditorScroll`, `onFileSelect`, `setCurrentDocumentContent`, `setSelectedFile`
  - preferred first interception point for recording file edits and file selections
- `packages/react/src/core/CodeMirrorEditor/index.tsx`
  - candidate callback names to inspect when the file exists: `OnChangeCallback`, `OnScrollCallback`, `dispatchTransactions`, `onChange`, `onScroll`
  - avoid editing this unless `WorkspacePanel` callbacks are insufficient
- `packages/runtime/src/store/editor.ts`
  - candidate APIs to inspect when the file exists: `selectedFile`, `documents`, `updateFile`, `updateScrollPosition`, `onDocumentChanged`

## Exact snapshot API shape

The TutorialKit store snapshot API is not confirmable locally because these files are absent:

- `packages/runtime/src/store/index.ts`
- `packages/runtime/src/store/tutorial-runner.ts`

The local POC helper shape is confirmed:

- `packages/runtime/src/interactive-timeline/types.ts:1`
  - `FilesSnapshot = Record<string, string>`
- `packages/runtime/src/interactive-timeline/types.ts:36`
  - `TeacherRecording.baseFiles: FilesSnapshot`
- `packages/runtime/src/interactive-timeline/types.ts:46`
  - `LearnerDelta.addedOrModified: FilesSnapshot`
  - `LearnerDelta.removed: string[]`
- `packages/runtime/src/interactive-timeline/recorder.ts:25`
  - `TimelineRecorder.start({ lessonId, version = 1, baseFiles })`
- `packages/runtime/src/interactive-timeline/materialize.ts:4`
  - `materializeTeacherState(recording, untilMs): FilesSnapshot`
- `packages/runtime/src/interactive-timeline/materialize.ts:32`
  - `getFinalTeacherState(recording): FilesSnapshot`
- `packages/runtime/src/interactive-timeline/learner-delta.ts:9`
  - `diffFiles(beforeInput, afterInput): { addedOrModified: FilesSnapshot; removed: string[] }`
- `packages/runtime/src/interactive-timeline/learner-delta.ts:32`
  - `applyLearnerDelta(baseInput, delta): FilesSnapshot`
- `packages/runtime/src/interactive-timeline/learner-delta.ts:46`
  - `simpleHashFiles(filesInput): string`

Future feature code should adapt the real TutorialKit `takeSnapshot()` result into `FilesSnapshot` before calling these helpers.

## Exact path convention used locally

Confirmed local convention: internal file paths are normalized to leading-slash form.

- `packages/runtime/src/interactive-timeline/path.ts:1`
  - `normalizePath(path)` returns the path unchanged when it already starts with `/`; otherwise it prefixes `/`.
- `packages/runtime/src/interactive-timeline/path.ts:9`
  - `normalizeFiles(files)` normalizes every object key with `normalizePath`.
- `packages/runtime/src/interactive-timeline/recorder.ts:35`
  - recording `baseFiles` are normalized at recording start.
- `packages/runtime/src/interactive-timeline/recorder.ts:72`
  - event `filePath` values are normalized when appended.

Example normalized paths:

```text
/src/App.jsx
/package.json
```

## Where debug controls will be placed

When the full TutorialKit UI files are present, place the POC debug controls in:

```text
packages/react/src/Panels/WorkspacePanel.tsx
```

Place them near the workspace/editor UI where editor change and file selection callbacks are already wired, so recording/playback can wrap existing callbacks instead of modifying CodeMirror internals.

Required accessible button names for Playwright:

- `Start Recording`
- `Stop Recording`
- `Play Recording`
- `Pause`
- `Save Learner Delta`
- `Restore Learner Delta`

## localStorage shape to inspect

Confirmed keys:

- `packages/runtime/src/interactive-timeline/storage.ts:3`
  - `interactive-poc.teacherRecording`
- `packages/runtime/src/interactive-timeline/storage.ts:4`
  - `interactive-poc.learnerDeltas`

Confirmed storage functions:

- `saveTeacherRecording(recording)` writes one JSON `TeacherRecording`.
- `loadTeacherRecording()` returns `TeacherRecording | undefined`.
- `saveLearnerDelta(delta)` appends one `LearnerDelta` to the JSON array.
- `loadLearnerDeltas()` returns `LearnerDelta[]`.
- `loadLatestLearnerDelta()` returns the last delta.

## How to run the app

Not runnable in this checkout: there is no local `package.json`, app source, or dev-server config.

The existing Playwright test defaults to:

```text
http://localhost:4321
```

When this starter is inside a full TutorialKit project, start that host app with its normal dev script and keep it available at the URL used by `TK_POC_URL`.

## How to run Playwright

No local Playwright dependency/config is present in this checkout. Once dependencies exist and the host app is running:

```bash
TK_POC_URL=http://localhost:4321 pnpm exec playwright test e2e/interactive-poc.spec.ts
```

Optional setup snippets already documented in `package-snippets.md`:

```bash
pnpm add -D @playwright/test
pnpm exec playwright install
```

## Phase 0 conclusion

Phase 0 local inspection is complete. The main blocker before feature work is that this checkout lacks the full TutorialKit integration files that the POC is intended to wrap.
