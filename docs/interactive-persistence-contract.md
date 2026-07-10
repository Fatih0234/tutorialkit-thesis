# Interactive persistence contract

This document defines the persistence contract for the interactive tutorial thesis demo. Milestone C added a backend/dev publish and load path for teacher recordings, timeline events, media assets, and learner deltas while keeping local IndexedDB draft storage. Milestone D added product-facing teacher and learner flows. Milestone E added a minimal demo identity/session layer and ownership enforcement on top of the same storage contract. Milestone F added explicit conflict resolution UX without changing persistence writes. Milestone G added portable export/import packages plus deterministic demo seed/reset hardening. Milestone H polished product copy, demo guidance, destructive-action confirmation, friendly import errors, missing-media import fallback, and thesis demo documentation without changing the storage architecture. Milestone I freezes that behavior and adds release/evaluation documentation only. It does not add external auth providers, OAuth/OIDC, real passwords, MFA, a production database, paid/cloud object storage, analytics, automatic merge, or production persistence infrastructure.

The contract preserves the local-draft plus remote-published storage behavior. The current learner UX interprets each `LearnerDelta` as a timestamped experiment checkpoint, as described in `docs/learner-timeline-experiments.md`; this changes restoration semantics and presentation without changing the persisted delta shape or adapter boundary.

## Non-goals

This document does not specify or implement:

- production authentication/session middleware;
- production database migrations;
- production storage infrastructure;
- paid/cloud object storage for media blobs;
- merge algorithms;
- automatic conflict merging;
- persisted conflict-resolution decision records;
- stable public export package API guarantees;
- production archive/ZIP storage or streaming package uploads;
- terminal recording persistence;
- preview iframe recording persistence;
- screen recording persistence;
- analytics or telemetry.

## Local-draft, remote-published, identity, experiment, and package status

`InteractiveTimelineStorage` remains the async adapter boundary. `IndexedDBInteractiveTimelineStorage` remains the local draft/offline adapter for teacher drafts, learner deltas, and local media assets. `RemoteInteractiveTimelineStorage` remains the published/demo adapter for teacher recordings, learner deltas, server-backed media assets, demo auth calls, and demo seed/reset calls. Timeline-marker grouping and historical checkpoint reconstruction are client-side behavior over already-loaded recordings and deltas; they add no persistence writes. Export/import package helpers remain layered above the same adapters. Both local and remote paths continue to mirror the legacy POC localStorage keys for manual inspection:

```text
interactive-poc.teacherRecording
interactive-poc.learnerDeltas
```

The mirror is intentionally retained so existing localStorage inspection, migration, and Playwright compatibility checks continue to work. Media blobs are stored only in IndexedDB for local drafts or in `.interactive-data/media-assets/` for published/dev data; they are not mirrored to localStorage. Dev sessions are stored server-side under `.interactive-data/sessions/` and are never mirrored to localStorage. The IndexedDB adapter also imports existing localStorage values when possible and falls back to `LocalStorageInteractiveTimelineStorage` for timeline-only data when IndexedDB is unavailable.

Remote published data is stored by local dev endpoints under `/api/interactive/*` in a gitignored repository directory:

```text
.interactive-data/
  teacher-recordings/
  learner-deltas/
  media-assets/
  sessions/
```

`RemoteInteractiveTimelineStorage` is the only interactivity module that uses `fetch`. It sends `credentials: "same-origin"` for the demo session cookie. Media upload uses `FormData`/`multipart/form-data`. Package downloads are browser Blob downloads and package media is serialized as base64 JSON. No external auth provider, OAuth/OIDC, real password system, production database, or cloud object-storage upload is introduced by Milestone H. Future production backend work should implement the same async adapter contract rather than changing React/workspace behavior directly.


## Current product UX, ownership, experiment, and demo behavior

The current product UI uses the existing adapters and ownership boundary as follows:

- the **Teacher Studio** lists local drafts from IndexedDB and Published Lessons from `/api/interactive/teacher-recordings`;
- the **Learner Lesson** view lists Published Lessons only;
- **Save Experiment** persists a user-scoped `LearnerDelta` and presents it as a timestamped marker;
- **Return to Lecture** reconstructs teacher truth at the anchor timestamp before playback continues;
- selecting a marker reconstructs the historical teacher base and applies the latest learner checkpoint at that timestamp;
- later teacher edits do not create a normal conflict because no merge with a later state is attempted;
- unsaved work uses save/discard/cancel loss protection without adding persistence writes;
- **Export Package** creates a thesis-demo JSON package with teacher recording JSON, media metadata, and base64 media data;
- **Import as Draft** writes a package copy to IndexedDB local draft storage;
- **Import as Published** writes a package copy to remote/dev storage and requires a teacher/both demo session;
- **Demo Seed** creates a deterministic `demo-interactive-conflict-flow` recording with fake audio media and a future conflict-producing teacher edit;
- **Reset Demo Data** asks for inline confirmation, then deletes only `demo-` prefixed records and explicitly clears demo localStorage mirrors;
- **Discard Draft** and **Delete Draft** also require inline confirmation;
- package import errors are surfaced as friendly status text, unsupported package versions are explicit, and missing package media is skipped so structured replay can fall back to the timeline clock;
- “Teacher Studio” and “Learner Lesson” remain product UI sections, and publish/import/demo/save/restore actions check the demo session user role.

