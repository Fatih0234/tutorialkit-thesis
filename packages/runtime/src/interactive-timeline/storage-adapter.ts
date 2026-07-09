import {
  loadLatestLearnerDelta,
  loadLearnerDeltas,
  loadTeacherRecording,
  saveLearnerDelta,
  saveTeacherRecording,
} from './storage.js';
import type { LearnerDelta, TeacherRecording } from './types.js';

export interface InteractiveTimelineStorage {
  loadTeacherRecording(): TeacherRecording | undefined;
  saveTeacherRecording(recording: TeacherRecording): void;
  loadLearnerDeltas(): LearnerDelta[];
  loadLatestLearnerDelta(): LearnerDelta | undefined;
  saveLearnerDelta(delta: LearnerDelta): void;
}

export class LocalStorageInteractiveTimelineStorage implements InteractiveTimelineStorage {
  loadTeacherRecording(): TeacherRecording | undefined {
    return loadTeacherRecording();
  }

  saveTeacherRecording(recording: TeacherRecording): void {
    saveTeacherRecording(recording);
  }

  loadLearnerDeltas(): LearnerDelta[] {
    return loadLearnerDeltas();
  }

  loadLatestLearnerDelta(): LearnerDelta | undefined {
    return loadLatestLearnerDelta();
  }

  saveLearnerDelta(delta: LearnerDelta): void {
    saveLearnerDelta(delta);
  }
}
