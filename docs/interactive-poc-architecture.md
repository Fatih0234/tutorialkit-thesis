# Interactive POC architecture

This document is the architecture checkpoint for the interactive tutorial thesis demo as of Milestone H. It covers the demo identity/session model, ownership boundaries, role-separated Teacher Studio and Learner Lesson UX, structured recorder, optional teacher mic/webcam media capture, local authoring draft lifecycle, backend/dev publish and load flow, portable export/import packages, deterministic demo seed/reset controls, async IndexedDB and remote storage adapters, media-synced playback, fallback timeline-clock playback, learner work save/restore, explicit conflict resolution UX, demo walkthrough guidance, destructive-action confirmation, and final thesis-demo copy cleanup.

## Scope and invariants

The POC implements only the interactivity layer:

- teacher editor/file actions are recorded into a structured timeline;
- teachers can optionally attach microphone narration or webcam media to the same timeline;
- teachers can see local drafts, then save, load, discard, delete, and preview local recording drafts;
- signed-in teacher/both users can publish recordings and media to local backend/dev storage;
- teacher recordings and media carry teacher owner fields;
- teachers and learners can list and load published recordings after a browser reload;
- learners can replay that timeline;
- signed-in learner/both users can use product-facing controls to try the lesson, edit their own workspace, and save a file-level delta;
- learner work is scoped to the signed-in learner;
- saved learner work can be restored after teacher playback continues;
- conflict warnings report when later teacher timeline edits touch the same learner-changed files;
- conflicted restores require an explicit learner choice: restore anyway, keep teacher version, view details, or cancel;
- teachers/demo operators can export/import portable recording packages with structured timeline JSON and media blobs encoded as base64 JSON;
- teachers/demo operators can seed and reset deterministic demo data without deleting non-demo records.

Important invariants:

- **Teacher timeline is immutable.** Learner save/restore must not modify saved teacher recording drafts or the `interactive-poc.teacherRecording` compatibility mirror.
- **Learner work is separate and user-scoped.** Learner changes are stored as learner-owned deltas in the active adapter: IndexedDB for local drafts and remote backend/dev storage for published recordings. Remote learner delta writes derive `userId` from the session, and both paths mirror scoped deltas to `interactive-poc.learnerDeltas` for debugging.
- **Paths are normalized.** Internal paths use leading-slash form, for example `/example.js`.
- **Programmatic playback/restore is guarded.** Playback-applied file changes should not be recorded as new teacher or learner edits.
- **Media is an attachment, not a replacement.** Milestone H still records narration/camera media alongside the structured timeline; it does not replace TutorialKit replay with an opaque screen recording.
- **One playback clock source.** When media is loaded, `HTMLMediaElement.currentTime * 1000` drives timeline replay. When no media is loaded, `TimelinePlaybackClock` remains the fallback.
- **File-level deltas only.** The POC does not compute text patches, merge hunks, or run automatic merges.
- **Local drafts stay local.** IndexedDB remains the local draft/offline adapter.
- **Published recordings use remote storage.** Published/demo data is written through `RemoteInteractiveTimelineStorage` to `/api/interactive/*` endpoints backed by `.interactive-data/`. Publishing, import-as-published, demo seed, and demo reset require a demo teacher/both session.
- **Export packages are thesis-demo artifacts.** The package format is JSON-first for thesis portability. It is not a stable public API and does not replace the structured replay or storage adapter contracts.

## 1. Current user flow

Milestone H keeps the Milestone D product shell, Milestone E demo identity panel, Milestone F conflict UX, and Milestone G export/import/demo controls, then polishes the visible copy for thesis presentation. `packages/react/src/Panels/InteractivePocControls.tsx` now presents a small demo walkthrough plus two role views:

- **Teacher Studio** for recording, draft management, publishing, preview, export/import, demo seed, and demo reset.
- **Learner Lesson** for opening published lessons, playing the teacher timeline, trying work, saving work, restoring work, and resolving conflicted restores with explicit choices.

A small `Debug details` disclosure remains for generated ids, compatibility localStorage keys, and raw validation notes, but primary tests and user flows use visible product controls.

### Thesis demo walkthrough panel

