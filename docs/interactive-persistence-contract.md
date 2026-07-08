# Interactive persistence contract

This document defines the proposed backend persistence contract for the interactive tutorial POC. It is a contract document only: Phase 8 does not add backend APIs, database code, or runtime behavior changes.

The contract preserves the Phase 7 browser-only model described in `docs/interactive-poc-architecture.md` and prepares a future replacement for localStorage persistence.

## Non-goals

This document does not specify or implement:

- authentication/session middleware;
- database migrations;
- production storage infrastructure;
- merge algorithms;
- conflict resolution UI;
- terminal recording persistence;
- preview iframe recording persistence;
- analytics or telemetry.

## 1. Persistence goals

### Teacher recordings are immutable

A saved teacher recording is an append-complete artifact. After creation, learner actions must never mutate:

- teacher recording metadata;
- teacher base files;
- teacher timeline events;
- teacher recording version.

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

- teacher playback may overwrite the visible workspace;
- saved learner deltas remain recoverable;
- conflicts are detectable before/while restoring;
- backend writes must not silently replace an existing learner delta unless an explicit update/versioning policy is introduced later.

For the first backend phase, prefer append-only learner delta creation over in-place update.

## 2. Proposed resources

These resource shapes mirror the runtime POC types in `packages/runtime/src/interactive-timeline/types.ts` and `packages/runtime/src/interactive-timeline/learner-delta.ts`.

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
  createdAt: string;
  createdBy?: string;
}
```

Notes:

- `baseFiles` keys must be normalized leading-slash paths.
- `events` may be stored inline as a JSON blob or separately as event rows; see open decisions.
- `createdBy` is optional until an auth/user ownership model is selected.

### `TimelineEvent`

One timestamped teacher/system event in a teacher timeline.

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

Ordering contract:

1. sort by `tMs` ascending;
2. break ties by `seq` ascending.

Known payloads:

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
- Future backend versions may add `updatedAt`, `supersedesDeltaId`, or `label`, but Phase 8 does not require them.

### `ConflictSummary`

A computed or cached summary of later teacher changes that touch learner-changed files.

```ts
interface ConflictEventSummary {
  filePath: string;
  eventId: string;
  teacherTimestampMs: number;
}

