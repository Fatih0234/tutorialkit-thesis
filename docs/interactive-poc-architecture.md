# Interactive POC architecture

This document is the local architecture checkpoint for the interactive tutorial POC as of Milestone B. It covers the browser-only structured recorder, optional teacher mic/webcam media capture, local authoring draft lifecycle, async IndexedDB-backed storage adapter, media-synced playback, fallback timeline-clock playback, learner delta save/restore, and conflict detection behavior.

## Scope and invariants

The POC implements only the interactivity layer:

- teacher editor/file actions are recorded into a structured timeline;
- teachers can optionally attach microphone narration or webcam media to the same timeline;
- teachers can save, load, discard, and preview local recording drafts;
- learners can replay that timeline;
- learners can pause, edit their own workspace, and save a file-level delta;
- saved learner deltas can be restored after teacher playback continues;
- conflict detection reports when later teacher timeline edits touch the same learner-changed files.

Important invariants:

- **Teacher timeline is immutable.** Learner save/restore must not modify saved teacher recording drafts or the `interactive-poc.teacherRecording` compatibility mirror.
- **Learner work is separate.** Learner changes are stored as learner-owned deltas in IndexedDB and mirrored to `interactive-poc.learnerDeltas`.
- **Paths are normalized.** Internal paths use leading-slash form, for example `/example.js`.
- **Programmatic playback/restore is guarded.** Playback-applied file changes should not be recorded as new teacher or learner edits.
- **Media is an attachment, not a replacement.** Milestone B records narration/camera media alongside the structured timeline; it does not replace TutorialKit replay with an opaque screen recording.
- **One playback clock source.** When media is loaded, `HTMLMediaElement.currentTime * 1000` drives timeline replay. When no media is loaded, `TimelinePlaybackClock` remains the fallback.
- **File-level deltas only.** The POC does not compute text patches or merge hunks.

## 1. Current user flow

The visible local authoring/debug UI is rendered by `packages/react/src/Panels/InteractivePocControls.tsx` and the teacher-facing `packages/react/src/Panels/InteractiveAuthoringPanel.tsx`. It still exposes crude POC controls and status text, but the teacher draft lifecycle and optional media capture lifecycle are explicit.

### Record Timeline Only / Record With Mic / Record With Camera

Starts a local `TimelineRecorder` while the lesson is fully loaded and the mode is `idle`. `Record Timeline Only` keeps the Milestone A behavior. `Record With Mic` prepares an audio `MediaStream` through `getUserMedia({ audio: true })`; `Record With Camera` prepares a webcam stream through `getUserMedia({ audio: true, video: true })`.

Behavior:

- captures the current workspace snapshot as `TeacherRecording.baseFiles`;
- creates a new `TeacherRecording` with `version: 1`;
- starts media and timeline recording from the same local start timestamp when media preparation succeeds;
- appends an initial `recording.started` event;
- begins wrapping editor/file callbacks to record teacher actions;
- falls back to timeline-only recording with a visible media error/unavailable status when media APIs or permissions fail.

Recorded callback events currently include:

- `file.opened` when a file is selected;
- `file.changed` when editor content changes;
- `editor.scrolled` when the editor scroll position changes.

### Stop Recording

Stops the active `TimelineRecorder` and keeps the resulting teacher recording in memory as the current unsaved draft. If an `InteractiveMediaRecorder` is active, it is stopped too, all `MediaStream` tracks are stopped, and the resulting `RecordingMediaAsset` blob is kept in memory until the draft is saved.

The teacher recording stores only media metadata (`mediaAssets`), not the Blob itself. Stopping does not require a backend or immediate publish step. The draft can then be saved, previewed, or discarded.

Stopping also updates debug state such as draft status, current draft id, recording duration, event count, media kind, media status, and media duration.

### Save Draft