`InteractivePocControls.tsx` renders a visible guide for the live thesis demo. It lists the expected Teacher Studio flow (sign in as Teacher Demo, seed or create a recording, preview, publish, export) and Learner Lesson flow (sign in as Learner Demo, open a published lesson, play, try it yourself, save/restore work, and resolve conflicts). The panel is static product guidance only; it does not change recording, storage, identity, or playback architecture. The full operator script lives in `docs/thesis-demo-script.md`.

### Demo Identity panel

`packages/react/src/Panels/InteractiveDevIdentityPanel.tsx` renders demo sign-in controls:

- Sign in as Teacher Demo;
- Sign in as Learner Demo;
- Sign in as Learner Two;
- Sign out.

The panel shows signed-in user, role, auth status, and auth errors. It is intentionally labeled as dev-only and is not production authentication.

Seeded users are non-sequential dev ids:

```ts
type UserRole = 'teacher' | 'learner' | 'both';

interface User {
  id: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

interface Session {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}
```

The browser only receives the current user. Session ids are random, meaningless cookie values and session meaning lives server-side under `.interactive-data/sessions/`.

### Teacher Studio

`packages/react/src/Panels/InteractiveTeacherDashboard.tsx` renders the teacher product flow.

Visible controls:

- New Recording;
- Record Timeline Only;
- Record With Mic;
- Record With Camera;
- Stop Recording;
- Save Draft;
- Load Draft;
- Preview Draft;
- Publish Recording (requires teacher/both demo identity);
- Load Published Lesson;
- Preview Published Lesson;
- Discard Draft;
- Delete Draft;
- Refresh Recordings;
- Export Package;
- Include My Learner Work;
- Import Package;
- Import as Draft;
- Import as Published (requires teacher/both demo identity);
- Demo Seed (requires teacher/both demo identity);
- Reset Demo Data (requires teacher/both demo identity).

Visible status fields use native text and `role="status"` for important async state. Raw ids/timestamps remain visible for thesis validation and are also described as debug details where appropriate:

- Draft status;
- Current draft id;
- Published status;
- Published recording id;
- Recording library status;
- Export Package status;
- Import Package status;
- Import package file;
- Demo data status;
- Recording storage source;
- Recording duration;
- Recording status;
- Playback status;
- Playhead;
- Event count;
- Media status/kind/duration/MIME/error.

### Recording libraries

`packages/react/src/Panels/InteractiveRecordingLibrary.tsx` renders simple accessible recording selectors and list cards. The Teacher Studio shows two lists:

- **Local drafts** from `IndexedDBInteractiveTimelineStorage`;
- **Published Lessons** from `RemoteInteractiveTimelineStorage` and `.interactive-data/`.

Each list item shows:

- recording id;
- lesson id;
- version;
- media kind (`none`, `audio`, or `webcam`);
- duration;
- event count;
- source (`draft` or `published`);
- created/started time.

Actions remain intentionally simple: select a recording, then use the nearby load/preview/delete buttons.

### Learner Lesson

`packages/react/src/Panels/InteractiveLearnerPlayback.tsx` renders the learner product flow.

Visible controls:

- Published lessons selector;
- Open Published Lesson;
- Play Lesson;
- Try It Yourself;
- Resume Teacher;
- Save My Work (requires learner/both demo identity);
- Restore My Work (requires learner/both demo identity).

Learner-facing labels replace the older debug wording:

| Previous POC label | Milestone D product label |
| --- | --- |
| Pause & Try It | Try It Yourself |
| Save Learner Delta | Save My Work |
| Restore Learner Delta | Restore My Work |
| Learner delta status | Work status |
| Learner delta count | Saved work count |
| Conflict status | Conflict warning |

The file-level data model is unchanged, but ownership is now enforced: “My Work” is a learner-owned `LearnerDelta` whose `userId` comes from the signed-in learner for new saves. It is still keyed by lesson, teacher recording id/version, teacher timestamp, and base teacher file hash.

### Record Timeline Only / Record With Mic / Record With Camera

Starts a local `TimelineRecorder` while the lesson is fully loaded and the mode is `idle`. `Record Timeline Only` keeps the original timeline-only behavior. `Record With Mic` prepares an audio `MediaStream` through `getUserMedia({ audio: true })`; `Record With Camera` prepares a webcam stream through `getUserMedia({ audio: true, video: true })`.

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

Stopping also updates product status such as draft status, current draft id, recording duration, event count, media kind, media status, and media duration.

### Save Draft