`TeacherRecordingDraftSummary` now includes `mediaKind` so list views can show `none`, `audio`, or `webcam` without loading media blobs. Media blobs remain outside localStorage.


## Dev identity/session contract

Milestone E adds demo-only identity types shared by runtime and dev server:

```ts
type InteractiveUserRole = 'teacher' | 'learner' | 'both';

interface User {
  id: string;
  displayName: string;
  role: InteractiveUserRole;
  createdAt: string;
}

interface Session {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}
```

Seeded dev users use non-sequential ids:

- Teacher Demo: `dev-user-teacher-demo-8f4c2a9d`;
- Learner Demo: `dev-user-learner-demo-61b7c3e2`;
- Learner Two: `dev-user-learner-two-927f4d1a`.

Session behavior:

- `POST /api/interactive/auth/dev-login` accepts one of the known dev user ids;
- the server creates a random high-entropy session id;
- `.interactive-data/sessions/<sessionId>.json` stores the server-side session state;
- the response sets an `interactive_session` cookie;
- cookie attributes are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when the request is HTTPS;
- the cookie value is only the random session id and contains no user role/name/email;
- `GET /api/interactive/auth/me` resolves the current user from the session cookie;
- `POST /api/interactive/auth/logout` deletes the server-side session and clears the cookie.

This is not production authentication. There are no passwords, OAuth/OIDC, email verification, MFA, account recovery, or production authorization policies yet.

## 1. Persistence goals

### Teacher recordings are immutable

A saved teacher recording is an append-complete artifact. After creation, learner actions must never mutate:

- teacher recording metadata;
- teacher base files;
- teacher timeline events;
- teacher recording version;
- teacher media asset metadata references.

Corrections or re-recordings should create a new `TeacherRecording` id or a new explicit version, not edit learner-linked history in place.

### Learner deltas are learner-owned

A learner delta is owned by a learner/user and records only that learner's changes relative to a teacher timeline state.

Learner deltas must remain separate from teacher recordings:

- creating a learner delta does not update a teacher recording;
- restoring a learner delta does not update a teacher recording;
- conflict detection reads teacher events but does not write to teacher recordings.

### Learner deltas are tied to teacher context

A `LearnerDelta` must be anchored by:

- `lessonId`;
- `teacherRecordingId`;
- `teacherRecordingVersion`;
- `teacherTimestampMs`;
- `baseTeacherFilesHash`.

This is the minimum context needed to know which teacher file state the learner edited from.

### No silent overwrite

Persistence must support the current safety model:

- resuming lecture playback reconstructs teacher truth instead of continuing over learner files;
- saved learner deltas remain recoverable from their timestamped markers;
- recording id/version and historical base hash are validated before opening a marker;
- backend writes must not silently replace an existing learner delta unless an explicit update/versioning policy is introduced later.

For the first backend phase, prefer append-only learner delta creation over in-place update.

## 2. Proposed resources

These resource shapes mirror the runtime POC types in `packages/runtime/src/interactive-timeline/types.ts`, `packages/runtime/src/interactive-timeline/media.ts`, and `packages/runtime/src/interactive-timeline/learner-delta.ts`.

### `TeacherRecording`

A complete teacher recording for one lesson and one recording version.

```ts
interface TeacherRecording {
  id: string;
  lessonId: string;
  version: number;
  startedAt: string;
  durationMs: number;
  baseFiles: Record<string, string>;
  events: TimelineEvent[];
  mediaAssets?: RecordingMediaAssetMetadata[];
  createdByUserId?: string;
  ownerUserId?: string;
  publishedByUserId?: string;
  publishedAt?: string;
}
```

Notes:

- `baseFiles` keys must be normalized leading-slash paths.
- `events` may be stored inline as a JSON blob or separately as event rows; see open decisions.
- `mediaAssets` stores metadata references only; media Blobs/binary data must be stored separately.
- legacy records without owner fields are treated as owned by Teacher Demo during load/migration;
- newly published recordings store `ownerUserId`, `createdByUserId`, `publishedByUserId`, and `publishedAt`;
- the server derives publish ownership from the signed-in teacher/both session, not from trusted client authority.

