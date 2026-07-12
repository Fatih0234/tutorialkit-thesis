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
  | 'editor.selection.changed'
  | 'pointer.changed'
  | 'pointer.clicked'
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

`frontmostBySide` identifies the semantic front window in each fixed layer. It contains resource ids only—never z-index values or geometry. Learner presentation overrides never create timeline events.

## Editor viewport payloads

`editor.scrolled` stores the active editor's pixel scroll offsets. `editor.selection.changed` stores the main CodeMirror selection as directional character offsets; equal offsets represent a caret.

```ts
interface EditorSelectionChangedPayload {
  anchor: number;
  head: number;
}
```

Selection-only actions do not duplicate file content. Playback clamps offsets to the current document and programmatic scroll/selection restoration remains guarded from recording.

## Teacher pointer payload

`pointer.changed` stores normalized teacher pointer coordinates for either the immersive `workspace` or an explicitly bridged `preview` iframe. Preview projects opt in with the TutorialKit pointer bridge. The bridge records coordinates and visibility only; clicks, DOM content, inputs, navigation, and other iframe interactions remain excluded.

```ts
interface TeacherPointerChangedPayload {
  surface: 'experience' | 'workspace' | 'preview';
  x: number; // fallback position within the named surface
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

Version 3 pointer events prefer semantic anchors: CodeMirror document offsets plus local character offsets for editor positions, and stable application-owned element ids plus within-element ratios for controls. Workspace coordinates remain a fallback when an anchor is temporarily unavailable.

Version 2 pointer events use `workspace` for the actual editor/presentation surface, `experience` for outer headers and transport, and `preview` for the iframe. Legacy events without a coordinate-space version retain the original full-experience interpretation of `workspace`.

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