Saves the current stopped teacher recording draft through the async storage adapter. The default browser adapter writes the draft metadata to IndexedDB, stores media blobs in the IndexedDB `mediaAssets` store, and mirrors the latest teacher recording metadata to the compatibility key:

```text
interactive-poc.teacherRecording
```

Saving a draft does not mutate learner deltas and does not contact a backend. Media blobs are not mirrored to localStorage.

### Load Draft

Loads the selected local teacher recording draft from IndexedDB through the async storage adapter, falling back to the latest draft when no selector value exists. Associated media assets are loaded from the IndexedDB `mediaAssets` store using the recording's media asset ids/metadata. If IndexedDB is unavailable, the adapter falls back to the localStorage compatibility adapter for timeline data only. Loading also refreshes the `interactive-poc.teacherRecording` mirror so existing POC debugging/tests can inspect the latest recording shape.

### Preview Draft

Previews the currently loaded/saved draft using the same timeline playback engine as learner playback. If a media asset is loaded, the media element drives timeline time via `media.currentTime * 1000`; otherwise the fallback `TimelinePlaybackClock` drives replay. Preview does not start recording and does not mutate the saved draft.

### Discard Draft

Clears the current in-memory draft/media selection and marks the Teacher Studio as discarded. Milestone H requires an inline confirmation before discarding. Normal discard keeps persisted localStorage compatibility keys in place and does not delete learner deltas or IndexedDB media assets. The separate **Reset Demo Data** control is the only action that explicitly clears demo compatibility keys.

### Delete Draft

Deletes the selected local IndexedDB draft and associated local media assets after an inline confirmation. It does not delete published recordings, learner deltas, non-selected drafts, or `.interactive-data` server records.

### Publish Recording

Publishes the current stopped teacher recording draft through `RemoteInteractiveTimelineStorage`. This action is disabled unless the current dev user has role `teacher` or `both`.

Behavior:

- keeps Save Draft / Load Draft on the IndexedDB adapter;
- saves teacher recording metadata, base files, structured timeline events, and owner fields to `/api/interactive/teacher-recordings`;
- uploads each media Blob with `FormData` to `/api/interactive/media-assets` after the server verifies the media belongs to a recording owned by the teacher;
- stores only media metadata on `TeacherRecording.mediaAssets`;
- marks the current recording source as `published` so learner deltas use the remote adapter;
- does not delete the local IndexedDB draft.

Published teacher recordings are treated as immutable and owner-scoped. Re-publishing the same id with different JSON is rejected by the dev backend, and a different teacher cannot claim an existing recording id.

### Load Published Lesson

Loads the selected published recording from the backend/dev storage through `RemoteInteractiveTimelineStorage`, falling back to the latest published recording when no selector value exists.

Behavior:

- lists published recordings from `/api/interactive/teacher-recordings`;
- loads the latest recording by id;
- loads associated media metadata and Blob data through `/api/interactive/media-assets`;
- sets the current recording source to `published`;
- recomputes remote saved work count, restore availability, and conflict warning state.

### Preview Published Lesson

Previews the currently loaded published recording using the same playback engine as local draft preview. If media exists, `HTMLMediaElement.currentTime * 1000` drives the structured timeline. If no media exists, `TimelinePlaybackClock` remains the fallback. Preview does not mutate the published recording.

### Export Package

The Teacher Studio export action resolves the selected published recording first, then the selected/current local draft as a fallback. The export helper loads the immutable `TeacherRecording`, associated media metadata, and associated media Blob data through the active storage adapter.

The downloaded package is JSON-first. Media blobs are serialized to base64 inside the package for portability between thesis demo machines. The helper creates a temporary object URL for the JSON Blob download and revokes that URL after triggering the download. Export does not mutate the teacher recording, does not expose dev session ids, and includes learner deltas only when **Include My Learner Work** is selected. That optional learner export is scoped to the current signed-in user.

### Import Package

The Teacher Studio package import flow accepts the JSON package format, validates it, normalizes paths to leading-slash form, and imports as a copy by generating a new recording id and new media asset ids.

Import targets:

- **Import as Draft** writes the copied recording and media blobs to IndexedDB through `IndexedDBInteractiveTimelineStorage`, then selects the imported local draft for preview.
- **Import as Published** writes the copied recording and media blobs through `RemoteInteractiveTimelineStorage`. This requires a teacher/both demo session. The dev backend continues to enforce published recording immutability after import.

