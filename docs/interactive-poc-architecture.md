# Interactive POC architecture

This document is the detailed architecture checkpoint for the interactive tutorial thesis demo. It includes separated lecture setup/material preparation, a full-screen structured recording studio, recording review, a shared seekable editor player, and timestamped learner experiments. It also covers identity/session boundaries, ownership, optional mic/webcam media, local drafts, development publishing, export/import, and deterministic seed/reset. A shorter review-oriented view is available in `docs/thesis-architecture-summary.md`; focused flows are documented in `docs/interactive-recording-studio.md` and `docs/learner-timeline-experiments.md`.

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
- saved learner work appears as user-scoped markers at its exact teacher timestamp;
- normal playback always reconstructs teacher truth and ignores markers unless the learner explicitly opens one;
- opening a marker reconstructs its historical teacher state and applies the learner delta without treating later teacher edits as conflicts;
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
- **Published recordings use remote storage.** Published/demo data is written through `RemoteInteractiveTimelineStorage` to `/api/interactive/*` endpoints backed by `.interactive-data/`. Publishing/import/fixtures require a demo teacher/both session; whole-publication deletion additionally requires matching teacher ownership.
- **Export packages are thesis-demo artifacts.** The package format is JSON-first for thesis portability. It is not a stable public API and does not replace the structured replay or storage adapter contracts.

## 1. Current user flow

The UI now uses a full-viewport product root mounted in `#interactive-experience-root`, a dedicated Astro application region outside the normal TutorialKit resizable layout. The standard layout remains mounted but becomes `inert` and `aria-hidden` while the product is active. Teacher Studio and Interactive Lessons are management screens; material preparation, active recording, recording review, and learner playback are immersive workspace screens. `InteractiveExperienceProvider` owns explicit reducer state and separates a library selection from the active player recording. `InteractiveExperienceRoot`, `InteractiveManagementShell`, and `InteractiveWorkspaceShell` enforce management/workspace ownership. `InteractiveWorkspaceSurface.tsx` composes the persistent editor with opt-in, resizable lesson explanation and live terminal panels. `InteractiveVideoControls.tsx` supplies the shared full-width bottom transport, accessible seek range, media surface, learner markers, keyboard controls, and experiment drawer. See `docs/immersive-interactive-experience.md`.

`packages/react/src/Panels/InteractivePocControls.tsx` presents two minimal role views while the workspace orchestrator keeps management physically separated from the editor:

- **Teacher Studio** for lecture setup and opening draft or published recording cards.
- **Interactive Lessons** for choosing and starting a published lesson.

Technical status, package import/export, seed/reset, and walkthrough controls are intentionally absent from default management UI. Their underlying POC contracts remain available for automated validation.

### Account panel

`packages/react/src/Panels/InteractiveDevIdentityPanel.tsx` renders a compact **Account** selector with Teacher Demo, Learner Demo, and Learner Two plus Sign out. The selected user and role remain visible without occupying a full workflow panel. Auth status and errors remain available to assistive technology. This remains development identity rather than production authentication.

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

`packages/react/src/Panels/InteractiveTeacherDashboard.tsx` renders only Lecture Setup and product-facing recording cards. `WorkspacePanel.tsx` coordinates four teacher stages: `setup`, `materials`, `recording`, and `review`.

Lecture Setup contains initial-file selection, Editor only / microphone / camera-and-microphone modes, **Edit Materials**, and **Start Recording**. Recording uses the dedicated studio and **Stop Recording** action. Recording Review exclusively owns playback, **Save Draft**, and **Publish**. Teacher Studio cards provide **Open Review**, **View Lesson**, confirmed contextual draft deletion, and owner-only confirmed published-lesson deletion without exposing recording IDs, versions, event counts, storage sources, or media diagnostics. Published deletion is a dedicated remote cascade over the exact recording ID, linked media, and learner experiments.

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

`InteractiveLearnerLibrary.tsx`, the immersive workspace shell in `WorkspacePanel.tsx`, and `InteractiveVideoControls.tsx` render the learner product flow.

Visible controls:

- Published lessons selector;
- Start Lesson;
- Play;
- Pause and Experiment;
- Return to Lecture;
- Save Experiment (requires learner/both demo identity);
- timestamped experiment markers and **My Experiments** entries;
- Save and Resume, Resume Without Saving, and Cancel when work is dirty.

The file-level data model is unchanged, but presentation and restoration follow a historical-branch model. Each learner-owned `LearnerDelta` is keyed by lesson, teacher recording id/version, teacher timestamp, base teacher file hash, and server-derived learner identity. One visible marker groups saves at each timestamp.

