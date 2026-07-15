import type { RecordingMediaAssetMetadata } from './media.js';
import type { PresentationLayout, PresentationResource } from './presentation.js';

export type FilesSnapshot = Record<string, string>;

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
  | 'whiteboard.scene.changed'
  | 'execution.started'
  | 'execution.stdout'
  | 'execution.stderr'
  | 'execution.finished'
  | 'execution.failed'
  | 'execution.interrupted'
  | 'playback.marker';

export type TimelineEventOrigin = 'teacher' | 'playback' | 'system';

export interface TimelineEvent<TPayload = unknown> {
  id: string;
  seq: number;
  tMs: number;
  type: TimelineEventType;
  filePath?: string;
  payload?: TPayload;
  origin: TimelineEventOrigin;
}

export interface ExecutionStartedPayload {
  executionId: string;
  provider: 'webcontainer' | 'pyodide';
  entrypoint?: string;
  command?: string;
}

export interface ExecutionOutputPayload {
  executionId: string;
  value: string;
}

export interface ExecutionFinishedPayload {
  executionId: string;
  exitCode: number;
  durationMs: number;
}

export interface ExecutionFailedPayload {
  executionId: string;
  traceback: string;
  durationMs: number;
}

export interface ExecutionInterruptedPayload {
  executionId: string;
}

export interface MaterializedExecutionState {
  activeExecutionId?: string;
  output: Array<{ executionId: string; stream: 'stdout' | 'stderr'; value: string }>;
  status: 'idle' | 'running' | 'finished' | 'failed' | 'interrupted';
  exitCode?: number;
  traceback?: string;
}

export interface FileCreatedPayload {
  content: string;
}

export interface FileChangedPayload {
  content: string;
  selection?: unknown;
}

export interface FileOpenedPayload {
  filePath: string;
}

export interface EditorScrolledPayload {
  top: number;
  left: number;
}

export interface EditorSelectionChangedPayload {
  anchor: number;
  head: number;
}

export type TeacherPointerSurface = 'experience' | 'workspace' | 'preview';

export interface EditorPointerAnchor {
  kind: 'editor';
  filePath: string;
  documentOffset: number;
  offsetX: number;
  offsetY: number;
}

export interface ElementPointerAnchor {
  kind: 'element';
  id: string;
  xWithinElement: number;
  yWithinElement: number;
}

export type TeacherPointerAnchor = EditorPointerAnchor | ElementPointerAnchor;

export interface TeacherPointerChangedPayload {
  surface: TeacherPointerSurface;
  x: number;
  y: number;
  visible: boolean;
  coordinateSpaceVersion?: 2 | 3;
  anchor?: TeacherPointerAnchor;
}

export type TeacherPointerButton = 'left' | 'right';

export interface TeacherPointerClickedPayload {
  surface: TeacherPointerSurface;
  x: number;
  y: number;
  button: TeacherPointerButton;
  coordinateSpaceVersion?: 2 | 3;
  anchor?: TeacherPointerAnchor;
}

export interface TeacherRecording {
  id: string;
  lessonId: string;
  version: number;
  startedAt: string;
  durationMs: number;
  baseFiles: FilesSnapshot;
  events: TimelineEvent[];
  mediaAssets?: RecordingMediaAssetMetadata[];
  presentationResources?: PresentationResource[];
  initialPresentationLayout?: PresentationLayout;
  createdByUserId?: string;
  ownerUserId?: string;
  publishedByUserId?: string;
  publishedAt?: string;
}

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