interface ConflictSummary {
  learnerDeltaId: string;
  teacherRecordingId: string;
  teacherRecordingVersion: number;
  status: 'none' | 'conflict';
  filePaths: string[];
  events: ConflictEventSummary[];
  computedAt: string;
}
```

Current conflict rule:

- collect learner-changed files from `addedOrModified` keys and `removed` paths;
- find teacher `file.changed` events where `event.tMs > delta.teacherTimestampMs`;
- report a conflict when the later teacher event path is in the learner-changed file set.

Conflict detection is non-destructive and informational only.

## 3. Proposed API shape

The API shape is intentionally minimal and resource-oriented. Exact framework, route namespacing, and auth are open decisions.

### `POST /teacher-recordings`

Create a new immutable teacher recording.

Request body:

```json
{
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
    "createdAt": "2026-01-01T00:00:01.000Z"
  }
}
```

Rules:

- server may generate `id` values if not provided;
- request must be validated before persistence;
- after successful creation, the recording should be treated as immutable.

### `GET /teacher-recordings/:id`

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

### `POST /learner-deltas`

Create a learner-owned delta.

Request body:

```json
{
  "userId": "local-poc-user",
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
    "userId": "local-poc-user",
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
- should validate teacher recording existence/version/hash;
- may return a `ConflictSummary` in a later API version, but this is optional.

### `GET /learner-deltas?lessonId=&teacherRecordingId=&userId=`

List learner deltas for a lesson/teacher/user tuple.

Example:

```text
GET /learner-deltas?lessonId=lesson-and-solution&teacherRecordingId=teacher-recording-123&userId=local-poc-user
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

### `GET /learner-deltas/latest?lessonId=&teacherRecordingId=&userId=`

Fetch the latest matching learner delta for restore.

Example:

```text
GET /learner-deltas/latest?lessonId=lesson-and-solution&teacherRecordingId=teacher-recording-123&userId=local-poc-user
```

Response body when present:

```json
{
  "learnerDelta": {
    "id": "learner-delta-123",
    "userId": "local-poc-user",
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

- latest should be scoped by `lessonId`, `teacherRecordingId`, and `userId`;
- server may also filter by `teacherRecordingVersion` if supplied;
- client must still verify the hash match before restore.

### Optional `GET /learner-deltas/:id/conflicts`

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
        "teacherTimestampMs": 2000
      }
    ],
    "computedAt": "2026-01-01T00:00:03.000Z"
  }
}
```

Rules:

- should not mutate the learner delta or teacher recording;
- may compute on read from teacher events and delta paths;
- may use a cache if invalidation rules are clear.

## 4. Storage shape

Exact database technology is undecided. These names describe logical tables/collections.

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
- `created_by` nullable until auth is defined.

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
- event ordering is either already deterministic or can be sorted by `tMs`/`seq`.

After persistence, do not allow mutable updates to the recording body.

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

- creating a learner delta cannot mutate teacher recording rows/documents;
- fetching/restoring a learner delta cannot mutate teacher recording rows/documents;
- users can only read/write deltas they own unless a sharing model is explicitly added;
- teacher recording ownership rules are enforced once auth is defined.

### Conflict validation

When computing conflicts:

- use normalized file paths;
- compare against teacher events with `tMs > learnerDelta.teacherTimestampMs`;
- consider `file.changed` as the only teacher-modifying event for the current POC;
- return an empty summary rather than failing when no conflicts exist.

## 6. Migration path from localStorage

### Current localStorage keys

The browser POC currently stores:

```text
interactive-poc.teacherRecording
interactive-poc.learnerDeltas
```

`interactive-poc.teacherRecording` contains one serialized `TeacherRecording`.

`interactive-poc.learnerDeltas` contains a serialized array of `LearnerDelta` objects.

### Equivalent backend records

Migration mapping:

| localStorage value | Backend resource |
| --- | --- |
| `interactive-poc.teacherRecording` | one `TeacherRecording` record plus optional event rows |
| each item in `interactive-poc.learnerDeltas` | one `LearnerDelta` record |
| Phase 6 conflict result | computed `ConflictSummary`, optional cache |

The existing JSON shapes are intentionally close to the proposed backend payloads, so a future adapter can translate with minimal restructuring.

### Adapter interface for future replacement

A future persistence adapter can hide localStorage vs backend implementation from React.

```ts
interface InteractivePersistenceAdapter {
  saveTeacherRecording(recording: TeacherRecording): Promise<void>;
  loadTeacherRecording(id?: string): Promise<TeacherRecording | undefined>;
  saveLearnerDelta(delta: LearnerDelta): Promise<LearnerDelta>;
  loadLearnerDeltas(query: {
    lessonId: string;
    teacherRecordingId: string;
    userId: string;
  }): Promise<LearnerDelta[]>;
  loadLatestLearnerDelta(query: {
    lessonId: string;
    teacherRecordingId: string;
    userId: string;
  }): Promise<LearnerDelta | undefined>;
  getLearnerDeltaConflicts?(deltaId: string): Promise<ConflictSummary>;
}
```

Implementation path:

1. keep current localStorage helpers as the default adapter;
2. introduce an async adapter boundary without changing UI behavior;
3. add backend-backed adapter behind the same interface;
4. keep Playwright tests asserting teacher immutability and learner delta recoverability;
5. only remove localStorage-specific assumptions after backend behavior matches the POC.

## 7. Open decisions

### JSON blob vs normalized event rows

Options:

- **JSON blob:** simple writes and reads; best for immutable recordings and small POC payloads.
- **Normalized event rows:** easier filtering/indexing for conflict detection, seeking, analytics, and partial loads.

Default recommendation for first backend POC: JSON blob for simplicity, with a documented migration path to event rows if timeline queries become important.

### Auth/user ownership model

Open questions:

- Who can create teacher recordings?
- Can multiple teachers own a lesson?
- Can learners share deltas with teachers?
- Is `userId` supplied by auth middleware rather than request body?
- What is the admin/teacher visibility model for learner work?

Default recommendation: backend should derive `userId` from auth, not trust client-provided `userId`, once auth exists.

### File size limits

Open questions:

- Maximum file size in `baseFiles` and `addedOrModified`?
- Maximum total recording payload size?
- Maximum event count per recording?
- Should large files be rejected, compressed, or stored separately?

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