### Start Recording

Lecture Setup selects timeline-only, microphone, or camera mode and then uses one **Start Recording** action. It starts a local `TimelineRecorder` while the lesson is fully loaded and mode is `idle`. Audio mode prepares `getUserMedia({ audio: true })`; camera mode prepares `getUserMedia({ audio: true, video: true })` and exposes the live stream to the studio HUD for a local preview.

Behavior:

- captures normalized workspace files plus loaded editor documents as `TeacherRecording.baseFiles`, including material-preparation edits;
- creates a new `TeacherRecording` with `version: 1`;
- starts media and timeline recording from the same local start timestamp when media preparation succeeds;
- appends an initial `recording.started` event and records the selected initial file at `tMs: 0`;
- begins wrapping editor/file callbacks to record teacher actions;
- falls back to timeline-only recording with a visible media error/unavailable status when media APIs or permissions fail.

Recorded callback events currently include:

- `file.opened` when a file is selected;
- `file.created` when the integrated file-tree callback creates a file;
- `file.changed` when editor content changes;
- `editor.scrolled` when the editor scroll position changes.

The recording stage uses a fixed full-viewport child around the existing mounted editor rather than a browser popup or second editor instance. A `beforeunload` confirmation guards accidental refresh/navigation.

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

### Discard Draft compatibility action

The internal compatibility model can clear an in-memory draft/media selection without deleting persisted data. This is not exposed on the current minimal Teacher Studio; persisted drafts use the explicit, confirmed **Delete Draft** card action instead.

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
- deletes the successfully published matching IndexedDB draft and its local media so it appears only under Published Lessons;
- retains the published recording in the compatibility mirror for playback inspection without treating that mirror as a draft.

Published recording content is immutable while it exists: re-publishing the same id with different JSON is rejected, and a different teacher cannot claim an existing recording id. The owner can explicitly delete the whole published lesson through the separate destructive lifecycle below.

### Load Published Lesson

Loads the selected published recording from the backend/dev storage through `RemoteInteractiveTimelineStorage`, falling back to the latest published recording when no selector value exists.

Behavior:

- lists published recordings from `/api/interactive/teacher-recordings`;
- loads the latest recording by id;
- loads associated media metadata and Blob data through `/api/interactive/media-assets`;
- sets the current recording source to `published`;
- recomputes user-scoped experiment markers and saved-version counts.

### Preview Published Lesson

Previews the currently loaded published recording using the same playback engine as local draft preview. Published Recording Review is read-only: it shows **Published** and does not expose **Save Draft** or **Publish**. If media exists, `HTMLMediaElement.currentTime * 1000` drives the structured timeline. If no media exists, `TimelinePlaybackClock` remains the fallback. Preview never creates a local draft or mutates the publication.

### Delete Published Lesson

An owner-only, two-step **Delete Lesson** / **Confirm Delete** card action calls `DELETE /api/interactive/teacher-recordings/:id`. The dev backend verifies the teacher session and normalized recording owner, then deletes that exact recording, linked media metadata/files, and learner deltas. Unrelated drafts, recordings, media, learner work, and lesson source files remain intact. Deleting a currently loaded publication also clears its playback selection and matching compatibility mirror.

### Export Package compatibility capability

The retained package export capability resolves the selected published recording first, then the selected/current local draft as a fallback. The export helper loads the immutable `TeacherRecording`, associated media metadata, and associated media Blob data through the active storage adapter.

The downloaded package is JSON-first. Media blobs are serialized to base64 inside the package for portability between thesis demo machines. The helper creates a temporary object URL for the JSON Blob download and revokes that URL after triggering the download. Export does not mutate the teacher recording, does not expose dev session ids, and includes learner deltas only when **Include My Learner Work** is selected. That optional learner export is scoped to the current signed-in user.

### Import Package compatibility capability

The retained package import flow accepts the JSON package format, validates it, normalizes paths to leading-slash form, and imports as a copy by generating a new recording id and new media asset ids.

Import targets:

- **Import as Draft** writes the copied recording and media blobs to IndexedDB through `IndexedDBInteractiveTimelineStorage`, then selects the imported local draft for preview.
- **Import as Published** writes the copied recording and media blobs through `RemoteInteractiveTimelineStorage`. This requires a teacher/both demo session. The dev backend continues to enforce published recording immutability after import.

Import does not run automatic merge, does not apply learner deltas by default, and does not remove existing recordings. Imported published recordings appear in the learner published lesson list after refresh/load. Unsupported package versions and malformed JSON show friendly import status messages. Packages that reference media without including media data still import the structured recording copy; missing media is skipped with an import warning and playback falls back to the deterministic timeline clock.