Saves the current stopped teacher recording draft through the async storage adapter. The default browser adapter writes the draft metadata to IndexedDB, stores media blobs in the IndexedDB `mediaAssets` store, and mirrors the latest teacher recording metadata to the compatibility key:

```text
interactive-poc.teacherRecording
```

Saving a draft does not mutate learner deltas and does not contact a backend. Media blobs are not mirrored to localStorage.

### Load Draft

Loads the latest local teacher recording draft from IndexedDB through the async storage adapter. Associated media assets are loaded from the IndexedDB `mediaAssets` store using the recording's media asset ids/metadata. If IndexedDB is unavailable, the adapter falls back to the localStorage compatibility adapter for timeline data only. Loading also refreshes the `interactive-poc.teacherRecording` mirror so existing POC debugging/tests can inspect the latest recording shape.

### Preview Draft

Previews the currently loaded/saved draft using the same timeline playback engine as learner playback. If a media asset is loaded, the media element drives timeline time via `media.currentTime * 1000`; otherwise the fallback `TimelinePlaybackClock` drives replay. Preview does not start recording and does not mutate the saved draft.

### Discard Draft

Clears the current in-memory draft/media selection and marks the authoring panel as discarded. Milestone B keeps persisted localStorage compatibility keys in place and does not delete learner deltas or IndexedDB media assets.

### Play Recording

Loads the latest teacher recording through the async storage adapter and replays it in `teacher-playback` mode.

Behavior:

- loads the latest recording from IndexedDB or the `interactive-poc.teacherRecording` compatibility key;
- loads associated media assets from IndexedDB when the recording references them;
- resets the workspace to the recording base files for a fresh playback;
- sorts events by `tMs`, then `seq`;
- when media is loaded, uses the media element's `currentTime` in seconds as the source of truth and applies due events where `event.tMs <= currentTime * 1000`;
- when media is absent, advances one `requestAnimationFrame` timeline clock and applies due events in order;
- updates playback status and playhead debug text;
- uses a playback guard so programmatic changes are not recorded.

Currently applied event types:

- `file.opened`: selects the file;
- `file.changed`: updates the file content;
- `editor.scrolled`: restores scroll position and selects the event file when present.

### Pause & Try It

Stops the active playback driver and switches to learner edit mode. If media is driving playback, the media element is paused before learner editing starts.

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
- resumes media from `pausedTeacherTimestampMs / 1000` when media is loaded;
- otherwise advances the fallback playback clock from `pausedTeacherTimestampMs`;
- applies teacher events with `tMs > pausedTeacherTimestampMs` as they become due;
- does **not** reset the workspace to base files on resume;
- later teacher `file.changed` events can overwrite the visible workspace;
- saved learner deltas remain recoverable from IndexedDB and the localStorage compatibility mirror.

### Save Learner Delta

Saves learner-owned file-level changes while paused in learner edit mode.

Behavior:

1. loads the immutable teacher recording;
2. materializes teacher files at the paused timestamp;
3. reads the current learner workspace files;
4. diffs teacher-at-pause files against learner files;
5. saves a `LearnerDelta` through the async storage adapter; the default IndexedDB adapter mirrors the array to `interactive-poc.learnerDeltas`;
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
  mediaAssets?: RecordingMediaAssetMetadata[];
}
```

Meaning:

- `id`: local generated teacher recording id;
- `lessonId`: current lesson id;
- `version`: POC version number, currently `1`;
- `startedAt`: ISO timestamp for recording start;
- `durationMs`: elapsed recording duration when stopped;
- `baseFiles`: normalized file snapshot at recording start;
- `events`: ordered teacher/system timeline events;
- `mediaAssets`: optional media asset metadata references. Blob data is stored separately in IndexedDB and is not embedded in the teacher recording JSON.

### RecordingMediaAsset

Source types live in `packages/runtime/src/interactive-timeline/media.ts`.

```ts
type RecordingMediaKind = 'audio' | 'webcam';