### `RecordingMediaAsset`

A teacher-owned media attachment for a structured teacher recording.

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

Notes:

- `TeacherRecording.mediaAssets` should embed only `RecordingMediaAssetMetadata`.
- Local drafts store `Blob` values in IndexedDB object store `mediaAssets`.
- Published/dev media stores metadata JSON plus binary files in `.interactive-data/media-assets/` and includes `ownerUserId` for new uploads.
- A future backend should store the binary body in object storage or a media table/blob store and keep metadata in a durable media asset record.
- Media is synchronized to the structured timeline by playback time, not by replacing the timeline with a screen recording.

### `InteractiveRecordingPackage`

A portable POC/demo package for moving one teacher recording and its media between browsers or machines.

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

Notes:

- serialized packages are JSON and store media Blob bytes as base64 strings;
- `formatVersion: 1` is POC/demo-only and not a stable public API promise;
- default export includes teacher recording JSON plus media metadata/data only;
- learner deltas are optional and must be scoped to the current signed-in user unless a future explicit demo-data export mode is added;
- packages must not contain dev session ids, cookies, or unrelated users' learner deltas;
- import-as-copy generates a new recording id and new media asset ids to avoid collisions.

### `TimelineEvent`

One timestamped teacher/system event in a teacher timeline.

```ts
type TimelineEventType =
  | 'recording.started'
  | 'file.opened'
  | 'file.created'
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

Ordering contract:

1. sort by `tMs` ascending;
2. break ties by `seq` ascending.

Known payloads:

```ts
interface FileCreatedPayload {
  content: string;
}

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

### `LearnerDelta`

A learner-owned file-level delta against a teacher timeline state.

```ts
interface LearnerDelta {
  id: string;
  userId: string;
  lessonId: string;
  teacherRecordingId: string;
  teacherRecordingVersion: number;
  teacherTimestampMs: number;
  baseTeacherFilesHash: string;
  addedOrModified: Record<string, string>;
  removed: string[];
  selectedFile?: string;
  createdAt: string;
}
```

Notes:

- `addedOrModified` stores full file contents, not text patches.
- `removed` stores normalized paths.
- `selectedFile` stores the editor file selected when the delta was saved.
- New remote writes derive `userId` from the signed-in learner/both session. Client-supplied `userId` is ignored/replaced by the dev server.
- Legacy `local-poc-user` deltas remain readable only through the Learner Demo fallback path.
- Future backend versions may add `updatedAt`, `supersedesDeltaId`, or `label`.

### `ConflictSummary`

A computed or cached summary of later teacher changes that touch learner-changed files.

```ts
interface ConflictEventSummary {
  filePath: string;
  eventId: string;
  eventSeq?: number;
  teacherTimestampMs: number;
}

interface ConflictDetailSummary {
  filePath: string;
  learnerChangedFile: true;
  teacherChangedSameFileAfterLearnerTimestamp: true;
  teacherEventId: string;
  teacherEventSeq?: number;
  teacherEventTimestampMs: number;
}

interface ConflictSummary {
  learnerDeltaId: string;
  teacherRecordingId: string;
  teacherRecordingVersion: number;
  status: 'none' | 'conflict';
  filePaths: string[];
  events: ConflictEventSummary[];
  details: ConflictDetailSummary[];
  computedAt: string;
}
```

Legacy Milestone F conflict-summary shape:

- collected learner-changed paths;
- compared them with later teacher events;
- reported matching paths as conflicts.

This shape remains documented for persistence-history compatibility but is not a gate in the current learner flow. Current checkpoint opening materializes teacher state at the delta's own timestamp, validates its base hash, and applies the learner branch. Later events are irrelevant until lecture playback reaches them.

## 3. API shape

The API shape is intentionally minimal and resource-oriented. Milestone C introduced persistence routes under `/api/interactive/*`, Milestone D used them for product-facing recording lists and open flows, Milestone E added demo auth/session routes plus ownership checks, Milestone F kept conflict computation client-side, Milestone G added only demo seed/reset routes, and Milestone H adds no new persistence routes. Export/import is mostly client-side over existing storage adapters; import-as-published uses the existing teacher/media write endpoints. Production auth remains an open decision, but demo session ownership is enforced for this thesis demo.

### `POST /api/interactive/teacher-recordings`

Create a new immutable teacher recording. Requires a signed-in teacher/both dev session.

Request body:

```json
{
  "id": "teacher-recording-123",
  "lessonId": "lesson-and-solution",
  "version": 1,
  "startedAt": "2026-01-01T00:00:00.000Z",
  "durationMs": 2000,
  "baseFiles": {
    "/example.js": "console.log('base');\n"
  },
  "events": [
    {
      "id": "event-started",
      "seq": 0,
      "tMs": 0,
      "type": "recording.started",
      "origin": "system"
    }
  ]
}
```