### Demo Seed and Reset compatibility capabilities

Deterministic seed/reset endpoints and client methods remain available for automated fixtures and diagnostics but are not exposed in the current minimal management UI:

- **Demo Seed** calls `/api/interactive/demo/seed` as a signed-in teacher/both user. It recreates `demo-interactive-conflict-flow` with deterministic base files, timeline events, a future teacher change on `/example.js`, and a fake silent `audio/wav` media asset. The recording is designed for the conflict walkthrough: learner pauses before the future teacher edit, saves work, resumes teacher playback, then chooses an explicit conflict restore option.
- **Reset Demo Data** asks for confirmation, then calls `/api/interactive/demo/reset` as a signed-in teacher/both user. It deletes only server-side records whose ids or linked recording ids use the `demo-` prefix. The client also deletes local IndexedDB draft/media records with the same prefix and clears the localStorage compatibility keys because the button is explicitly labeled as a demo reset.

Reset is intentionally not a destructive “delete everything” action. Non-demo recordings, non-demo media, non-demo learner deltas, and dev sessions are left in place.

### Play

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
- `file.created`: restores a teacher-created file and its initial content through the trusted programmatic store path;
- `file.changed`: restores or updates the file content;
- `editor.scrolled`: restores scroll position and selects the event file when present.

The shared editor player exposes pause, restart, and deterministic seek. Seeking pauses the driver, restores base files, reapplies ordered events through the selected timestamp, and aligns loaded media. Continuing after a seek starts from that materialized state.

### Pause and Experiment

The `Pause and Experiment` button stops the active playback driver and switches to learner edit mode. If media is driving playback, the media element is paused before learner editing starts.

Behavior:

- computes the current teacher timestamp;
- stores it as the paused teacher timestamp;
- sets mode to `learner-editing`;
- sets playback status to `paused`;
- does not mutate the saved teacher recording.

### Return to Lecture

Returning from `learner-editing` never continues over the learner workspace. The player reconstructs the immutable teacher state at `pausedTeacherTimestampMs`, aligns media to that timestamp, and then continues ordered teacher events. Saved learner experiments remain separate and recoverable. If the learner workspace is dirty, the UI requires **Save and Resume**, **Resume Without Saving**, or **Cancel**.

### Save Experiment

`Save Experiment` materializes teacher files at the experiment anchor, diffs them against the learner workspace, and stores a user-scoped `LearnerDelta` through the active adapter. The delta remains keyed by lesson, teacher recording id/version, teacher timestamp, historical base hash, and learner identity. Saving creates a violet timeline marker and **My Experiments** entry. Multiple saves at one timestamp are retained but grouped behind one marker whose latest version opens by default.

### Open experiment marker

Selecting a marker validates recording id/version and the historical base hash, reconstructs teacher state at `teacherTimestampMs`, applies the full learner file delta, restores selected file, aligns media, and enters `learner-editing`. Trusted programmatic file operations restore learner-added files and remove files absent from the checkpoint result while playback guards suppress recording.

A later teacher event on the same path is not a conflict: it belongs to a later lecture timestamp and is shown only during normal playback. The old later-event conflict panel is no longer part of the learner flow. A base-hash/version mismatch instead reports an exceptional incompatible lecture version; no automatic merge is attempted.

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
  | 'file.created'
  | 'file.changed'
  | 'editor.scrolled'
  | 'editor.selection.changed'
  | 'pointer.changed'
  | 'pointer.clicked'
  | 'presentation.changed'
  | 'whiteboard.scene.changed'
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

interface EditorSelectionChangedPayload {
  anchor: number;
  head: number;
}

interface WhiteboardSceneChangedPayload {
  resourceId: string;
  scene: WhiteboardScene;
}

interface TeacherPointerChangedPayload {
  surface: 'experience' | 'workspace' | 'preview';
  x: number;
  y: number;
  visible: boolean;
  coordinateSpaceVersion?: 2 | 3;
  anchor?: EditorPointerAnchor | ElementPointerAnchor;
}

