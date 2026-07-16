import type { FilesSnapshot } from '../types.js';

export interface LearnerOrigin {
  teacherRecordingId: string;
  teacherRecordingVersion: number;
  teacherTimestampMs: number;
  lastAppliedTeacherEventSeq: number;
  baseTeacherFilesHash: string;
}

export interface LearnerBranchParent {
  branchId: string;
  eventSeq: number;
  commitId?: string;
}

export interface LearnerBranch {
  schemaVersion: 1;
  id: string;
  userId: string;
  lessonId: string;
  origin: LearnerOrigin;
  parent?: LearnerBranchParent;
  headEventSeq: number;
  createdAt: string;
  updatedAt: string;
}

export type LearnerHistoryEventType =
  | 'file.changed'
  | 'file.created'
  | 'file.deleted'
  | 'file.renamed'
  | 'folder.created'
  | 'folder.deleted'
  | 'folder.renamed';

export interface LearnerHistoryEvent<TPayload = unknown> {
  schemaVersion: 1;
  id: string;
  branchId: string;
  seq: number;
  createdAt: string;
  type: LearnerHistoryEventType;
  filePath?: string;
  payload: TPayload;
}

export interface LearnerFileChangedPayload {
  content: string;
  selection?: { anchor: number; head: number };
}

export interface LearnerCommit {
  schemaVersion: 1;
  id: string;
  branchId: string;
  parentCommitId?: string;
  eventSeq: number;
  name: string;
  filesHash: string;
  filesSnapshot: FilesSnapshot;
  selectedFile?: string;
  createdAt: string;
}

export interface LearnerWorkingTree {
  schemaVersion: 1;
  branchId: string;
  filesSnapshot: FilesSnapshot;
  selectedFile?: string;
  selectionByFile?: Record<string, { anchor: number; head: number }>;
  latestEventSeq: number;
  latestCommitId?: string;
  latestCommitFilesHash?: string;
  dirty: boolean;
  updatedAt: string;
}

export interface LearnerBranchAggregate {
  schemaVersion: 1;
  branch: LearnerBranch;
  events: LearnerHistoryEvent[];
  commits: LearnerCommit[];
  workingTree: LearnerWorkingTree;
}

export interface LearnerBranchSyncResult {
  aggregate: LearnerBranchAggregate;
  outcome: 'created' | 'updated' | 'unchanged' | 'forked';
}

export interface LearnerBranchQuery {
  userId?: string;
  lessonId?: string;
  teacherRecordingId?: string;
  teacherRecordingVersion?: number;
}