Response body:

```json
{
  "teacherRecording": {
    "id": "teacher-recording-123",
    "lessonId": "lesson-and-solution",
    "version": 1,
    "startedAt": "2026-01-01T00:00:00.000Z",
    "durationMs": 2000,
    "baseFiles": {
      "/example.js": "console.log('base');\n"
    },
    "events": [],
    "ownerUserId": "dev-user-teacher-demo-8f4c2a9d",
    "createdByUserId": "dev-user-teacher-demo-8f4c2a9d",
    "publishedByUserId": "dev-user-teacher-demo-8f4c2a9d",
    "publishedAt": "2026-01-01T00:00:01.000Z"
  }
}
```

Rules:

- current dev server requires a safe `id` generated by the client recorder;
- request must be validated before persistence;
- after successful creation, the recording is treated as immutable;
- posting different JSON with an existing id is rejected;
- existing ids owned by another teacher are rejected;
- legacy recordings without owner fields are treated as Teacher Demo owned.

### `GET /api/interactive/teacher-recordings/:id`

Fetch one teacher recording by id.

Response body:

```json
{
  "teacherRecording": {
    "id": "teacher-recording-123",
    "lessonId": "lesson-and-solution",
    "version": 1,
    "startedAt": "2026-01-01T00:00:00.000Z",
    "durationMs": 2000,
    "baseFiles": {},
    "events": [],
    "createdAt": "2026-01-01T00:00:01.000Z"
  }
}
```

Rules:

- events must be returned in deterministic order or documented as sortable by `tMs` and `seq`;
- file paths must already be normalized or normalized by the client adapter.

### `POST /api/interactive/learner-deltas`

Create a learner-owned delta. Requires a signed-in learner/both dev session.

Request body:

```json
{
  "userId": "dev-user-learner-two-927f4d1a",
  "lessonId": "lesson-and-solution",
  "teacherRecordingId": "teacher-recording-123",
  "teacherRecordingVersion": 1,
  "teacherTimestampMs": 500,
  "baseTeacherFilesHash": "abc123",
  "addedOrModified": {
    "/example.js": "console.log('learner edit');\n"
  },
  "removed": [],
  "selectedFile": "/example.js"
}
```

Response body:

```json
{
  "learnerDelta": {
    "id": "learner-delta-123",
    "userId": "dev-user-learner-demo-61b7c3e2",
    "lessonId": "lesson-and-solution",
    "teacherRecordingId": "teacher-recording-123",
    "teacherRecordingVersion": 1,
    "teacherTimestampMs": 500,
    "baseTeacherFilesHash": "abc123",
    "addedOrModified": {
      "/example.js": "console.log('learner edit');\n"
    },
    "removed": [],
    "selectedFile": "/example.js",
    "createdAt": "2026-01-01T00:00:02.000Z"
  }
}
```

Rules:

- creates a new delta record;
- must not update the linked teacher recording;
- server ignores/replaces client-supplied `userId` with the signed-in learner id;
- should validate teacher recording existence/version/hash;
- may return a `ConflictSummary` in a later API version, but this is optional.

### `GET /api/interactive/learner-deltas?lessonId=&teacherRecordingId=`

List learner deltas for a lesson/teacher tuple scoped to the signed-in learner.

Example:

```text
GET /api/interactive/learner-deltas?lessonId=lesson-and-solution&teacherRecordingId=teacher-recording-123
```

Response body:

```json
{
  "learnerDeltas": []
}
```

Recommended ordering:

1. `createdAt` descending;
2. `id` descending as a stable tie-breaker.

### `GET /api/interactive/learner-deltas/latest?lessonId=&teacherRecordingId=`

Fetch the latest matching learner checkpoint, scoped to the signed-in learner. The current UI normally loads all deltas to render markers and groups the latest version per timestamp.

Example:

```text
GET /api/interactive/learner-deltas/latest?lessonId=lesson-and-solution&teacherRecordingId=teacher-recording-123
```

Response body when present:

```json
{
  "learnerDelta": {
    "id": "learner-delta-123",
    "userId": "dev-user-learner-demo-61b7c3e2",
    "lessonId": "lesson-and-solution",
    "teacherRecordingId": "teacher-recording-123",
    "teacherRecordingVersion": 1,
    "teacherTimestampMs": 500,
    "baseTeacherFilesHash": "abc123",
    "addedOrModified": {},
    "removed": [],
    "createdAt": "2026-01-01T00:00:02.000Z"
  }
}
```

Response body when absent:

```json
{
  "learnerDelta": null
}
```

Rules:

- latest is scoped by `lessonId`, `teacherRecordingId`, and the signed-in learner session user;
- server may also filter by `teacherRecordingVersion` if supplied;
- client must still verify the hash match before restore.

### `GET /api/interactive/auth/me`

Returns the current dev user from the `interactive_session` cookie or `null`.

### `POST /api/interactive/auth/dev-login`

Accepts `{ "userId": "..." }` for a known seeded dev user, creates a server-side session, and sets the session cookie.

### `POST /api/interactive/auth/logout`

Deletes the current server-side session and clears the session cookie.

### `GET /api/interactive/users/dev`

Returns the seeded dev users for the demo sign-in UI.


### `GET /api/interactive/teacher-recordings`

List published/dev teacher recordings.

Response body:

```json
{
  "teacherRecordings": []
}
```

Rules:

- returns immutable teacher recording records;
- current dev implementation sorts newest first by `startedAt`, then `id`.

### `POST /api/interactive/media-assets`

Upload a media Blob for a teacher recording. Requires a signed-in teacher/both dev session.

Request format:

- `multipart/form-data`;
- `metadata` field containing serialized `RecordingMediaAssetMetadata`, or equivalent individual fields;
- `file` field containing the media Blob.

Rules:

- linked teacher recording must already exist;
- allowed dev MIME types are business-required media formats currently used by the POC (`audio/webm`, `video/webm`, `audio/ogg`, `audio/wav`, `audio/x-wav`);
- server sets size limits;
- server validates safe ids and simple file signatures;
- server verifies the linked recording is owned by the signed-in teacher;
- server ignores client filenames;
- server generates stored media filenames;
- media files are stored outside public webroot under `.interactive-data/media-assets/`.

Response body:

```json
{
  "mediaAsset": {
    "id": "media-asset-123",
    "recordingId": "teacher-recording-123",
    "kind": "audio",
    "mimeType": "audio/webm",
    "durationMs": 2000,
    "createdAt": "2026-01-01T00:00:01.000Z"
  }
}
```

### `GET /api/interactive/media-assets/:id`

Fetch media metadata and a controlled download URL.

Response body:

```json
{
  "mediaAsset": {
    "id": "media-asset-123",
    "recordingId": "teacher-recording-123",
    "kind": "audio",
    "mimeType": "audio/webm",
    "durationMs": 2000,
    "createdAt": "2026-01-01T00:00:01.000Z"
  },
  "downloadUrl": "/api/interactive/media-assets/media-asset-123?blob=1"
}
```

### `GET /api/interactive/media-assets/:id?blob=1`

Fetch the media binary through a controlled endpoint.

Rules:

- responds with the stored media MIME type;
- does not expose the server-side stored filename.

### `GET /api/interactive/media-assets?recordingId=`

List media metadata for a teacher recording.

Response body:

```json
{
  "mediaAssets": []
}
```

### `POST /api/interactive/demo/seed`

Create a deterministic thesis demo recording. Requires a signed-in teacher/both dev session.

Response body:

```json
{
  "teacherRecording": {
    "id": "demo-interactive-conflict-flow",
    "lessonId": "lesson-and-solution",
    "version": 1,
    "durationMs": 3000,
    "mediaAssets": [
      {
        "id": "demo-interactive-conflict-flow-audio",
        "recordingId": "demo-interactive-conflict-flow",
        "kind": "audio",
        "mimeType": "audio/wav",
        "durationMs": 3000,
        "createdAt": "2026-01-01T00:00:01.000Z"
      }
    ]
  }
}
```

Rules:

- deletes existing `demo-` prefixed demo records first, then recreates the deterministic recording;
- writes teacher recording JSON under `.interactive-data/teacher-recordings/`;
- writes fake silent WAV media under `.interactive-data/media-assets/`;
- uses the signed-in teacher id for owner fields;
- does not affect non-demo records.

### `POST /api/interactive/demo/reset`

Delete deterministic demo records. Requires a signed-in teacher/both dev session.

Response body:

```json
{
  "ok": true
}
```

Rules:

- deletes teacher recordings with ids starting `demo-`;
- deletes media assets whose ids or linked `recordingId` start `demo-`;
- deletes learner deltas whose ids or linked `teacherRecordingId` start `demo-`;
- does not delete non-demo recordings, media, learner deltas, or sessions.

### Optional `GET /api/interactive/learner-deltas/:id/conflicts`

Compute or fetch conflict summary for one learner delta.

Response body:

```json
{
  "conflictSummary": {
    "learnerDeltaId": "learner-delta-123",
    "teacherRecordingId": "teacher-recording-123",
    "teacherRecordingVersion": 1,
    "status": "conflict",
    "filePaths": ["/example.js"],
    "events": [
      {
        "filePath": "/example.js",
        "eventId": "event-future-change",
        "eventSeq": 2,
        "teacherTimestampMs": 2000
      }
    ],
    "details": [
      {
        "filePath": "/example.js",
        "learnerChangedFile": true,
        "teacherChangedSameFileAfterLearnerTimestamp": true,
        "teacherEventId": "event-future-change",
        "teacherEventSeq": 2,
        "teacherEventTimestampMs": 2000
      }
    ],
    "computedAt": "2026-01-01T00:00:03.000Z"
  }
}
```

Rules:

- not required for Milestone H because the client computes conflicts from the loaded teacher recording and learner delta;
- should not mutate the learner delta or teacher recording;
- should not create a merge result or conflict-resolution decision record;
- may compute on read from teacher events and delta paths;
- may use a cache if invalidation rules are clear.

## 4. Storage shape

Production database technology is undecided. These names describe logical tables/collections. Milestone H maps them to gitignored JSON/media/session files in `.interactive-data/`.

### `teacher_recordings`

Stores one immutable teacher recording row/document.

Suggested fields:

- `id` primary key;
- `lesson_id`;
- `version`;
- `started_at`;
- `duration_ms`;
- `base_files_json`;
- `events_json` if events are stored inline;
- `created_at`;
- `created_by_user_id`;
- `owner_user_id`;
- `published_by_user_id`;
- `published_at`.

Recommended indexes:

- `(lesson_id, version)`;
- `(created_by, lesson_id)` if teacher ownership is needed.

### `timeline_events`

Optional normalized event storage if events are not stored as a JSON blob.

Suggested fields:

- `id` primary key;
- `teacher_recording_id` foreign key;
- `seq`;
- `t_ms`;
- `type`;
- `file_path` nullable;
- `payload_json`;
- `origin`.

Recommended indexes:

- `(teacher_recording_id, t_ms, seq)`;
- `(teacher_recording_id, file_path, t_ms)` for conflict detection.

### `learner_deltas`

Stores learner-owned file-level deltas.

Suggested fields:

- `id` primary key;
- `user_id`;
- `lesson_id`;
- `teacher_recording_id`;
- `teacher_recording_version`;
- `teacher_timestamp_ms`;
- `base_teacher_files_hash`;
- `added_or_modified_json`;
- `removed_json`;
- `selected_file` nullable;
- `created_at`.

Recommended indexes:

- `(lesson_id, teacher_recording_id, user_id, created_at)`;
- `(teacher_recording_id, teacher_recording_version)`;
- `(user_id, created_at)`.

### `media_assets`

Stores teacher recording media metadata and, for local/browser storage, Blob data. The Milestone C/D dev backend stores metadata JSON plus media files under `.interactive-data/media-assets/`. A production backend may split metadata and binary/object storage.

Suggested fields:

- `id` primary key;
- `teacher_recording_id` foreign key;
- `kind` (`audio` or `webcam`);
- `mime_type`;
- `duration_ms`;
- `created_at`;
- `owner_user_id`;
- `blob` or `object_storage_key` depending on storage implementation.

Recommended indexes:

- `(teacher_recording_id, created_at)`;
- `(kind, created_at)`.

### `sessions`

Stores dev-only session state.

Suggested fields:

- `id` primary key;
- `user_id`;
- `created_at`;
- `expires_at`.

Session ids must be random/unpredictable and meaningless without this server-side record.

### Optional conflict cache

A cache may store computed `ConflictSummary` values.

Suggested fields:

- `learner_delta_id` primary key;
- `teacher_recording_id`;
- `teacher_recording_version`;
- `status`;
- `file_paths_json`;
- `events_json`;
- `computed_at`.

Cache invalidation should be simple because teacher recordings are immutable. If a teacher recording version changes, deltas should target the new version explicitly.

## 5. Validation rules

### Teacher recording creation

Validate that:

- `lessonId` is present;
- `version` is a positive integer;
- `durationMs` is non-negative;
- `baseFiles` is an object with string contents;
- all `baseFiles` paths normalize to leading-slash form;
- `events` is an array;
- every event has `id`, numeric `seq`, numeric `tMs`, `type`, and `origin`;
- event paths normalize to leading-slash form when present;
- event ordering is either already deterministic or can be sorted by `tMs`/`seq`;
- media asset metadata references, when present, include `id`, `recordingId`, `kind`, `mimeType`, `durationMs`, and `createdAt`.

After persistence, do not allow mutable updates to the recording body.

### Media asset creation

Validate that:

- linked teacher recording exists;
- `recordingId` matches the linked teacher recording id;
- `kind` is `audio` or `webcam`;
- `mimeType` is present and allowed for the target media pipeline;
- `durationMs` is non-negative and within configured media limits;
- Blob/binary payload is present for local IndexedDB or replaced by an object-storage key in a backend implementation;
- storing a media asset does not mutate learner deltas.

### Recording package import

Validate that:

- `formatVersion` is supported;
- `teacherRecording` exists and has a safe id;
- `teacherRecording.events` is an array;
- every event has numeric `tMs` and `seq` fields;
- file paths in base files, event paths, delta paths, and selected files normalize to leading slash;
- recording media metadata references should have matching package media data when media playback portability is required;
- media package entries include metadata plus Blob or base64 data when media is present;
- missing media data is not fatal for import; the copied recording skips missing media references and falls back to timeline-clock playback;
- import-as-copy generates new safe recording/media ids on collision avoidance;
- import-as-published requires a signed-in teacher/both session;
- imported published recordings remain immutable after import.

### Learner delta creation

Validate that:

- linked teacher recording exists;
- `teacherRecordingVersion` matches the linked recording version;
- `teacherTimestampMs` is non-negative and within or near the teacher timeline duration;
- `baseTeacherFilesHash` matches the materialized teacher state at `teacherTimestampMs`;
- `addedOrModified` is an object with string contents;
- `removed` is an array of strings;
- all delta paths normalize to leading slash;
- `selectedFile`, when present, normalizes to leading slash;
- the delta does not contain the same path in both `addedOrModified` and `removed` after normalization.

### Immutability and ownership

Validate that:

- publishing a teacher recording requires a signed-in teacher/both user;
- saving learner work requires a signed-in learner/both user;
- session cookies contain only random ids and user meaning lives server-side;

- creating a learner delta cannot mutate teacher recording rows/documents;
- fetching/restoring a learner delta cannot mutate teacher recording rows/documents;
- users can only read/write deltas they own unless a sharing model is explicitly added;
- teacher recording ownership rules are enforced once auth is defined;
- export packages must not include session cookies or server session ids;
- optional learner delta export must be scoped to the current signed-in user unless an explicit demo-data export mode is introduced.

### Conflict validation

When computing conflicts:

- use normalized file paths;
- compare against teacher events with `tMs > learnerDelta.teacherTimestampMs`;
- consider `file.created` and `file.changed` teacher-modifying events for the current POC;
- return an empty summary rather than failing when no conflicts exist.

## 6. Migration path from local browser storage

### Current compatibility localStorage keys and dev data directory

The browser POC still mirrors these compatibility keys:

```text
interactive-poc.teacherRecording
interactive-poc.learnerDeltas
```

`interactive-poc.teacherRecording` contains one serialized latest `TeacherRecording`.

`interactive-poc.learnerDeltas` contains a serialized array of `LearnerDelta` objects.

Milestone H stores local draft resource shapes in IndexedDB database `interactive-timeline-poc` with object stores `teacherRecordings`, `learnerDeltas`, and `mediaAssets`. Published/demo resource shapes are stored in `.interactive-data/teacher-recordings`, `.interactive-data/learner-deltas`, `.interactive-data/media-assets`, and `.interactive-data/sessions`. Media blobs are stored only in IndexedDB, `.interactive-data/media-assets`, or base64 inside an explicit exported package; they are not mirrored to localStorage.

### Equivalent backend records

Migration mapping:

| Local browser value | Backend resource |
| --- | --- |
| IndexedDB `teacherRecordings` item, `.interactive-data/teacher-recordings/<id>.json`, or `interactive-poc.teacherRecording` mirror | one `TeacherRecording` record plus optional event rows |
| IndexedDB `mediaAssets` item or `.interactive-data/media-assets/<id>.json` plus stored media file | one `RecordingMediaAsset` metadata row plus Blob/object-storage body |
| IndexedDB `learnerDeltas` item, `.interactive-data/learner-deltas/<id>.json`, or each item in `interactive-poc.learnerDeltas` mirror | one `LearnerDelta` record |
| Phase 6 conflict result | computed `ConflictSummary`, optional cache |
| Milestone H exported package JSON | portable `InteractiveRecordingPackage` with `TeacherRecording`, optional scoped `LearnerDelta[]`, media metadata, and base64 media data |

The existing IndexedDB values, `.interactive-data` files, and localStorage JSON mirrors are intentionally close to the production backend payloads, so a future production adapter can translate with minimal restructuring.

### Adapter interface for storage replacement

React now uses an async storage adapter boundary. The local IndexedDB adapter and remote dev adapter satisfy the same shape; a future production backend adapter should preserve that shape before local-only assumptions are removed.