Import does not run automatic merge, does not apply learner deltas by default, and does not remove existing recordings. Imported published recordings appear in the learner published lesson list after refresh/load. Unsupported package versions and malformed JSON show friendly import status messages. Packages that reference media without including media data still import the structured recording copy; missing media is skipped with an import warning and playback falls back to the deterministic timeline clock.

### Demo Seed and Reset Demo Data

Milestone H keeps deterministic thesis demo controls and adds inline confirmation for reset:

- **Demo Seed** calls `/api/interactive/demo/seed` as a signed-in teacher/both user. It recreates `demo-interactive-conflict-flow` with deterministic base files, timeline events, a future teacher change on `/example.js`, and a fake silent `audio/wav` media asset. The recording is designed for the conflict walkthrough: learner pauses before the future teacher edit, saves work, resumes teacher playback, then chooses an explicit conflict restore option.
- **Reset Demo Data** asks for confirmation, then calls `/api/interactive/demo/reset` as a signed-in teacher/both user. It deletes only server-side records whose ids or linked recording ids use the `demo-` prefix. The client also deletes local IndexedDB draft/media records with the same prefix and clears the localStorage compatibility keys because the button is explicitly labeled as a demo reset.

Reset is intentionally not a destructive “delete everything” action. Non-demo recordings, non-demo media, non-demo learner deltas, and dev sessions are left in place.

### Play Lesson

Plays the currently opened teacher recording through the async storage adapter and replays it in `teacher-playback` mode. If no recording has been opened yet, it falls back to the active adapter's latest recording for compatibility with local draft tests.

Behavior:

- loads the current published recording from remote storage when one is active, otherwise loads the latest local draft from IndexedDB or the `interactive-poc.teacherRecording` compatibility key;
- loads associated media assets from the active storage adapter when the recording references them;
- resets the workspace to the recording base files for a fresh playback;
- sorts events by `tMs`, then `seq`;
- when media is loaded, uses the media element's `currentTime` in seconds as the source of truth and applies due events where `event.tMs <= currentTime * 1000`;
- when media is absent, advances one `requestAnimationFrame` timeline clock and applies due events in order;
- updates playback status and playhead product status text;
- uses a playback guard so programmatic changes are not recorded.

Currently applied event types:

- `file.opened`: selects the file;
- `file.changed`: updates the file content;
- `editor.scrolled`: restores scroll position and selects the event file when present.

### Try It Yourself

The `Try It Yourself` button stops the active playback driver and switches to learner edit mode. If media is driving playback, the media element is paused before learner editing starts.

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

### Save My Work

`Save My Work` saves learner-owned file-level changes while paused in learner edit mode. This action is disabled unless the current dev user has role `learner` or `both`.

Behavior:

1. loads the immutable teacher recording;
2. materializes teacher files at the paused timestamp;
3. reads the current learner workspace files;
4. diffs teacher-at-pause files against learner files;
5. saves a `LearnerDelta` through the active async storage adapter using the signed-in learner id: local drafts use IndexedDB, published recordings use `RemoteInteractiveTimelineStorage`; both paths keep the `interactive-poc.learnerDeltas` compatibility mirror;
6. recomputes saved work count, restore availability, and conflict warning state.

The delta is keyed by:

- lesson id;
- teacher recording id;
- teacher recording version;
- teacher timestamp;
- base teacher files hash.

### Restore My Work

`Restore My Work` restores the latest matching learner delta for the signed-in learner without changing the teacher recording. Learner Two cannot restore Learner Demo work.

A delta is considered restorable when:

- its `teacherRecordingId` matches the loaded teacher recording;
- its `teacherRecordingVersion` matches the loaded teacher recording;
- its `baseTeacherFilesHash` matches the materialized teacher state at `teacherTimestampMs`.

No-conflict behavior remains one click:

- materializes teacher files at the delta timestamp;
- applies the learner file-level delta over that base;
- updates existing TutorialKit files in the workspace;
- restores `selectedFile` when it still exists;
- does not add/remove file-tree entries in the current UI.

If conflicts exist, `Restore My Work` does not immediately apply the delta. It opens the Milestone F conflict resolution panel instead.

### Conflict warning and resolution

Phase 6 added non-destructive conflict detection. Milestone F keeps that detection client-side and adds explicit learner choices.

Visible learner fields:

```text
Conflict warning: none | conflict
Conflicted files: /example.js, ...
```

