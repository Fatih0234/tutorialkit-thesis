# Interactive POC architecture

This document is the local architecture checkpoint for the interactive tutorial POC as of Phase 7. It covers the browser-only recorder, timeline-clock playback, learner delta save/restore, and conflict detection behavior.

## Scope and invariants

The POC implements only the interactivity layer:

- teacher editor/file actions are recorded into a timeline;
- learners can replay that timeline;
- learners can pause, edit their own workspace, and save a file-level delta;
- saved learner deltas can be restored after teacher playback continues;
- conflict detection reports when later teacher timeline edits touch the same learner-changed files.

Important invariants:

- **Teacher timeline is immutable.** Learner save/restore must not modify `interactive-poc.teacherRecording`.
- **Learner work is separate.** Learner changes are stored as learner-owned deltas in `interactive-poc.learnerDeltas`.
- **Paths are normalized.** Internal paths use leading-slash form, for example `/example.js`.
- **Programmatic playback/restore is guarded.** Playback-applied file changes should not be recorded as new teacher or learner edits.
- **File-level deltas only.** The POC does not compute text patches or merge hunks.

## 1. Current user flow

The visible debug UI is rendered by `packages/react/src/Panels/InteractivePocControls.tsx`. It exposes crude POC controls and status text.

### Start Recording

Starts a local `TimelineRecorder` while the lesson is fully loaded and the mode is `idle`.

Behavior:

- captures the current workspace snapshot as `TeacherRecording.baseFiles`;
- creates a new `TeacherRecording` with `version: 1`;
- appends an initial `recording.started` event;
- begins wrapping editor/file callbacks to record teacher actions.

Recorded callback events currently include:

- `file.opened` when a file is selected;
- `file.changed` when editor content changes;
- `editor.scrolled` when the editor scroll position changes.

### Stop Recording

Stops the active `TimelineRecorder` and saves the resulting immutable teacher recording to localStorage:

```text
interactive-poc.teacherRecording
```

Stopping also updates debug state such as event count and learner-delta restore/conflict availability.

### Play Recording

Loads the teacher recording from localStorage and replays it in `teacher-playback` mode.

Behavior:

- loads `interactive-poc.teacherRecording`;
- resets the workspace to the recording base files for a fresh playback;
- sorts events by `tMs`, then `seq`;
- advances one `requestAnimationFrame` timeline clock and applies due events in order;
- updates playback status and playhead debug text;
- uses a playback guard so programmatic changes are not recorded.

Currently applied event types:

- `file.opened`: selects the file;
- `file.changed`: updates the file content;
- `editor.scrolled`: restores scroll position and selects the event file when present.

### Pause & Try It

Stops the playback clock and switches to learner edit mode.

Behavior:

- computes the current teacher timestamp;
- stores it as the paused teacher timestamp;
- sets mode to `learner-editing`;
- sets playback status to `paused`;
- does not mutate the saved teacher recording.

### Resume Teacher

Continues teacher playback from the paused teacher timestamp.

Behavior:

- resumes only while mode is `learner-editing`;
- advances the playback clock from `pausedTeacherTimestampMs`;
- applies teacher events with `tMs > pausedTeacherTimestampMs` as they become due;
- does **not** reset the workspace to base files on resume;
- later teacher `file.changed` events can overwrite the visible workspace;
- saved learner deltas remain recoverable from localStorage.

### Save Learner Delta

Saves learner-owned file-level changes while paused in learner edit mode.

Behavior:

1. loads the immutable teacher recording;
2. materializes teacher files at the paused timestamp;
3. reads the current learner workspace files;
4. diffs teacher-at-pause files against learner files;
5. saves a `LearnerDelta` to `interactive-poc.learnerDeltas`;
6. recomputes learner delta count, restore availability, and conflict status.

The delta is keyed by:

- lesson id;
- teacher recording id;
- teacher recording version;
- teacher timestamp;
- base teacher files hash.

### Restore Learner Delta

Restores the latest matching learner delta without changing the teacher recording.

A delta is considered restorable when:

- its `teacherRecordingId` matches the loaded teacher recording;
- its `teacherRecordingVersion` matches the loaded teacher recording;
- its `baseTeacherFilesHash` matches the materialized teacher state at `teacherTimestampMs`.

Behavior:

- materializes teacher files at the delta timestamp;
- applies the learner file-level delta over that base;
- updates existing TutorialKit files in the workspace;
- restores `selectedFile` when it still exists;
- does not add/remove file-tree entries in the current UI;
- does not block on conflicts.

### Conflict status

Phase 6 adds non-destructive conflict detection.

Visible debug fields:

```text
Conflict status: none | conflict
Conflicted files: /example.js, ...
```

A conflict exists when:

- the learner delta changes a file path in `addedOrModified` or `removed`;
- the teacher recording has a later event with `tMs > delta.teacherTimestampMs`;
- the later teacher event modifies the same file path;
- Phase 6 considers only `file.changed` as a teacher-modifying event type.

Conflict detection is informational only:

- it does not merge;
- it does not block restore;
- it does not show a choice modal;
- it does not mutate the teacher recording.

Conflict state is recomputed on component initialization, teacher recording play/load, learner delta save, and learner delta restore.

## 2. Data model

Source types live in `packages/runtime/src/interactive-timeline/types.ts`.

### FilesSnapshot

```ts
type FilesSnapshot = Record<string, string>;
```

A map from normalized file path to full file content.

Example:

```json
{
  "/example.js": "console.log('hello');\n",
  "/example.html": "<h1>Hello</h1>\n"
}
```

### TeacherRecording

```ts
interface TeacherRecording {
  id: string;
  lessonId: string;
  version: number;
  startedAt: string;
  durationMs: number;
  baseFiles: FilesSnapshot;
  events: TimelineEvent[];
}
```

Meaning:

- `id`: local generated teacher recording id;
- `lessonId`: current lesson id;
- `version`: POC version number, currently `1`;
- `startedAt`: ISO timestamp for recording start;
- `durationMs`: elapsed recording duration when stopped;
- `baseFiles`: normalized file snapshot at recording start;
- `events`: ordered teacher/system timeline events.

### TimelineEvent

```ts
type TimelineEventType =
  | 'recording.started'
  | 'file.opened'
  | 'file.changed'
  | 'editor.scrolled'
  | 'playback.marker';

type TimelineEventOrigin = 'teacher' | 'playback' | 'system';

interface TimelineEvent<TPayload = unknown> {
  id: string;
  seq: number;
  tMs: number;
  type: TimelineEventType;
  filePath?: string;
  payload?: TPayload;
  origin: TimelineEventOrigin;
}
```

Current payload shapes:

```ts
interface FileChangedPayload {
  content: string;
  selection?: unknown;
}

interface FileOpenedPayload {
  filePath: string;
}

interface EditorScrolledPayload {
  top: number;
  left: number;
}
```

Ordering contract:

- sort by `tMs` ascending;
- break ties by `seq` ascending.

### LearnerDelta

```ts
interface LearnerDelta {
  id: string;
  userId: string;
  lessonId: string;
  teacherRecordingId: string;
  teacherRecordingVersion: number;
  teacherTimestampMs: number;
  baseTeacherFilesHash: string;
  addedOrModified: FilesSnapshot;
  removed: string[];
  selectedFile?: string;
  createdAt: string;
}
```

Meaning:

- `id`: local generated learner delta id;
- `userId`: currently fixed to `local-poc-user`;
- `lessonId`: lesson the delta belongs to;
- `teacherRecordingId`: teacher recording this delta is based on;
- `teacherRecordingVersion`: teacher recording version this delta is based on;
- `teacherTimestampMs`: paused teacher timestamp for the learner edit;
- `baseTeacherFilesHash`: simple hash of teacher files materialized at that timestamp;
- `addedOrModified`: full file contents for added/modified files;
- `removed`: normalized paths removed by the learner;
- `selectedFile`: selected editor file when the delta was saved;
- `createdAt`: ISO timestamp for save time.

### Conflict detection result

Source type lives in `packages/runtime/src/interactive-timeline/learner-delta.ts`.

```ts
interface LearnerDeltaConflictEvent {
  filePath: string;
  eventId: string;
  teacherTimestampMs: number;
}

interface LearnerDeltaConflicts {
  filePaths: string[];
  events: LearnerDeltaConflictEvent[];
}
```

`getLearnerDeltaConflicts(recording, delta)` returns:

- `filePaths`: sorted normalized paths with conflicts;
- `events`: matching later teacher `file.changed` events with ids and timestamps.

The React hook currently displays only `filePaths` as `Conflict status` and `Conflicted files`.

## 3. localStorage keys

The POC uses browser localStorage only.

### `interactive-poc.teacherRecording`

Stores one serialized `TeacherRecording` object:

```ts
localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(recording));
```

Loading returns `undefined` when no recording exists.

### `interactive-poc.learnerDeltas`

Stores a serialized array of `LearnerDelta` objects:

```ts
localStorage.setItem('interactive-poc.learnerDeltas', JSON.stringify(deltas));
```

Saving appends to the existing array. Loading returns an empty array when no deltas exist. Restore currently considers the latest matching delta.

## 4. Runtime modules

Runtime exports are collected by `packages/runtime/src/interactive-timeline/index.ts` and re-exported from `packages/runtime/src/index.ts`.

### `types.ts`

