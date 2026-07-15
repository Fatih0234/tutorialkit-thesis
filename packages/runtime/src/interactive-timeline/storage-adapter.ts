import {
  clearTeacherRecording,
  loadLatestLearnerDelta,
  loadLearnerDeltas,
  loadTeacherRecording,
  saveLearnerDelta,
  saveLearnerDeltas,
  saveTeacherRecording,
} from './storage.js';
import { INTERACTIVE_DEFAULT_TEACHER_USER_ID } from './identity.js';
import type { RecordingMediaAsset, RecordingMediaKind } from './media.js';
import type { LearnerDelta, TeacherRecording } from './types.js';

export interface TeacherRecordingDraftSummary {
  id: string;
  lessonId: string;
  version: number;
  startedAt: string;
  durationMs: number;
  eventCount: number;
  mediaKind: RecordingMediaKind | 'none';
  ownerUserId?: string;
  createdByUserId?: string;
  publishedByUserId?: string;
  publishedAt?: string;
}

export interface LearnerDeltaQuery {
  lessonId?: string;
  teacherRecordingId?: string;
  teacherRecordingVersion?: number;
  userId?: string;
}

export interface InteractiveTimelineStorage {
  loadTeacherRecording(id?: string): Promise<TeacherRecording | undefined>;
  saveTeacherRecording(recording: TeacherRecording): Promise<void>;
  loadLearnerDeltas(query?: LearnerDeltaQuery): Promise<LearnerDelta[]>;
  loadLatestLearnerDelta(query?: LearnerDeltaQuery): Promise<LearnerDelta | undefined>;
  saveLearnerDelta(delta: LearnerDelta): Promise<void>;
  listTeacherRecordingDrafts(): Promise<TeacherRecordingDraftSummary[]>;
  loadTeacherRecordingDraft(id: string): Promise<TeacherRecording | undefined>;
  saveTeacherRecordingDraft(recording: TeacherRecording): Promise<void>;
  deleteTeacherRecordingDraft(id: string): Promise<void>;
  deletePublishedTeacherRecording(id: string): Promise<void>;
  saveMediaAsset(asset: RecordingMediaAsset): Promise<void>;
  loadMediaAsset(assetId: string): Promise<RecordingMediaAsset | undefined>;
  deleteMediaAsset(assetId: string): Promise<void>;
  listMediaAssetsForRecording(recordingId: string): Promise<RecordingMediaAsset[]>;
}

export function getTeacherRecordingDraftSummary(recording: TeacherRecording): TeacherRecordingDraftSummary {
  return {
    id: recording.id,
    lessonId: recording.lessonId,
    version: recording.version,
    startedAt: recording.startedAt,
    durationMs: recording.durationMs,
    eventCount: recording.events.length,
    mediaKind: recording.mediaAssets?.[0]?.kind ?? 'none',
    ownerUserId: recording.ownerUserId ?? recording.createdByUserId ?? INTERACTIVE_DEFAULT_TEACHER_USER_ID,
    createdByUserId: recording.createdByUserId ?? recording.ownerUserId ?? INTERACTIVE_DEFAULT_TEACHER_USER_ID,
    publishedByUserId: recording.publishedByUserId,
    publishedAt: recording.publishedAt,
  };
}

function matchesLearnerDeltaQuery(delta: LearnerDelta, query: LearnerDeltaQuery = {}): boolean {
  return (
    (!query.lessonId || delta.lessonId === query.lessonId) &&
    (!query.teacherRecordingId || delta.teacherRecordingId === query.teacherRecordingId) &&
    (!query.teacherRecordingVersion || delta.teacherRecordingVersion === query.teacherRecordingVersion) &&
    (!query.userId || delta.userId === query.userId)
  );
}

export class LocalStorageInteractiveTimelineStorage implements InteractiveTimelineStorage {
  async loadTeacherRecording(id?: string): Promise<TeacherRecording | undefined> {
    const recording = loadTeacherRecording();

    return !id || recording?.id === id ? recording : undefined;
  }

  async saveTeacherRecording(recording: TeacherRecording): Promise<void> {
    saveTeacherRecording(recording);
  }

  async loadLearnerDeltas(query?: LearnerDeltaQuery): Promise<LearnerDelta[]> {
    return loadLearnerDeltas().filter((delta) => matchesLearnerDeltaQuery(delta, query));
  }

  async loadLatestLearnerDelta(query?: LearnerDeltaQuery): Promise<LearnerDelta | undefined> {
    if (!query) {
      return loadLatestLearnerDelta();
    }

    return (await this.loadLearnerDeltas(query)).at(-1);
  }

  async saveLearnerDelta(delta: LearnerDelta): Promise<void> {
    saveLearnerDelta(delta);
  }

  async listTeacherRecordingDrafts(): Promise<TeacherRecordingDraftSummary[]> {
    const recording = loadTeacherRecording();

    return recording ? [getTeacherRecordingDraftSummary(recording)] : [];
  }

  async loadTeacherRecordingDraft(id: string): Promise<TeacherRecording | undefined> {
    const recording = loadTeacherRecording();

    return recording?.id === id ? recording : undefined;
  }

  async saveTeacherRecordingDraft(recording: TeacherRecording): Promise<void> {
    saveTeacherRecording(recording);
  }

  async deleteTeacherRecordingDraft(id: string): Promise<void> {
    clearTeacherRecording(id);
  }

  async deletePublishedTeacherRecording(_id: string): Promise<void> {
    throw new Error('Published recording deletion requires remote storage.');
  }

  async saveMediaAsset(_asset: RecordingMediaAsset): Promise<void> {
    throw new Error('Media asset persistence requires IndexedDB.');
  }

  async loadMediaAsset(_assetId: string): Promise<RecordingMediaAsset | undefined> {
    return undefined;
  }

  async deleteMediaAsset(_assetId: string): Promise<void> {
    // Media blobs are not mirrored into localStorage.
  }

  async listMediaAssetsForRecording(_recordingId: string): Promise<RecordingMediaAsset[]> {
    return [];
  }

  async mirrorLearnerDeltas(deltas: LearnerDelta[]): Promise<void> {
    saveLearnerDeltas(deltas);
  }
}
