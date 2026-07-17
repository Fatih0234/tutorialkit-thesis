import type { FilesSnapshot } from '../types.js';

export const EXERCISE_SCHEMA_VERSION = 1 as const;
export const EXERCISE_VALIDATION_PROTOCOL = 'tutorialkit-exercise-v1' as const;

export type ExerciseFileRole = 'editable' | 'read-only' | 'private-validation';

export interface ExerciseCheckDefinition {
  id: string;
  title: string;
  failureFeedback?: string;
}

export interface ExerciseValidationConfig {
  protocol: typeof EXERCISE_VALIDATION_PROTOCOL;
  entrypoint: string;
  timeoutMs: number;
  checks: ExerciseCheckDefinition[];
}

export interface ExerciseContent {
  title: string;
  instructions: string;
  explanation?: string;
  hints?: string[];
  successFeedback?: string;
  failureFeedback?: string;
  starterFiles: FilesSnapshot;
  fileRoles: Record<string, ExerciseFileRole>;
  allowCreatePatterns: string[];
  privateValidationFiles: FilesSnapshot;
  referenceSolutionFiles?: FilesSnapshot;
  validation: ExerciseValidationConfig;
}

export type ExerciseValidationOutcome = 'passed' | 'failed' | 'broken';

export interface ExerciseCheckResult {
  id: string;
  passed: boolean;
  message?: string;
}

export interface ExerciseValidationResult {
  outcome: ExerciseValidationOutcome;
  checks: ExerciseCheckResult[];
  diagnostics?: string;
}

export interface ExerciseVerificationRun {
  contentHash: string;
  checkedAt: string;
  result: ExerciseValidationResult;
}

export interface ExerciseVerificationState {
  starter?: ExerciseVerificationRun;
  reference?: ExerciseVerificationRun;
}

export interface ExerciseDraft {
  schemaVersion: typeof EXERCISE_SCHEMA_VERSION;
  exerciseId: string;
  ownerUserId: string;
  lessonId?: string;
  content: ExerciseContent;
  verification: ExerciseVerificationState;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseVersion {
  schemaVersion: typeof EXERCISE_SCHEMA_VERSION;
  exerciseId: string;
  version: number;
  ownerUserId: string;
  lessonId?: string;
  content: ExerciseContent;
  contentHash: string;
  createdAt: string;
  publishedAt: string;
}

export interface ExerciseCatalogEntry {
  schemaVersion: typeof EXERCISE_SCHEMA_VERSION;
  exerciseId: string;
  ownerUserId: string;
  title: string;
  activeVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExercisePoint {
  schemaVersion: typeof EXERCISE_SCHEMA_VERSION;
  teacherTimestampMs: number;
  lastAppliedTeacherEventSeq: number;
  id: string;
  exerciseId: string;
  exerciseVersionAtPublication?: number;
  createdAt: string;
}

export type ExerciseAttemptStatus = 'active' | 'skipped' | 'passed';

export interface ExerciseAttempt {
  schemaVersion: typeof EXERCISE_SCHEMA_VERSION;
  id: string;
  userId: string;
  lessonId: string;
  teacherRecordingId: string;
  teacherRecordingVersion: number;
  exercisePointId: string;
  exerciseId: string;
  exerciseVersion: number;
  rootBranchId: string;
  activeBranchId: string;
  status: ExerciseAttemptStatus;
  lastPassedFilesHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseBranchContext {
  kind: 'exercise';
  attemptId: string;
  exercisePointId: string;
  exerciseId: string;
  exerciseVersion: number;
  starterFilesHash: string;
}

export interface LearnerExerciseDelivery {
  recordingId: string;
  exercisePointId: string;
  exercise: LearnerExerciseContent;
}

export interface ExerciseValidationBundle {
  recordingId: string;
  exercisePointId: string;
  exerciseId: string;
  version: number;
  privateValidationFiles: FilesSnapshot;
  validation: ExerciseValidationConfig;
}

export interface LearnerExerciseContent {
  exerciseId: string;
  version: number;
  title: string;
  instructions: string;
  explanation?: string;
  hints: string[];
  successFeedback?: string;
  failureFeedback?: string;
  starterFiles: FilesSnapshot;
  fileRoles: Record<string, Exclude<ExerciseFileRole, 'private-validation'>>;
  allowCreatePatterns: string[];
  checks: ExerciseCheckDefinition[];
}

export interface ExerciseCompleteness {
  complete: boolean;
  reasons: string[];
}

export interface ExercisePublishability extends ExerciseCompleteness {
  contentHash: string;
}

export interface ExerciseValidationProtocolPayload {
  protocol: typeof EXERCISE_VALIDATION_PROTOCOL;
  checks: ExerciseCheckResult[];
}

export interface ExerciseValidationExecution {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