When conflicts exist, Learner Lesson also shows:

```text
Conflict warning: your saved work touches files the teacher changed later.
```

A conflict exists when:

- the learner delta changes a file path in `addedOrModified` or `removed`;
- the teacher recording has a later event with `tMs > delta.teacherTimestampMs`;
- the later teacher event modifies the same file path;
- conflict detection considers only `file.changed` as a teacher-modifying event type.

When the learner attempts a conflicted restore, the conflict resolution panel offers:

- **Restore My Work Anyway**: applies the saved learner delta exactly as before and sets status to `restored with conflicts`;
- **Keep Teacher Version**: closes the panel, leaves the current teacher/materialized workspace state visible, and sets status to `kept teacher version`;
- **View Conflict Details**: expands per-file details with file path, learner-changed-file marker, later teacher event timestamp, teacher event id, and teacher event seq when present;
- **Cancel**: closes the panel without changing files.

Conflict resolution is explicit and non-merge:

- it does not run automatic merge;
- it does not compute text patches or hunk merges;
- it does not mutate `TeacherRecording`;
- it does not mutate or delete the saved `LearnerDelta`;
- it does not create a merged delta or conflict-resolution record yet.

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
  createdByUserId?: string;
  ownerUserId?: string;
  publishedByUserId?: string;
  publishedAt?: string;
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
- `ownerUserId` / `createdByUserId` / `publishedByUserId`: Milestone E ownership fields. Legacy recordings that lack these fields are treated as owned by Teacher Demo during load/migration.
- `publishedAt`: server publish timestamp for newly published recordings.

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
  ownerUserId?: string;
}

interface RecordingMediaAsset extends RecordingMediaAssetMetadata {
  blob?: Blob;
}
```

Meaning:

- `audio` assets are produced by `getUserMedia({ audio: true })` and recorded with `MediaRecorder`;
- `webcam` assets are produced by `getUserMedia({ audio: true, video: true })` when browser/device support is available;
- `TeacherRecording.mediaAssets` stores only `RecordingMediaAssetMetadata`;
- IndexedDB stores local draft `RecordingMediaAsset` records including the `Blob`;
- backend/dev storage stores published media files and metadata in `.interactive-data/media-assets/`; media uploads require a teacher/both session and must point at a recording owned by that teacher;
- localStorage mirrors never store media blobs.

### InteractiveRecordingPackage

Source type lives in `packages/runtime/src/interactive-timeline/export-package.ts`.

```ts
interface InteractiveRecordingPackage {
  formatVersion: 1;
  exportedAt: string;
  teacherRecording: TeacherRecording;
  mediaAssets: Array<{
    metadata: RecordingMediaAssetMetadata;
    blob?: Blob;
    dataBase64?: string;
  }>;
  learnerDeltas?: LearnerDelta[];
  packageMetadata?: {
    title?: string;
    description?: string;
    exportedByUserId?: string;
  };
}
```

Meaning:

- `formatVersion: 1` is the current POC/demo package version;
- `teacherRecording` remains structured timeline JSON with base files/events and media metadata references;
- `mediaAssets` carries media metadata plus Blob data in memory or base64 data in serialized JSON;
- `learnerDeltas` are optional and omitted by default;
- `packageMetadata` is descriptive only and must not contain session ids or secrets.

Validation checks supported format version, safe ids, event `tMs`/`seq` number fields, normalized paths, teacher recording presence, event array presence, and media metadata/data consistency. The package format is intentionally simple and not a stable public API yet.

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
- `userId`: signed-in learner id for new saves. Legacy `local-poc-user` deltas are readable only through the Learner Demo fallback path;
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
  eventSeq?: number;
  teacherTimestampMs: number;
}

interface LearnerDeltaConflictDetail {
  filePath: string;
  learnerChangedFile: true;
  teacherChangedSameFileAfterLearnerTimestamp: true;
  teacherEventId: string;
  teacherEventSeq?: number;
  teacherEventTimestampMs: number;
}

interface LearnerDeltaConflicts {
  filePaths: string[];
  events: LearnerDeltaConflictEvent[];
  details: LearnerDeltaConflictDetail[];
}
```

`getLearnerDeltaConflicts(recording, delta)` returns:

- `filePaths`: sorted normalized paths with conflicts;
- `events`: matching later teacher `file.changed` events with ids, seq values when present, and timestamps;
- `details`: per-file/event details used by the conflict resolution panel.

