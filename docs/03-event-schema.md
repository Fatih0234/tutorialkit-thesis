# Event Schema

## TeacherRecording

```ts
export interface TeacherRecording {
  id: string;
  lessonId: string;
  version: number;
  startedAt: string;
  durationMs: number;
  baseFiles: FilesSnapshot;
  events: TimelineEvent[];
}
```

## TimelineEvent

```ts
export interface TimelineEvent<TPayload = unknown> {
  id: string;
  seq: number;
  tMs: number;
  type: TimelineEventType;
  filePath?: string;
  payload?: TPayload;
  origin: 'teacher' | 'playback' | 'system';
}
```

## Initial event types

```ts
export type TimelineEventType =
  | 'recording.started'
  | 'file.opened'
  | 'file.changed'
  | 'editor.scrolled'
  | 'playback.marker';
```

## File changed payload

```ts
export interface FileChangedPayload {
  content: string;
  selection?: unknown;
}
```

## LearnerDelta

```ts
export interface LearnerDelta {
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
