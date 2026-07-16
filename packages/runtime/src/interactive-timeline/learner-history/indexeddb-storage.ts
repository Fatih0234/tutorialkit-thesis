import type { LearnerHistoryStorage } from './storage.js';
import type {
  LearnerBranch,
  LearnerBranchQuery,
  LearnerCommit,
  LearnerHistoryEvent,
  LearnerWorkingTree,
} from './types.js';

const DB_NAME = 'interactive-timeline-poc';
const DB_VERSION = 3;
const BRANCHES_STORE = 'learnerBranches';
const EVENTS_STORE = 'learnerHistoryEvents';
const COMMITS_STORE = 'learnerCommits';
const WORKING_TREES_STORE = 'learnerWorkingTrees';

type StoreName = typeof BRANCHES_STORE | typeof EVENTS_STORE | typeof COMMITS_STORE | typeof WORKING_TREES_STORE;

export class IndexedDBLearnerHistoryStorage implements LearnerHistoryStorage {
  private _dbPromise: Promise<IDBDatabase | undefined> | undefined;
  private readonly _memoryBranches = new Map<string, LearnerBranch>();
  private readonly _memoryEvents = new Map<string, LearnerHistoryEvent[]>();
  private readonly _memoryCommits = new Map<string, LearnerCommit[]>();
  private readonly _memoryTrees = new Map<string, LearnerWorkingTree>();

  async listBranches(query: LearnerBranchQuery): Promise<LearnerBranch[]> {
    const branches = (await this._readAll<LearnerBranch>(BRANCHES_STORE)) ?? [...this._memoryBranches.values()];

    return branches
      .filter((branch) => matchesQuery(branch, query))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadBranch(branchId: string) {
    return (await this._read<LearnerBranch>(BRANCHES_STORE, branchId)) ?? this._memoryBranches.get(branchId);
  }

  async saveBranch(branch: LearnerBranch) {
    this._memoryBranches.set(branch.id, branch);
    await this._write(BRANCHES_STORE, branch);
  }

  async loadEvents(branchId: string) {
    const events = (await this._readAll<LearnerHistoryEvent>(EVENTS_STORE)) ?? this._memoryEvents.get(branchId) ?? [];
    return events.filter((event) => event.branchId === branchId).sort((a, b) => a.seq - b.seq);
  }

  async appendEvents(branchId: string, events: LearnerHistoryEvent[]) {
    if (events.some((event) => event.branchId !== branchId)) {
      throw new Error('Cannot append learner events to another branch.');
    }

    const existing = this._memoryEvents.get(branchId) ?? [];
    const byId = new Map(existing.map((event) => [event.id, event]));

    for (const event of events) {
      byId.set(event.id, event);
    }

    this._memoryEvents.set(
      branchId,
      [...byId.values()].sort((a, b) => a.seq - b.seq),
    );
    await this._writeMany(EVENTS_STORE, events);
  }

  async loadCommits(branchId: string) {
    const commits = (await this._readAll<LearnerCommit>(COMMITS_STORE)) ?? this._memoryCommits.get(branchId) ?? [];
    return commits
      .filter((commit) => commit.branchId === branchId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async saveCommit(commit: LearnerCommit) {
    const commits = this._memoryCommits.get(commit.branchId) ?? [];
    const next = commits.filter((candidate) => candidate.id !== commit.id);
    next.push(commit);
    this._memoryCommits.set(commit.branchId, next);
    await this._write(COMMITS_STORE, commit);
  }

  async loadWorkingTree(branchId: string) {
    return (await this._read<LearnerWorkingTree>(WORKING_TREES_STORE, branchId)) ?? this._memoryTrees.get(branchId);
  }

  async saveWorkingTree(tree: LearnerWorkingTree) {
    this._memoryTrees.set(tree.branchId, tree);
    await this._write(WORKING_TREES_STORE, tree);
  }

  private async _openDatabase(): Promise<IDBDatabase | undefined> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return undefined;
    }

    this._dbPromise ??= new Promise((resolve) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => resolve(undefined);
      request.onupgradeneeded = () => upgradeLearnerHistoryStores(request.result);

      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });

    return this._dbPromise;
  }

  private async _read<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
    try {
      const db = await this._openDatabase();

      if (!db) {
        return undefined;
      }

      return await requestToPromise<T | undefined>(db.transaction(storeName).objectStore(storeName).get(key));
    } catch {
      return undefined;
    }
  }

  private async _readAll<T>(storeName: StoreName): Promise<T[] | undefined> {
    try {
      const db = await this._openDatabase();

      if (!db) {
        return undefined;
      }

      return await requestToPromise<T[]>(db.transaction(storeName).objectStore(storeName).getAll());
    } catch {
      return undefined;
    }
  }

  private async _write(storeName: StoreName, value: unknown): Promise<void> {
    await this._writeMany(storeName, [value]);
  }

  private async _writeMany(storeName: StoreName, values: unknown[]): Promise<void> {
    try {
      const db = await this._openDatabase();

      if (!db) {
        throw new Error('IndexedDB learner history storage is unavailable.');
      }

      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      for (const value of values) {
        store.put(value);
      }
      await waitForTransaction(transaction);
    } catch (error) {
      // the in-memory copy remains usable, but callers must not claim the write is durable
      throw error;
    }
  }
}

function matchesQuery(branch: LearnerBranch, query: LearnerBranchQuery) {
  return (
    (!query.userId || branch.userId === query.userId) &&
    (!query.lessonId || branch.lessonId === query.lessonId) &&
    (!query.teacherRecordingId || branch.origin.teacherRecordingId === query.teacherRecordingId) &&
    (!query.teacherRecordingVersion || branch.origin.teacherRecordingVersion === query.teacherRecordingVersion)
  );
}

export function upgradeLearnerHistoryStores(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(BRANCHES_STORE)) {
    const store = db.createObjectStore(BRANCHES_STORE, { keyPath: 'id' });
    store.createIndex('userId', 'userId');
    store.createIndex('lessonId', 'lessonId');
    store.createIndex('teacherRecordingId', 'origin.teacherRecordingId');
    store.createIndex('updatedAt', 'updatedAt');
  }

  if (!db.objectStoreNames.contains(EVENTS_STORE)) {
    const store = db.createObjectStore(EVENTS_STORE, { keyPath: 'id' });
    store.createIndex('branchId', 'branchId');
    store.createIndex('createdAt', 'createdAt');
    store.createIndex('branchSeq', ['branchId', 'seq'], { unique: true });
  }

  if (!db.objectStoreNames.contains(COMMITS_STORE)) {
    const store = db.createObjectStore(COMMITS_STORE, { keyPath: 'id' });
    store.createIndex('branchId', 'branchId');
    store.createIndex('createdAt', 'createdAt');
  }

  if (!db.objectStoreNames.contains(WORKING_TREES_STORE)) {
    const store = db.createObjectStore(WORKING_TREES_STORE, { keyPath: 'branchId' });
    store.createIndex('branchId', 'branchId', { unique: true });
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}