interface RecordingMediaAssetMetadata {
  id: string;
  recordingId: string;
  kind: RecordingMediaKind;
  mimeType: string;
  durationMs: number;
  createdAt: string;
}

interface RecordingMediaAsset extends RecordingMediaAssetMetadata {
  blob?: Blob;
}
```

Meaning:

- `audio` assets are produced by `getUserMedia({ audio: true })` and recorded with `MediaRecorder`;
- `webcam` assets are produced by `getUserMedia({ audio: true, video: true })` when browser/device support is available;
- `TeacherRecording.mediaAssets` stores only `RecordingMediaAssetMetadata`;
- IndexedDB stores `RecordingMediaAsset` records including the `Blob`;
- localStorage mirrors never store media blobs.

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

## 3. Browser storage

Milestone B uses an async storage adapter. The default browser implementation writes structured timeline data and media blobs to IndexedDB while mirroring the legacy localStorage keys for compatibility with existing tests and manual debugging.

### IndexedDB

The default database is:

```text
interactive-timeline-poc
```

Current object stores:

- `teacherRecordings`, keyed by `TeacherRecording.id`;
- `learnerDeltas`, keyed by `LearnerDelta.id`;
- `mediaAssets`, keyed by `RecordingMediaAsset.id`, including Blob data and indexed by `recordingId`.

The IndexedDB adapter is browser-only guarded and falls back to the localStorage adapter when IndexedDB is unavailable. It migrates existing localStorage values into IndexedDB without deleting the old keys. Media persistence requires IndexedDB; when IndexedDB is unavailable, recording can continue as timeline-only and media save/load reports an error/unavailable state instead of crashing.

### `interactive-poc.teacherRecording` compatibility mirror

Stores one serialized `TeacherRecording` object:

```ts
localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(recording));
```

Loading returns `undefined` when no recording exists.

### `interactive-poc.learnerDeltas` compatibility mirror

Stores a serialized array of `LearnerDelta` objects:

```ts
localStorage.setItem('interactive-poc.learnerDeltas', JSON.stringify(deltas));
```

The IndexedDB adapter mirrors the full learner-delta array to this key after saves. Loading returns an empty array when no deltas exist. Restore currently considers the latest matching delta. Media blobs are intentionally excluded from localStorage.

## 4. Runtime modules

Runtime exports are collected by `packages/runtime/src/interactive-timeline/index.ts` and re-exported from `packages/runtime/src/index.ts`.

### `types.ts`

Defines the shared data contracts:

- `FilesSnapshot`
- `TimelineEvent`
- `TeacherRecording`
- `LearnerDelta`
- optional `TeacherRecording.mediaAssets` metadata references
- event payload interfaces

### `path.ts`

Normalizes internal paths:

- `normalizePath(path)`: ensures leading-slash paths;
- `normalizeFiles(files)`: normalizes all keys in a file map.

### `recorder.ts`

Owns teacher timeline recording:

- creates `TeacherRecording` objects;
- captures `baseFiles`;
- accepts an optional shared local start timestamp for media/timeline alignment;
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

Owns the fallback timeline playback clock for recordings without media:

- uses `requestAnimationFrame` in the browser to advance one playhead;
- exposes `playFrom(startMs)`, `pause()`, `stop()`, and `currentTimeMs`;
- calls `onTick(currentTimeMs)` so React can apply all due timeline events;
- calls `onFinish()` when the playhead reaches the current playback end.

### `media.ts`

Defines the media contracts:

- `RecordingMediaKind`;
- `RecordingMediaAssetMetadata`;
- `RecordingMediaAsset`;
- `getRecordingMediaAssetMetadata(asset)`.

### `media-recorder.ts`

Wraps browser media capture:

- guards `navigator.mediaDevices.getUserMedia` and `MediaRecorder`;
- supports `audio` and `webcam` modes;
- chooses a supported MIME type when possible;
- collects `dataavailable` Blob chunks;
- stops all `MediaStream` tracks after recording;
- exposes a fake audio mode for Playwright/hardware-free tests through `interactive-poc.fakeMediaRecorder`.

### `storage.ts`

Owns the legacy localStorage compatibility helpers and keys:

- `saveTeacherRecording(recording)`;
- `loadTeacherRecording()`;
- `saveLearnerDelta(delta)`;
- `saveLearnerDeltas(deltas)`;
- `loadLearnerDeltas()`;
- `loadLatestLearnerDelta()`.

This module intentionally has no backend/API implementation.

### `storage-adapter.ts`

Defines the async `InteractiveTimelineStorage` boundary used by React. It includes teacher recording, learner delta, teacher draft, and media asset methods. `LocalStorageInteractiveTimelineStorage` remains as the compatibility/fallback adapter for timeline data and intentionally does not mirror media blobs.

### `indexeddb-storage-adapter.ts`

Implements `IndexedDBInteractiveTimelineStorage`. It writes teacher drafts, learner deltas, and media assets to IndexedDB, migrates existing localStorage values when possible, mirrors latest teacher/learner metadata back to the legacy keys, and falls back to `LocalStorageInteractiveTimelineStorage` when IndexedDB is unavailable. Media blobs are stored only in the `mediaAssets` object store.

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
- optional mic/webcam media recording lifecycle;
- local teacher draft save/load/preview/discard lifecycle;
- async storage calls and compatibility state sync;
- media-synced playback and fallback clock playback lifecycle;
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

### `InteractiveAuthoringPanel.tsx`

`packages/react/src/Panels/InteractiveAuthoringPanel.tsx` renders the teacher-facing local authoring controls:

- Record Timeline Only;
- Record With Mic;
- Record With Camera;
- Stop Recording;
- Save Draft;
- Load Draft;
- Preview Draft;
- Discard Draft.

It also displays draft status, current draft id, recording duration, recording status, event count, media status, media kind, media duration, MIME type, media errors, and a simple audio/video preview element when media is loaded.

### `InteractivePocControls.tsx`

`packages/react/src/Panels/InteractivePocControls.tsx` renders the authoring panel plus learner/debug controls and status text.

It receives a control model from `useInteractivePoc` and does not own persistence, timeline, or workspace logic.

## 6. Current limitations

Known limitations are intentional for the POC:

- browser-local IndexedDB/localStorage compatibility storage only;
- no backend persistence;
- no account/auth/user identity beyond `local-poc-user`;
- no merge engine;
- no patch-based/hunk-level deltas;
- no conflict resolution choices;
- conflicts do not block restore;
- no production UI;
- no terminal recording;
- no preview iframe/internal app recording;
- no screen recording;
- no transcript generation;
- no analytics;
- restore only updates existing TutorialKit files in the current UI;
- file add/remove restore UI is not implemented;
- media-synced playback supports basic media seeking by resetting/replaying structured events, but does not yet expose production seeking/speed/drift controls;
- editor selection is stored opaquely and not restored as a first-class feature;
- localStorage parsing assumes valid POC JSON;
- draft listing loads the latest local draft and does not yet provide a full draft picker/history drawer.

## 7. Next phases

Candidate future phases:

1. **Richer playback clock controls**
   - support seeking, speed, drift correction, cancellation, and deterministic replay state.

2. **Backend persistence adapter/API implementation**
   - implement the documented server contracts after the local authoring storage path is validated.

3. **Conflict resolution UX**
   - show conflicted files clearly;
   - let the learner choose teacher version, learner version, or eventually a merged version;
   - keep detection separate from resolution.

4. **Production UI**
   - replace the debug control strip with tutorial-appropriate controls and workspace mode affordances.

5. **Optional transcript/captions**
   - attach transcript metadata to teacher timeline events without changing the learner delta model.

6. **Optional richer capture**
   - screen, terminal, and preview capture should remain out of scope until the editor/file timeline plus media narration path is stable.