interface TeacherPointerClickedPayload {
  surface: 'experience' | 'workspace' | 'preview';
  x: number;
  y: number;
  button: 'left' | 'right';
  coordinateSpaceVersion?: 2 | 3;
  anchor?: EditorPointerAnchor | ElementPointerAnchor;
}
```

Whiteboards are `PresentationResource` values with an `initialScene`; hidden/minimized/focused state stays exclusively in presentation layout snapshots. Material Preparation updates the initial scene, recording stores complete semantic scene snapshots after meaningful debounced actions, and seeking replays ordered snapshots without pointer animation. Excalidraw is isolated behind the React whiteboard adapter; learners use read-only view mode. Server/package normalization limits each scene to 1,000 elements and 512 KiB, strips transient app state, and rejects malformed references. Image insertion is disabled in v1.

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

### Learner checkpoint view

The React hook derives a presentation model from persisted learner deltas:

```ts
interface LearnerCheckpointView {
  id: string;
  teacherTimestampMs: number;
  createdAt: string;
  changedFileCount: number;
  addedOrModifiedCount: number;
  removedCount: number;
  versionCount: number;
  selectedFile?: string;
}
```

Deltas are grouped by normalized teacher timestamp. The latest `createdAt` version supplies the marker id and changed-file summary, while `versionCount` reports all retained saves at that anchor.

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

The IndexedDB adapter is browser-only guarded and falls back to the localStorage adapter when IndexedDB is unavailable. A migration marker allows at most one import of an unpublished legacy localStorage recording when IndexedDB has no drafts; published playback mirrors are never migrated as drafts. Deleting a matching draft clears its mirror. Media persistence requires IndexedDB; when IndexedDB is unavailable, recording can continue as timeline-only and media save/load reports an error/unavailable state instead of crashing.

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
DELETE /api/interactive/teacher-recordings/:id
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

The IndexedDB adapter mirrors the full learner-delta array to this key after saves. The remote adapter mirrors remote learner delta query results after remote saves/loads so existing debug inspection remains useful. Loading returns an empty array when no deltas exist. The player groups deltas by timestamp and opens the latest saved version behind the selected marker. Media blobs are intentionally excluded from localStorage.

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
- applies `file.created` and `file.changed` payload content up to `untilMs`;
- exposes `materializeTeacherState(recording, untilMs)` and `getFinalTeacherState(recording)`.

### `learner-delta.ts`

Owns file-level learner delta helpers:

- `diffFiles(before, after)`: computes `addedOrModified` and `removed`;
- `applyLearnerDelta(base, delta)`: overlays learner changes onto a base file map;
- `simpleHashFiles(files)`: creates the POC base-state hash used to validate a historical checkpoint base.

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

Defines the async `InteractiveTimelineStorage` boundary used by React. It includes teacher recording, learner delta, teacher draft, explicit published-recording deletion, and media asset methods. `LocalStorageInteractiveTimelineStorage` remains as the compatibility/fallback adapter for timeline data and intentionally does not mirror media blobs.

### `indexeddb-storage-adapter.ts`

Implements `IndexedDBInteractiveTimelineStorage`. It writes teacher drafts, learner deltas, and media assets to IndexedDB, performs a one-time unpublished-only legacy migration, mirrors latest teacher/learner metadata back to the legacy keys, and falls back to `LocalStorageInteractiveTimelineStorage` when IndexedDB is unavailable. Media blobs are stored only in the `mediaAssets` object store.

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
- pause/resume mode transitions with deterministic teacher-state reconstruction;
- playback guard;
- learner experiment save/open and marker grouping;
- historical recording/version/base-hash validation;
- learner workspace dirty-state protection;
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

`packages/react/src/Panels/InteractivePocControls.tsx` supplies management content only. `InteractiveExperienceProvider` owns explicit screen transitions; `InteractiveExperienceRoot` portals the product into the dedicated Astro mount; management and persistent workspace shells enforce valid visibility; `WorkspacePanel.tsx` provides TutorialStore/editor integration; `InteractiveWorkspaceSurface.tsx` owns the collapsible explanation/editor/terminal geometry; `InteractivePresentationLayer.tsx` owns hidden/minimized/focused resource geometry, the fixed right preview window, and same-position layered left windows selected through `frontmostBySide`; `useInteractivePoc` remains the compatibility facade for recording, playback, storage, learner behavior, and teacher/learner presentation state. The existing terminal and preview iframe each have one persistent immersive host and never fall back into management.

### `InteractiveTeacherDashboard.tsx`

Renders only Lecture Setup and product-facing local/published recording cards. Draft and owner-only publication deletion are contextual confirmed card actions. Package/demo/debug/technical controls and duplicate save/publish actions are absent; Recording Review lives in the isolated immersive shell and exclusively owns Save Draft and Publish.

### `InteractiveRecordingStudio.tsx`

Renders the focused red recording HUD, elapsed/media state, optional live webcam preview, and Stop action above the full-screen editor.

### `InteractiveVideoControls.tsx`

Renders the shared full-width teacher/learner transport: custom progress track, accessible range seek, play/pause, restart, time display, synchronized media, keyboard controls, learner markers, experiment actions, dirty-work protection, and the My Experiments drawer.

### `InteractiveLearnerLibrary.tsx`

Renders published lesson discovery and transitions an explicitly selected recording into the isolated learner player.

### `interactive-session.ts`

Defines reducer-driven dashboard, library, preparation, recording, review, and learner-player states while keeping selected and active recording ids distinct.

### `InteractiveRecordingLibrary.tsx`

Renders the shared select/list-card recording library for local drafts and published recordings.

### `InteractiveAuthoringPanel.tsx`

Legacy small authoring panel retained for compatibility with earlier POC extraction, but the product shell now uses `InteractiveTeacherDashboard.tsx`.

## 6. Execution providers

Lessons inherit `runtime` metadata through tutorial, part, chapter, and lesson scopes. Omitted configuration resolves to `{ provider: 'webcontainer' }`. Python lessons use:

```yaml
runtime:
  provider: pyodide
  entrypoint: main.py
  packages: []
  timeoutMs: 3000
