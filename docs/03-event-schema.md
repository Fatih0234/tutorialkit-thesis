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
  | 'file.created'
  | 'file.changed'
  | 'editor.scrolled'
  | 'presentation.changed'
  | 'playback.marker';
```

## File payloads

```ts
export interface FileCreatedPayload {
  content: string;
}

export interface FileChangedPayload {
  content: string;
  selection?: unknown;
}
```

## Presentation payload

`presentation.changed` stores the complete canonical teacher layout rather than a toggle command:

```ts
{
  layout: {
    resources: {
      'website-preview': 'minimized',
      'javascript-counter-deck': 'focused'
    },
    focusedResourceId: 'javascript-counter-deck',
    deckStates: {
      'javascript-counter-deck': {
        slideIndex: 1,
        revealedStep: 2
      }
    },
    frontmostBySide: {
      left: 'javascript-counter-deck',
      right: 'website-preview'
    }
  }
}
```

`frontmostBySide` identifies the semantic front window in each fixed layer. It contains resource ids only—never z-index values or geometry. Learner presentation overrides and interactions inside the preview iframe never create timeline events.

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