The React hook displays `filePaths` as `Conflict warning` and `Conflicted files`, and passes `details` to the Milestone F resolution panel.

## 3. Storage

Milestone H uses the same async storage adapter seam with two concrete browser-facing storage paths plus package import/export helpers layered on top:

- `IndexedDBInteractiveTimelineStorage` for local drafts/offline browser data;
- `RemoteInteractiveTimelineStorage` for published/backend demo data.

The local browser implementation writes structured timeline data and media blobs to IndexedDB while mirroring the legacy localStorage keys for compatibility with existing tests and manual debugging. The remote adapter uses credentialed `fetch` to call `/api/interactive/*` and stores demo data in `.interactive-data/` through the Astro dev/preview server.

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

### Backend/dev `.interactive-data` storage

Milestone C introduced, and Milestone H continues to use, local server-side persistence under the gitignored repository directory:

```text
.interactive-data/
  teacher-recordings/
    <recordingId>.json
  learner-deltas/
    <deltaId>.json
  media-assets/
    <assetId>.json
    <assetId>-<serverGeneratedId>.<ext>
  sessions/
    <sessionId>.json
```

Demo seed/reset uses the same directories and only deletes records with the `demo-` prefix or media/deltas linked to those demo recordings.

The dev backend is intentionally small and file-based. It is not a production database or object-storage layer. Media files are stored outside the public webroot and are served only through `/api/interactive/media-assets/:id?blob=1`.

### API endpoints

The backend/dev server exposes:

```text
POST /api/interactive/teacher-recordings
GET  /api/interactive/teacher-recordings
GET  /api/interactive/teacher-recordings/:id
POST /api/interactive/learner-deltas
GET  /api/interactive/learner-deltas?lessonId=&teacherRecordingId=
GET  /api/interactive/learner-deltas/latest?lessonId=&teacherRecordingId=
POST /api/interactive/media-assets
GET  /api/interactive/media-assets/:id
GET  /api/interactive/media-assets/:id?blob=1
GET  /api/interactive/media-assets?recordingId=
DELETE /api/interactive/media-assets/:id
GET  /api/interactive/auth/me
POST /api/interactive/auth/dev-login
POST /api/interactive/auth/logout
GET  /api/interactive/users/dev
POST /api/interactive/demo/seed
POST /api/interactive/demo/reset
```

Media upload uses `FormData`/`multipart/form-data` from the remote adapter. Auth endpoints set an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie named `interactive_session`; `Secure` is added under HTTPS. The cookie contains only the random session id, never user profile fields. The server validates basic JSON shape, safe ids, leading-slash file paths, expected media MIME types, size limits, and simple file signatures. It ignores client filenames and generates server-side stored media filenames.

### `interactive-poc.learnerDeltas` compatibility mirror

Stores a serialized array of `LearnerDelta` objects:

```ts
localStorage.setItem('interactive-poc.learnerDeltas', JSON.stringify(deltas));
```

The IndexedDB adapter mirrors the full learner-delta array to this key after saves. The remote adapter mirrors remote learner delta query results after remote saves/loads so existing debug inspection remains useful. Loading returns an empty array when no deltas exist. Restore currently considers the latest matching delta. Media blobs are intentionally excluded from localStorage.

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

### `export-package.ts`

Defines the portable package helpers:

- `InteractiveRecordingPackage` and media package entry types;
- `exportRecordingPackage(recordingId, options)` to load a teacher recording, scoped optional learner deltas, media metadata, and media blobs through a storage adapter;
- `serializeRecordingPackage(package)` to emit JSON with base64 media data;
- `downloadRecordingPackage(package)` to create and revoke a temporary Blob object URL;
- `parseRecordingPackage(fileOrText)` and `validateRecordingPackage(package)` for import validation;
- `importRecordingPackage(package, target)` to import as a local draft or published/dev copy without mutating the source recording.

### `identity.ts`

Defines the Milestone E demo identity contracts, seeded non-sequential dev users, legacy fallback ids, and small role helpers used by React and the dev server.

### `auth-client.ts`

Exposes small client helpers over `RemoteInteractiveTimelineStorage`:

- `loadCurrentUser()`;
- `devLogin(userId)`;
- `logout()`;
- `listDevUsers()`.

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

