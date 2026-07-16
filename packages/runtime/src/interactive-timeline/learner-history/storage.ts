import type {
  LearnerBranch,
  LearnerBranchQuery,
  LearnerCommit,
  LearnerHistoryEvent,
  LearnerWorkingTree,
} from './types.js';

export interface LearnerHistoryStorage {
  listBranches(query: LearnerBranchQuery): Promise<LearnerBranch[]>;
  loadBranch(branchId: string): Promise<LearnerBranch | undefined>;
  saveBranch(branch: LearnerBranch): Promise<void>;
  loadEvents(branchId: string): Promise<LearnerHistoryEvent[]>;
  appendEvents(branchId: string, events: LearnerHistoryEvent[]): Promise<void>;
  loadCommits(branchId: string): Promise<LearnerCommit[]>;
  saveCommit(commit: LearnerCommit): Promise<void>;
  loadWorkingTree(branchId: string): Promise<LearnerWorkingTree | undefined>;
  saveWorkingTree(tree: LearnerWorkingTree): Promise<void>;
}
