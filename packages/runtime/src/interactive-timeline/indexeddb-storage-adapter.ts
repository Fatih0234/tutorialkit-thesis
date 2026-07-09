import { saveLearnerDeltas } from './storage.js';
import {
  LocalStorageInteractiveTimelineStorage,
  getTeacherRecordingDraftSummary,
  type InteractiveTimelineStorage,
  type TeacherRecordingDraftSummary,
} from './storage-adapter.js';
import type { LearnerDelta, TeacherRecording } from './types.js';

const DB_NAME = 'interactive-timeline-poc';
const DB_VERSION = 1;
const TEACHER_RECORDINGS_STORE = 'teacherRecordings';
const LEARNER_DELTAS_STORE = 'learnerDeltas';

type StoreName = typeof TEACHER_RECORDINGS_STORE | typeof LEARNER_DELTAS_STORE;

function canUseIndexedDB(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
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

function sortTeacherRecordingsNewestFirst(recordings: TeacherRecording[]): TeacherRecording[] {
  return [...recordings].sort((a, b) => {
    const startedAtOrder = b.startedAt.localeCompare(a.startedAt);

    if (startedAtOrder !== 0) {
      return startedAtOrder;
    }

    return b.id.localeCompare(a.id);
  });
}

function sortLearnerDeltasOldestFirst(deltas: LearnerDelta[]): LearnerDelta[] {
  return [...deltas].sort((a, b) => {
    const createdAtOrder = a.createdAt.localeCompare(b.createdAt);

    if (createdAtOrder !== 0) {
      return createdAtOrder;
    }

    return a.id.localeCompare(b.id);
  });
}

export class IndexedDBInteractiveTimelineStorage implements InteractiveTimelineStorage {
  private dbPromise: Promise<IDBDatabase | undefined> | undefined;
  private migrationPromise: Promise<void> | undefined;
  private readonly fallbackStorage: InteractiveTimelineStorage;

  constructor(fallbackStorage: InteractiveTimelineStorage = new LocalStorageInteractiveTimelineStorage()) {
    this.fallbackStorage = fallbackStorage;
  }

  async loadTeacherRecording(): Promise<TeacherRecording | undefined> {
    await this.migrateLocalStorageIfNeeded();

    const indexedDbRecordings = await this.readAllTeacherRecordingsFromIndexedDB();

    if (!indexedDbRecordings) {
      return this.fallbackStorage.loadTeacherRecording();
    }

    if (indexedDbRecordings.length > 0) {
      const latest = sortTeacherRecordingsNewestFirst(indexedDbRecordings)[0];

      await this.fallbackStorage.saveTeacherRecording(latest);

      return latest;
    }

    const fallbackRecording = await this.fallbackStorage.loadTeacherRecording();

    if (fallbackRecording) {
      await this.writeTeacherRecordingToIndexedDB(fallbackRecording);
    }

    return fallbackRecording;
  }

  async saveTeacherRecording(recording: TeacherRecording): Promise<void> {
    await this.saveTeacherRecordingDraft(recording);
  }

  async loadLearnerDeltas(): Promise<LearnerDelta[]> {
    await this.migrateLocalStorageIfNeeded();

    const indexedDbDeltas = await this.readAllLearnerDeltasFromIndexedDB();

    if (!indexedDbDeltas) {
      return this.fallbackStorage.loadLearnerDeltas();
    }

    if (indexedDbDeltas.length > 0) {
      const sortedDeltas = sortLearnerDeltasOldestFirst(indexedDbDeltas);

      saveLearnerDeltas(sortedDeltas);

      return sortedDeltas;
    }

    const fallbackDeltas = await this.fallbackStorage.loadLearnerDeltas();

    for (const delta of fallbackDeltas) {
      await this.writeLearnerDeltaToIndexedDB(delta);
    }

    return fallbackDeltas;
  }

  async loadLatestLearnerDelta(): Promise<LearnerDelta | undefined> {
    return (await this.loadLearnerDeltas()).at(-1);
  }

  async saveLearnerDelta(delta: LearnerDelta): Promise<void> {
    await this.migrateLocalStorageIfNeeded();

    const wroteToIndexedDB = await this.writeLearnerDeltaToIndexedDB(delta);

    if (!wroteToIndexedDB) {
      await this.fallbackStorage.saveLearnerDelta(delta);
      return;
    }

    const deltas = await this.readAllLearnerDeltasFromIndexedDB();

    if (deltas) {
      saveLearnerDeltas(sortLearnerDeltasOldestFirst(deltas));
      return;
    }

    await this.fallbackStorage.saveLearnerDelta(delta);
  }

  async listTeacherRecordingDrafts(): Promise<TeacherRecordingDraftSummary[]> {
    await this.migrateLocalStorageIfNeeded();

    const indexedDbRecordings = await this.readAllTeacherRecordingsFromIndexedDB();

    if (!indexedDbRecordings) {
      return this.fallbackStorage.listTeacherRecordingDrafts();
    }

    if (indexedDbRecordings.length === 0) {
      const fallbackRecording = await this.fallbackStorage.loadTeacherRecording();

      if (fallbackRecording) {
        await this.writeTeacherRecordingToIndexedDB(fallbackRecording);
        return [getTeacherRecordingDraftSummary(fallbackRecording)];
      }
    }

    return sortTeacherRecordingsNewestFirst(indexedDbRecordings).map(getTeacherRecordingDraftSummary);
  }

  async loadTeacherRecordingDraft(id: string): Promise<TeacherRecording | undefined> {
    await this.migrateLocalStorageIfNeeded();

    const indexedDbRecording = await this.readTeacherRecordingFromIndexedDB(id);

    if (indexedDbRecording) {
      await this.fallbackStorage.saveTeacherRecording(indexedDbRecording);
      return indexedDbRecording;
    }

    const fallbackRecording = await this.fallbackStorage.loadTeacherRecordingDraft(id);

    if (fallbackRecording) {
      await this.writeTeacherRecordingToIndexedDB(fallbackRecording);
      await this.fallbackStorage.saveTeacherRecording(fallbackRecording);
    }

    return fallbackRecording;
  }

  async saveTeacherRecordingDraft(recording: TeacherRecording): Promise<void> {
    await this.writeTeacherRecordingToIndexedDB(recording);
    await this.fallbackStorage.saveTeacherRecording(recording);
  }

  async deleteTeacherRecordingDraft(id: string): Promise<void> {
    await this.deleteTeacherRecordingFromIndexedDB(id);
  }

  private async migrateLocalStorageIfNeeded(): Promise<void> {
    if (!canUseIndexedDB()) {
      return;
    }

    this.migrationPromise ??= this.migrateLocalStorageIntoIndexedDB();

    await this.migrationPromise;
  }

  private async migrateLocalStorageIntoIndexedDB(): Promise<void> {
    const db = await this.openDatabase();

    if (!db) {
      return;
    }

    const localRecording = await this.fallbackStorage.loadTeacherRecording();

    if (localRecording && !(await this.readTeacherRecordingFromIndexedDB(localRecording.id))) {
      await this.writeTeacherRecordingToIndexedDB(localRecording);
    }

    const localDeltas = await this.fallbackStorage.loadLearnerDeltas();

    for (const delta of localDeltas) {
      if (!(await this.readLearnerDeltaFromIndexedDB(delta.id))) {
        await this.writeLearnerDeltaToIndexedDB(delta);
      }
    }
  }

  private async openDatabase(): Promise<IDBDatabase | undefined> {
    if (!canUseIndexedDB()) {
      return undefined;
    }

    this.dbPromise ??= new Promise((resolve) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => resolve(undefined);
      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(TEACHER_RECORDINGS_STORE)) {
          const teacherRecordings = db.createObjectStore(TEACHER_RECORDINGS_STORE, { keyPath: 'id' });

          teacherRecordings.createIndex('lessonId', 'lessonId', { unique: false });
          teacherRecordings.createIndex('startedAt', 'startedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(LEARNER_DELTAS_STORE)) {
          const learnerDeltas = db.createObjectStore(LEARNER_DELTAS_STORE, { keyPath: 'id' });

          learnerDeltas.createIndex('lessonId', 'lessonId', { unique: false });
          learnerDeltas.createIndex('teacherRecordingId', 'teacherRecordingId', { unique: false });
          learnerDeltas.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;

        db.onversionchange = () => db.close();
        resolve(db);
      };
    });

    return this.dbPromise;
  }

  private async getStore(storeName: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore | undefined> {
    const db = await this.openDatabase();

    if (!db) {
      return undefined;
    }

    return db.transaction(storeName, mode).objectStore(storeName);
  }

  private async readAllTeacherRecordingsFromIndexedDB(): Promise<TeacherRecording[] | undefined> {
    try {
      const store = await this.getStore(TEACHER_RECORDINGS_STORE, 'readonly');

      if (!store) {
        return undefined;
      }

      return requestToPromise<TeacherRecording[]>(store.getAll());
    } catch {
      return undefined;
    }
  }

  private async readTeacherRecordingFromIndexedDB(id: string): Promise<TeacherRecording | undefined> {
    try {
      const store = await this.getStore(TEACHER_RECORDINGS_STORE, 'readonly');

      if (!store) {
        return undefined;
      }

      return requestToPromise<TeacherRecording | undefined>(store.get(id));
    } catch {
      return undefined;
    }
  }

  private async writeTeacherRecordingToIndexedDB(recording: TeacherRecording): Promise<boolean> {
    try {
      const db = await this.openDatabase();

      if (!db) {
        return false;
      }

      const transaction = db.transaction(TEACHER_RECORDINGS_STORE, 'readwrite');

      transaction.objectStore(TEACHER_RECORDINGS_STORE).put(recording);
      await waitForTransaction(transaction);

      return true;
    } catch {
      return false;
    }
  }

  private async deleteTeacherRecordingFromIndexedDB(id: string): Promise<void> {
    try {
      const db = await this.openDatabase();

      if (!db) {
        return;
      }

      const transaction = db.transaction(TEACHER_RECORDINGS_STORE, 'readwrite');

      transaction.objectStore(TEACHER_RECORDINGS_STORE).delete(id);
      await waitForTransaction(transaction);
    } catch {
      // Deleting drafts is best-effort in this browser-only POC.
    }
  }

  private async readAllLearnerDeltasFromIndexedDB(): Promise<LearnerDelta[] | undefined> {
    try {
      const store = await this.getStore(LEARNER_DELTAS_STORE, 'readonly');

      if (!store) {
        return undefined;
      }

      return requestToPromise<LearnerDelta[]>(store.getAll());
    } catch {
      return undefined;
    }
  }

  private async readLearnerDeltaFromIndexedDB(id: string): Promise<LearnerDelta | undefined> {
    try {
      const store = await this.getStore(LEARNER_DELTAS_STORE, 'readonly');

      if (!store) {
        return undefined;
      }

      return requestToPromise<LearnerDelta | undefined>(store.get(id));
    } catch {
      return undefined;
    }
  }

  private async writeLearnerDeltaToIndexedDB(delta: LearnerDelta): Promise<boolean> {
    try {
      const db = await this.openDatabase();

      if (!db) {
        return false;
      }

      const transaction = db.transaction(LEARNER_DELTAS_STORE, 'readwrite');

      transaction.objectStore(LEARNER_DELTAS_STORE).put(delta);
      await waitForTransaction(transaction);

      return true;
    } catch {
      return false;
    }
  }
}