Defines the shared data contracts:

- `FilesSnapshot`
- `TimelineEvent`
- `TeacherRecording`
- `LearnerDelta`
- event payload interfaces

### `path.ts`

Normalizes internal paths:

- `normalizePath(path)`: ensures leading-slash paths;
- `normalizeFiles(files)`: normalizes all keys in a file map.

### `recorder.ts`

Owns teacher timeline recording:

- creates `TeacherRecording` objects;
- captures `baseFiles`;
- appends timestamped events;
- records file open and file changed helpers;
- finalizes `durationMs` on stop.

### `materialize.ts`

Reconstructs teacher file state from a recording:

- starts from `recording.baseFiles`;
- sorts events by `tMs` and `seq`;
- applies `file.changed` payload content up to `untilMs`;
- exposes `materializeTeacherState(recording, untilMs)` and `getFinalTeacherState(recording)`.

### `learner-delta.ts`

Owns file-level learner delta helpers:

- `diffFiles(before, after)`: computes `addedOrModified` and `removed`;
- `applyLearnerDelta(base, delta)`: overlays learner changes onto a base file map;
- `simpleHashFiles(files)`: creates the POC base-state hash;
- `getLearnerDeltaConflicts(recording, delta)`: reports later teacher `file.changed` events that touch learner-changed files.

### `playback-clock.ts`

Owns the minimal timeline playback clock:

- uses `requestAnimationFrame` in the browser to advance one playhead;
- exposes `playFrom(startMs)`, `pause()`, `stop()`, and `currentTimeMs`;
- calls `onTick(currentTimeMs)` so React can apply all due timeline events;
- calls `onFinish()` when the playhead reaches the current playback end.

### `storage.ts`

Owns localStorage persistence:

- `saveTeacherRecording(recording)`;
- `loadTeacherRecording()`;
- `saveLearnerDelta(delta)`;
- `loadLearnerDeltas()`;
- `loadLatestLearnerDelta()`.

This module intentionally has no backend/API implementation.

## 5. React integration

### `WorkspacePanel.tsx`

`packages/react/src/Panels/WorkspacePanel.tsx` is intentionally thin for the POC.

Responsibilities:

- read TutorialKit store state with nanostores;
- instantiate `useInteractivePoc(...)`;
- render `InteractivePocControls`;
- pass hook-wrapped callbacks to `EditorPanel`:
  - `onFileSelect`;
  - `onEditorScroll`;
  - `onEditorChange`.

It should not contain the recorder/playback/delta implementation details.

### `useInteractivePoc.ts`

`packages/react/src/Panels/useInteractivePoc.ts` owns POC behavior and state.

Responsibilities:

- recording lifecycle;
- playback lifecycle;
- pause/resume mode transitions;
- playback guard;
- learner delta save/restore;
- latest matching delta detection;
- conflict status recomputation;
- debug control model returned to the UI.

Current modes:

```ts
type InteractiveMode = 'teacher-playback' | 'learner-editing' | 'idle';
```

Current playback statuses:

```ts
type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'finished' | 'missing-recording';
```

### `InteractivePocControls.tsx`

`packages/react/src/Panels/InteractivePocControls.tsx` renders only the visible debug controls and status text.

It receives a control model from `useInteractivePoc` and does not own persistence, timeline, or workspace logic.

## 6. Current limitations

Known limitations are intentional for the POC:

- localStorage only;
- no backend persistence;
- no account/auth/user identity beyond `local-poc-user`;
- no merge engine;
- no patch-based/hunk-level deltas;
- no conflict resolution choices;
- conflicts do not block restore;
- no production UI;
- no terminal recording;
- no preview iframe/internal app recording;
- no analytics;
- restore only updates existing TutorialKit files in the current UI;
- file add/remove restore UI is not implemented;
- playback clock is minimal and does not yet support seeking, speed changes, drift correction, or audio sync;
- editor selection is stored opaquely and not restored as a first-class feature;
- localStorage parsing assumes valid POC JSON.

## 7. Next phases

Candidate future phases:

1. **Richer playback clock controls**
   - support seeking, speed, drift correction, cancellation, and deterministic replay state.

2. **Backend persistence API shape**
   - define server contracts for teacher recordings and learner deltas after localStorage POC validation.

3. **Conflict resolution UX**
   - show conflicted files clearly;
   - let the learner choose teacher version, learner version, or eventually a merged version;
   - keep detection separate from resolution.

4. **Production UI**
   - replace the debug control strip with tutorial-appropriate controls and workspace mode affordances.

5. **Optional transcript/audio**
   - attach narration/transcript metadata to teacher timeline events without changing the learner delta model.

6. **Optional richer capture**
   - terminal and preview capture should remain out of scope until the editor/file timeline is stable.
