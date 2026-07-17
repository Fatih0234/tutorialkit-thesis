import { EXERCISE_SCHEMA_VERSION, type ExerciseAttempt, type ExerciseAttemptStatus } from './types.js';
import { createExerciseId } from './model.js';

export function createExerciseAttempt(options: {
  id?: string;
  userId: string;
  lessonId: string;
  teacherRecordingId: string;
  teacherRecordingVersion: number;
  exercisePointId: string;
  exerciseId: string;
  exerciseVersion: number;
  rootBranchId: string;
  now?: string;
}): ExerciseAttempt {
  const now = options.now ?? new Date().toISOString();

  return {
    schemaVersion: EXERCISE_SCHEMA_VERSION,
    id: options.id ?? createExerciseId('exercise-attempt'),
    userId: options.userId,
    lessonId: options.lessonId,
    teacherRecordingId: options.teacherRecordingId,
    teacherRecordingVersion: options.teacherRecordingVersion,
    exercisePointId: options.exercisePointId,
    exerciseId: options.exerciseId,
    exerciseVersion: options.exerciseVersion,
    rootBranchId: options.rootBranchId,
    activeBranchId: options.rootBranchId,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function updateExerciseAttempt(
  attempt: ExerciseAttempt,
  update: {
    status?: ExerciseAttemptStatus;
    activeBranchId?: string;
    passedFilesHash?: string;
    now?: string;
  },
): ExerciseAttempt {
  const status = attempt.status === 'passed' ? 'passed' : update.status ?? attempt.status;
  const lastPassedFilesHash =
    status === 'passed' ? update.passedFilesHash ?? attempt.lastPassedFilesHash : attempt.lastPassedFilesHash;

  if (status === 'passed' && !lastPassedFilesHash) {
    throw new Error('A passed exercise attempt requires the checked workspace hash.');
  }

  return {
    ...attempt,
    status,
    activeBranchId: update.activeBranchId ?? attempt.activeBranchId,
    lastPassedFilesHash,
    updatedAt: update.now ?? new Date().toISOString(),
  };
}
