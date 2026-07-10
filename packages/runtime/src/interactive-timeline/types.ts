import type { RecordingMediaAssetMetadata } from './media.js';

export type FilesSnapshot = Record<string, string>;

export type TimelineEventType =
  | 'recording.started'
  | 'file.opened'
  | 'file.created'
  | 'file.changed'
  | 'editor.scrolled'
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

export interface TeacherRecording {
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
