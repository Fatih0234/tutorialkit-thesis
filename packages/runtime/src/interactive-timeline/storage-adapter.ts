import {
  loadLatestLearnerDelta,
  loadLearnerDeltas,
  loadTeacherRecording,
  saveLearnerDelta,
  saveLearnerDeltas,
  saveTeacherRecording,
} from './storage.js';
import type { LearnerDelta, TeacherRecording } from './types.js';

export interface TeacherRecordingDraftSummary {
  id: string;
  lessonId: string;
  version: number;
  startedAt: string;
  durationMs: number;
  eventCount: number;
}

export interface InteractiveTimelineStorage {
  loadTeacherRecording(): Promise<TeacherRecording | undefined>;
  saveTeacherRecording(recording: TeacherRecording): Promise<void>;
  loadLearnerDeltas(): Promise<LearnerDelta[]>;
  loadLatestLearnerDelta(): Promise<LearnerDelta | undefined>;
  saveLearnerDelta(delta: LearnerDelta): Promise<void>;
  listTeacherRecordingDrafts(): Promise<TeacherRecordingDraftSummary[]>;
  loadTeacherRecordingDraft(id: string): Promise<TeacherRecording | undefined>;
  saveTeacherRecordingDraft(recording: TeacherRecording): Promise<void>;
  deleteTeacherRecordingDraft(id: string): Promise<void>;
}

export function getTeacherRecordingDraftSummary(recording: TeacherRecording): TeacherRecordingDraftSummary {
  return {
    id: recording.id,
    lessonId: recording.lessonId,
    version: recording.version,
    startedAt: recording.startedAt,
    durationMs: recording.durationMs,
    eventCount: recording.events.length,
  };
}

export class LocalStorageInteractiveTimelineStorage implements InteractiveTimelineStorage {
  async loadTeacherRecording(): Promise<TeacherRecording | undefined> {
    return loadTeacherRecording();
  }

  async saveTeacherRecording(recording: TeacherRecording): Promise<void> {
    saveTeacherRecording(recording);
  }

  async loadLearnerDeltas(): Promise<LearnerDelta[]> {
    return loadLearnerDeltas();
  }

  async loadLatestLearnerDelta(): Promise<LearnerDelta | undefined> {
    return loadLatestLearnerDelta();
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

  async deleteTeacherRecordingDraft(_id: string): Promise<void> {
    // The localStorage compatibility layer intentionally keeps the legacy keys
    // in place until a later cleanup/migration phase removes them explicitly.
  }

  async mirrorLearnerDeltas(deltas: LearnerDelta[]): Promise<void> {
    saveLearnerDeltas(deltas);
  }
}