```ts
interface TeacherRecordingDraftSummary {
  id: string;
  lessonId: string;
  version: number;
  startedAt: string;
  durationMs: number;
  eventCount: number;
  mediaKind: 'none' | 'audio' | 'webcam';
  ownerUserId?: string;
  createdByUserId?: string;
  publishedByUserId?: string;
  publishedAt?: string;
}

interface InteractiveTimelineStorage {
  loadTeacherRecording(id?: string): Promise<TeacherRecording | undefined>;
  saveTeacherRecording(recording: TeacherRecording): Promise<void>;
  loadLearnerDeltas(query?: LearnerDeltaQuery): Promise<LearnerDelta[]>;
  loadLatestLearnerDelta(query?: LearnerDeltaQuery): Promise<LearnerDelta | undefined>;
  saveLearnerDelta(delta: LearnerDelta): Promise<void>;
  listTeacherRecordingDrafts(): Promise<TeacherRecordingDraftSummary[]>;
  loadTeacherRecordingDraft(id: string): Promise<TeacherRecording | undefined>;
  saveTeacherRecordingDraft(recording: TeacherRecording): Promise<void>;
  deleteTeacherRecordingDraft(id: string): Promise<void>;
  saveMediaAsset(asset: RecordingMediaAsset): Promise<void>;
  loadMediaAsset(assetId: string): Promise<RecordingMediaAsset | undefined>;
  deleteMediaAsset(assetId: string): Promise<void>;
  listMediaAssetsForRecording(recordingId: string): Promise<RecordingMediaAsset[]>;
}
```

Backend implementation path:

1. keep `IndexedDBInteractiveTimelineStorage` as the local authoring/media draft adapter;
2. keep `LocalStorageInteractiveTimelineStorage` as a compatibility/fallback adapter for timeline-only data;
3. use `RemoteInteractiveTimelineStorage` for published/backend demo data;
4. keep `.interactive-data/` as a dev-only storage implementation;
5. choose a production media binary strategy before production media uploads (object storage, database Blob, or local file store);
6. keep Playwright tests asserting teacher immutability, media draft load/preview, published media load/preview, fallback no-media playback, and learner delta recoverability;
7. only remove localStorage mirror assumptions after backend behavior matches the local POC.

## 7. Open decisions

### JSON blob vs normalized event rows

Options:

- **JSON blob:** simple writes and reads; best for immutable recordings and small POC payloads.
- **Normalized event rows:** easier filtering/indexing for conflict detection, seeking, analytics, and partial loads.

Default recommendation for first backend POC: JSON blob for simplicity, with a documented migration path to event rows if timeline queries become important.

### Production auth/user ownership model

Milestone H preserves the demo answer of deriving remote learner/teacher ownership from the dev session. Production questions remain:

- Who can create teacher recordings?
- Can multiple teachers own a lesson?
- Can learners share deltas with teachers?
- Which production auth middleware/session model derives `userId` rather than trusting request bodies?
- What is the admin/teacher visibility model for learner work?

Default recommendation: backend should derive `userId` from auth, not trust client-provided `userId`, once auth exists.

### Export package stability

Open questions:

- Should the package format become a stable public API or remain a thesis/demo artifact?
- Should media data stay as JSON/base64 or move to a ZIP/archive layout with checksums?
- Should package import support explicit overwrite policies, or always import as copy?

Default recommendation: keep the Milestone H package format thesis-demo-only until production storage and auth are defined.

### Media binary storage

Open questions:

- Should media blobs live in object storage, database Blob columns, or a local file store for a first backend prototype?
- Should uploads be direct-to-storage or proxied through the application server?
- What retention policy applies when a teacher recording draft is discarded or superseded?

Default recommendation: keep teacher recording JSON immutable and store media binary bodies separately behind the same `RecordingMediaAsset` metadata ids.

### File size limits

Open questions:

- Maximum file size in `baseFiles` and `addedOrModified`?
- Maximum total recording payload size?
- Maximum event count per recording?
- Maximum media duration and Blob size?
- Should large files/media be rejected, compressed, transcoded, or stored separately?

Default recommendation: define conservative limits before production backend work.

### Snapshot retention

Open questions:

- How long should teacher recordings be retained?
- How long should learner deltas be retained?
- Should old teacher recording versions remain available indefinitely when learner deltas reference them?
- Are lesson deletions hard deletes or soft deletes?

Default recommendation: keep teacher recording versions referenced by learner deltas until an explicit archival/delete policy exists.

### Conflict cache vs compute-on-read

Options:

- **Compute on read:** simplest and always fresh because teacher recordings are immutable.
- **Cache:** faster for large timelines but adds cache shape and invalidation rules.

Default recommendation: compute on read first. Add a cache only when timelines are large enough to justify it.