```

The shared execution contract exposes capabilities, file-diff synchronization, run, interrupt, reset, disposal, and language-neutral events. Existing JavaScript lessons remain owned by `TutorialRunner` and WebContainer; the compatibility adapter does not replace terminal, filesystem, package, or preview behavior. `PyodideEnvironment` owns a dedicated module worker, synchronizes text files into `/workspace` only before runs/reset, and runs the entrypoint with `runpy.run_path` in a fresh namespace. The editor remains canonical.

Pyodide is loaded lazily from version-pinned npm assets copied into the React package build. Deployment must preserve the existing COOP/COEP headers so `SharedArrayBuffer` interruption is available. If cooperative interruption is delayed, the worker is terminated and recreated while editor files are preserved. Python supports syntax highlighting, multi-file imports, stdout/stderr, tracebacks, stop, and reset. It does not provide a shell, `input()`, arbitrary pip installation, LSP, debugger, sockets, multiprocessing, or browser preview.

Recorded execution events are structured teacher truth. Playback materializes captured output and never runs Python. Learner runs remain local and are not appended to immutable teacher recordings; returning to the lecture restores materialized teacher console output.

| Capability | JavaScript/WebContainer | Python/Pyodide |
| --- | ---: | ---: |
| Syntax highlighting | Yes | Yes |
| Multi-file projects | Yes | Yes |
| stdout/stderr | Yes | Yes |
| Interactive shell | Yes | No in MVP |
| Browser preview | Yes | No |
| Stop execution | Yes | Yes |
| npm/pnpm packages | Yes | No |
| Curated Python packages | N/A | Metadata allow-list only |
| Deterministic recorded output | Yes/extend if needed | Yes |

Authoring fixture: `e2e/src/content/tutorial/tests/python/python-intro/`. Run focused checks with `pnpm --filter @tutorialkit/types test`, `pnpm --filter @tutorialkit/runtime test`, `pnpm --filter @tutorialkit/react test`, and the Python Playwright test. Additional languages should implement `ExecutionEnvironment` and register one factory in `RuntimeManager`, without changing recording or learner-delta models.

## 7. Current limitations

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
- teacher-created files are replayed, but file remove/rename capture is not exposed by the current integrated file-tree UI;
- deterministic timeline seeking is exposed, but production speed, drift correction, captions, and advanced media controls are not;
- editor selection is stored opaquely and not restored as a first-class feature;
- localStorage parsing assumes valid POC JSON;
- recording libraries are simple selectors/list cards, not a final history drawer or table component.

## 8. Next phases

Candidate future phases:

1. **Richer playback clock controls**
   - build on deterministic seeking with speed control, drift correction, cancellation, captions, and keyboard/accessibility evaluation.

2. **Production persistence hardening**
   - replace `.interactive-data/` with a real database/object-storage implementation behind the same remote adapter contract.

3. **Package format hardening**
   - add stable schema/version migration, checksums, and optional archive packaging if export becomes a product API.

4. **Production auth/user ownership hardening**
   - replace dev sessions with production authentication, authorization, ownership transfer, and audit rules.

5. **Richer learner experiment history**
   - add experiment names, deletion, and a chooser for older versions grouped behind one marker;
   - add richer side-by-side views against the historical teacher base;
   - keep any future merge workflow separate from normal lecture playback.

6. **Production UI polish**
   - improve layout, history drawers, empty states, and workspace mode affordances beyond the Milestone H thesis-demo shell.

7. **Optional transcript/captions**
   - attach transcript metadata to teacher timeline events without changing the learner delta model.

8. **Optional richer capture**
   - screen, terminal, and preview capture should remain out of scope until the editor/file timeline plus media narration path is stable.
