export const INTERACTIVE_TIMELINE_DB_NAME = 'interactive-timeline-poc';
export const INTERACTIVE_TIMELINE_DB_VERSION = 4;

export const TEACHER_RECORDINGS_STORE = 'teacherRecordings';
export const LEARNER_DELTAS_STORE = 'learnerDeltas';
export const MEDIA_ASSETS_STORE = 'mediaAssets';
export const LEARNER_BRANCHES_STORE = 'learnerBranches';
export const LEARNER_HISTORY_EVENTS_STORE = 'learnerHistoryEvents';
export const LEARNER_COMMITS_STORE = 'learnerCommits';
export const LEARNER_WORKING_TREES_STORE = 'learnerWorkingTrees';
export const EXERCISE_DRAFTS_STORE = 'exerciseDrafts';
export const EXERCISE_VERSIONS_STORE = 'exerciseVersions';
export const EXERCISE_CATALOG_STORE = 'exerciseCatalog';
export const EXERCISE_ATTEMPTS_STORE = 'exerciseAttempts';

export type InteractiveTimelineStoreName =
  | typeof TEACHER_RECORDINGS_STORE
  | typeof LEARNER_DELTAS_STORE
  | typeof MEDIA_ASSETS_STORE
  | typeof LEARNER_BRANCHES_STORE
  | typeof LEARNER_HISTORY_EVENTS_STORE
  | typeof LEARNER_COMMITS_STORE
  | typeof LEARNER_WORKING_TREES_STORE
  | typeof EXERCISE_DRAFTS_STORE
  | typeof EXERCISE_VERSIONS_STORE
  | typeof EXERCISE_CATALOG_STORE
  | typeof EXERCISE_ATTEMPTS_STORE;

export function upgradeInteractiveTimelineStores(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(TEACHER_RECORDINGS_STORE)) {
    const store = db.createObjectStore(TEACHER_RECORDINGS_STORE, { keyPath: 'id' });
    store.createIndex('lessonId', 'lessonId', { unique: false });
    store.createIndex('startedAt', 'startedAt', { unique: false });
  }

  if (!db.objectStoreNames.contains(LEARNER_DELTAS_STORE)) {
    const store = db.createObjectStore(LEARNER_DELTAS_STORE, { keyPath: 'id' });
    store.createIndex('lessonId', 'lessonId', { unique: false });
    store.createIndex('teacherRecordingId', 'teacherRecordingId', { unique: false });
    store.createIndex('createdAt', 'createdAt', { unique: false });
  }

  if (!db.objectStoreNames.contains(MEDIA_ASSETS_STORE)) {
    const store = db.createObjectStore(MEDIA_ASSETS_STORE, { keyPath: 'id' });
    store.createIndex('recordingId', 'recordingId', { unique: false });
    store.createIndex('createdAt', 'createdAt', { unique: false });
  }

  if (!db.objectStoreNames.contains(LEARNER_BRANCHES_STORE)) {
    const store = db.createObjectStore(LEARNER_BRANCHES_STORE, { keyPath: 'id' });
    store.createIndex('userId', 'userId');
    store.createIndex('lessonId', 'lessonId');
    store.createIndex('teacherRecordingId', 'origin.teacherRecordingId');
    store.createIndex('updatedAt', 'updatedAt');
  }

  if (!db.objectStoreNames.contains(LEARNER_HISTORY_EVENTS_STORE)) {
    const store = db.createObjectStore(LEARNER_HISTORY_EVENTS_STORE, { keyPath: 'id' });
    store.createIndex('branchId', 'branchId');
    store.createIndex('createdAt', 'createdAt');
    store.createIndex('branchSeq', ['branchId', 'seq'], { unique: true });
  }

  if (!db.objectStoreNames.contains(LEARNER_COMMITS_STORE)) {
    const store = db.createObjectStore(LEARNER_COMMITS_STORE, { keyPath: 'id' });
    store.createIndex('branchId', 'branchId');
    store.createIndex('createdAt', 'createdAt');
  }

  if (!db.objectStoreNames.contains(LEARNER_WORKING_TREES_STORE)) {
    const store = db.createObjectStore(LEARNER_WORKING_TREES_STORE, { keyPath: 'branchId' });
    store.createIndex('branchId', 'branchId', { unique: true });
  }

  if (!db.objectStoreNames.contains(EXERCISE_DRAFTS_STORE)) {
    const store = db.createObjectStore(EXERCISE_DRAFTS_STORE, { keyPath: 'exerciseId' });
    store.createIndex('ownerUserId', 'ownerUserId');
    store.createIndex('updatedAt', 'updatedAt');
  }

  if (!db.objectStoreNames.contains(EXERCISE_VERSIONS_STORE)) {
    const store = db.createObjectStore(EXERCISE_VERSIONS_STORE, { keyPath: ['exerciseId', 'version'] });
    store.createIndex('exerciseId', 'exerciseId');
    store.createIndex('ownerUserId', 'ownerUserId');
  }

  if (!db.objectStoreNames.contains(EXERCISE_CATALOG_STORE)) {
    const store = db.createObjectStore(EXERCISE_CATALOG_STORE, { keyPath: 'exerciseId' });
    store.createIndex('ownerUserId', 'ownerUserId');
    store.createIndex('updatedAt', 'updatedAt');
  }

  if (!db.objectStoreNames.contains(EXERCISE_ATTEMPTS_STORE)) {
    const store = db.createObjectStore(EXERCISE_ATTEMPTS_STORE, { keyPath: 'id' });
    store.createIndex('userId', 'userId');
    store.createIndex('teacherRecordingId', 'teacherRecordingId');
    store.createIndex('exercisePointId', 'exercisePointId');
    store.createIndex('updatedAt', 'updatedAt');
  }
}

let databasePromise: Promise<IDBDatabase | undefined> | undefined;

export function openInteractiveTimelineDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(undefined);
  }

  databasePromise ??= new Promise((resolve) => {
    const request = window.indexedDB.open(INTERACTIVE_TIMELINE_DB_NAME, INTERACTIVE_TIMELINE_DB_VERSION);
    request.onerror = () => resolve(undefined);
    request.onupgradeneeded = () => upgradeInteractiveTimelineStores(request.result);
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        databasePromise = undefined;
      };
      resolve(request.result);
    };
  });

  return databasePromise;
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export function waitForIndexedDBTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}