### `remote-storage-adapter.ts`

Implements `RemoteInteractiveTimelineStorage`. It is the only interactivity module that uses `fetch`, and it sends `credentials: 'same-origin'` so the demo session cookie is included. It maps the async storage interface to `/api/interactive/*` endpoints, uploads media with `FormData`, and exposes dev demo seed/reset calls. It mirrors loaded/saved published teacher recordings and remote learner deltas to the legacy localStorage keys for inspection, but it does not store media blobs in localStorage.

### `packages/astro/src/vite-plugins/interactive-persistence.ts`

Provides the local backend/dev persistence and dev auth/session handlers. During Astro dev it installs API middleware. During E2E preview, `e2e/scripts/preview-with-interactive-api.mjs` serves static build output and mounts the same API middleware.

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
- published recording publish/load/preview lifecycle;
- export/import package lifecycle;
- deterministic demo seed/reset lifecycle;
- demo identity load/login/logout lifecycle;
- storage selection between local draft and remote published adapters;
- async storage calls and compatibility state sync;
- media-synced playback and fallback clock playback lifecycle;
- pause/resume mode transitions;
- playback guard;
- learner delta save/restore;
- latest matching delta detection;
- conflict warning recomputation;
- product control model returned to the UI.

Current modes:

```ts
type InteractiveMode = 'teacher-playback' | 'learner-editing' | 'idle';
```

Current playback statuses:

```ts
type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'finished' | 'missing-recording';
```

### `InteractivePocControls.tsx`

`packages/react/src/Panels/InteractivePocControls.tsx` renders the Milestone H role shell with Demo Identity, the demo walkthrough, Teacher Studio, and Learner Lesson views. It receives a control model from `useInteractivePoc` and does not own persistence, timeline, package, or workspace logic.

### `InteractiveTeacherDashboard.tsx`

Renders the teacher product dashboard, local draft controls, published recording controls, package export/import controls, demo seed/reset controls, media preview element, and teacher-facing status text.

### `InteractiveLearnerPlayback.tsx`

Renders the learner product playback view with published lessons, Open Published Lesson, Play Lesson, Try It Yourself, Save My Work, Restore My Work, Conflict Warning status, and the conflict resolution panel/actions.

### `InteractiveRecordingLibrary.tsx`

Renders the shared select/list-card recording library for local drafts and published recordings.

### `InteractiveAuthoringPanel.tsx`

Legacy small authoring panel retained for compatibility with earlier POC extraction, but the product shell now uses `InteractiveTeacherDashboard.tsx`.

## 6. Current limitations

Known limitations are intentional for the POC:

- local IndexedDB/localStorage compatibility storage remains required for drafts;
- backend persistence is file-based dev/demo storage only;
- dev/demo identity only; no production authentication;
- no passwords, OAuth/OIDC, email verification, or MFA;
- no production database;
- no production object storage or cloud media bucket;
- export/import package format is POC/demo-only and not a stable public API;
- package serialization is JSON/base64, not a streaming or ZIP archive format;
- no merge engine;
- no automatic merge;
- no patch-based/hunk-level deltas;
- no persisted conflict-resolution records yet;
- product-facing POC UI exists, but it is not final production design;
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
- recording libraries are simple selectors/list cards, not a final history drawer or table component.

## 7. Next phases

Candidate future phases:

1. **Richer playback clock controls**
   - support seeking, speed, drift correction, cancellation, and deterministic replay state.

2. **Production persistence hardening**
   - replace `.interactive-data/` with a real database/object-storage implementation behind the same remote adapter contract.

3. **Package format hardening**
   - add stable schema/version migration, checksums, and optional archive packaging if export becomes a product API.

4. **Production auth/user ownership hardening**
   - replace dev sessions with production authentication, authorization, ownership transfer, and audit rules.

5. **Richer conflict resolution persistence**
   - persist learner conflict-resolution decisions if product needs audit/history;
   - add richer side-by-side file views without automatic merge;
   - keep detection separate from any future resolution records.

6. **Production UI polish**
   - improve layout, history drawers, empty states, and workspace mode affordances beyond the Milestone H thesis-demo shell.

7. **Optional transcript/captions**
   - attach transcript metadata to teacher timeline events without changing the learner delta model.

8. **Optional richer capture**
   - screen, terminal, and preview capture should remain out of scope until the editor/file timeline plus media narration path is stable.
