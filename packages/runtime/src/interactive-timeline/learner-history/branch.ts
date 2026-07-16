import { normalizeFiles, normalizePath } from '../path.js';
import { simpleHashFiles } from '../learner-delta.js';
import type { FilesSnapshot } from '../types.js';
import type {
  LearnerBranch,
  LearnerBranchParent,
  LearnerCommit,
  LearnerHistoryEvent,
  LearnerHistoryEventType,
  LearnerOrigin,
  LearnerWorkingTree,
} from './types.js';

export interface CreateBranchOptions {
  id?: string;
  userId: string;
  lessonId: string;
  origin: LearnerOrigin;
  initialFiles: FilesSnapshot;
  selectedFile?: string;
  parent?: LearnerBranchParent;
  now?: string;
}

export function createLearnerBranch(options: CreateBranchOptions): {
  branch: LearnerBranch;
  workingTree: LearnerWorkingTree;
} {
  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? createLearnerHistoryId('learner-branch');
  const branch: LearnerBranch = {
    schemaVersion: 1,
    id,
    userId: options.userId,
    lessonId: options.lessonId,
    origin: { ...options.origin },
    parent: options.parent ? { ...options.parent } : undefined,
    headEventSeq: 0,
    createdAt: now,
    updatedAt: now,
  };
  const workingTree: LearnerWorkingTree = {
    schemaVersion: 1,
    branchId: id,
    filesSnapshot: normalizeFiles(options.initialFiles),
    selectedFile: options.selectedFile ? normalizePath(options.selectedFile) : undefined,
    latestEventSeq: 0,
    dirty: false,
    updatedAt: now,
  };

  return { branch, workingTree };
}

interface AppendEventOptions<TPayload> {
  branch: LearnerBranch;
  type: LearnerHistoryEventType;
  payload: TPayload;
  filePath?: string;
  id?: string;
  now?: string;
}

export function appendLearnerHistoryEvent<TPayload>(
  options: AppendEventOptions<TPayload>,
): { branch: LearnerBranch; event: LearnerHistoryEvent<TPayload> } {
  const now = options.now ?? new Date().toISOString();
  const seq = options.branch.headEventSeq + 1;
  const event: LearnerHistoryEvent<TPayload> = {
    schemaVersion: 1,
    id: options.id ?? createLearnerHistoryId('learner-event'),
    branchId: options.branch.id,
    seq,
    createdAt: now,
    type: options.type,
    filePath: options.filePath ? normalizePath(options.filePath) : undefined,
    payload: options.payload,
  };

  return {
    event,
    branch: { ...options.branch, headEventSeq: seq, updatedAt: now },
  };
}

interface CreateCommitOptions {
  branch: LearnerBranch;
  workingTree: LearnerWorkingTree;
  name: string;
  parentCommitId?: string;
  id?: string;
  now?: string;
}

export function createLearnerCommit(options: CreateCommitOptions): LearnerCommit | undefined {
  const filesSnapshot = normalizeFiles(options.workingTree.filesSnapshot);
  const filesHash = simpleHashFiles(filesSnapshot);

  if (filesHash === options.workingTree.latestCommitFilesHash) {
    return undefined;
  }

  return {
    schemaVersion: 1,
    id: options.id ?? createLearnerHistoryId('learner-commit'),
    branchId: options.branch.id,
    parentCommitId: options.parentCommitId,
    eventSeq: options.branch.headEventSeq,
    name: options.name,
    filesHash,
    filesSnapshot,
    selectedFile: options.workingTree.selectedFile,
    createdAt: options.now ?? new Date().toISOString(),
  };
}

export function markWorkingTreeCommitted(
  tree: LearnerWorkingTree,
  commit: LearnerCommit,
): LearnerWorkingTree {
  return {
    ...tree,
    filesSnapshot: normalizeFiles(commit.filesSnapshot),
    latestCommitId: commit.id,
    latestCommitFilesHash: commit.filesHash,
    dirty: false,
    updatedAt: commit.createdAt,
  };
}

interface ForkBranchOptions {
  id?: string;
  parentBranch: LearnerBranch;
  parentEventSeq: number;
  parentCommitId?: string;
  initialFiles: FilesSnapshot;
  selectedFile?: string;
  now?: string;
}

export function forkLearnerBranch(options: ForkBranchOptions) {
  if (options.parentEventSeq < 0 || options.parentEventSeq > options.parentBranch.headEventSeq) {
    throw new Error('Cannot fork outside the parent branch history.');
  }

  return createLearnerBranch({
    id: options.id,
    userId: options.parentBranch.userId,
    lessonId: options.parentBranch.lessonId,
    origin: options.parentBranch.origin,
    parent: {
      branchId: options.parentBranch.id,
      eventSeq: options.parentEventSeq,
      commitId: options.parentCommitId,
    },
    initialFiles: options.initialFiles,
    selectedFile: options.selectedFile,
    now: options.now,
  });
}

export function createLearnerHistoryId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}
