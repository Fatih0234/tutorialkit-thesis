import {
  EXERCISE_ATTEMPTS_STORE,
  EXERCISE_CATALOG_STORE,
  EXERCISE_DRAFTS_STORE,
  EXERCISE_VERSIONS_STORE,
  openInteractiveTimelineDatabase,
  requestToPromise,
  waitForIndexedDBTransaction,
  type InteractiveTimelineStoreName,
} from '../indexeddb-schema.js';
import { MemoryExerciseStorage, type ExerciseStorage } from './storage.js';
import type { ExerciseAttempt, ExerciseCatalogEntry, ExerciseDraft, ExerciseVersion } from './types.js';

type ExerciseStoreName = Extract<
  InteractiveTimelineStoreName,
  | typeof EXERCISE_DRAFTS_STORE
  | typeof EXERCISE_VERSIONS_STORE
  | typeof EXERCISE_CATALOG_STORE
  | typeof EXERCISE_ATTEMPTS_STORE
>;

export class IndexedDBExerciseStorage implements ExerciseStorage {
  constructor(private readonly fallback = new MemoryExerciseStorage()) {}

  async listDrafts(ownerUserId?: string) {
    const drafts = await this.readAll<ExerciseDraft>(EXERCISE_DRAFTS_STORE);
    return drafts
      ? drafts.filter((draft) => !ownerUserId || draft.ownerUserId === ownerUserId).sort(byUpdatedAt)
      : this.fallback.listDrafts(ownerUserId);
  }

  async loadDraft(exerciseId: string) {
    return (await this.read<ExerciseDraft>(EXERCISE_DRAFTS_STORE, exerciseId)) ?? this.fallback.loadDraft(exerciseId);
  }

  async saveDraft(draft: ExerciseDraft) {
    await this.write(EXERCISE_DRAFTS_STORE, draft, () => this.fallback.saveDraft(draft));
  }

  async deleteDraft(exerciseId: string) {
    await this.delete(EXERCISE_DRAFTS_STORE, exerciseId, () => this.fallback.deleteDraft(exerciseId));
  }

  async listCatalog(ownerUserId?: string) {
    const entries = await this.readAll<ExerciseCatalogEntry>(EXERCISE_CATALOG_STORE);
    return entries
      ? entries.filter((entry) => !ownerUserId || entry.ownerUserId === ownerUserId).sort(byUpdatedAt)
      : this.fallback.listCatalog(ownerUserId);
  }

  async loadCatalogEntry(exerciseId: string) {
    return (
      (await this.read<ExerciseCatalogEntry>(EXERCISE_CATALOG_STORE, exerciseId)) ??
      this.fallback.loadCatalogEntry(exerciseId)
    );
  }

  async saveCatalogEntry(entry: ExerciseCatalogEntry) {
    await this.write(EXERCISE_CATALOG_STORE, entry, () => this.fallback.saveCatalogEntry(entry));
  }

  async listVersions(exerciseId: string) {
    const versions = await this.readAll<ExerciseVersion>(EXERCISE_VERSIONS_STORE);
    return versions
      ? versions.filter((version) => version.exerciseId === exerciseId).sort((a, b) => a.version - b.version)
      : this.fallback.listVersions(exerciseId);
  }

  async loadVersion(exerciseId: string, version: number) {
    return (
      (await this.read<ExerciseVersion>(EXERCISE_VERSIONS_STORE, [exerciseId, version])) ??
      this.fallback.loadVersion(exerciseId, version)
    );
  }

  async saveVersion(version: ExerciseVersion) {
    const existing = await this.loadVersion(version.exerciseId, version.version);

    if (existing && JSON.stringify(existing) !== JSON.stringify(version)) {
      throw new Error('Published exercise versions are immutable.');
    }

    await this.write(EXERCISE_VERSIONS_STORE, version, () => this.fallback.saveVersion(version));
  }

  async listAttempts(
    query: Partial<Pick<ExerciseAttempt, 'userId' | 'teacherRecordingId' | 'exercisePointId'>> = {},
  ) {
    const attempts = await this.readAll<ExerciseAttempt>(EXERCISE_ATTEMPTS_STORE);
    return attempts
      ? attempts
          .filter((attempt) => !query.userId || attempt.userId === query.userId)
          .filter((attempt) => !query.teacherRecordingId || attempt.teacherRecordingId === query.teacherRecordingId)
          .filter((attempt) => !query.exercisePointId || attempt.exercisePointId === query.exercisePointId)
          .sort(byUpdatedAt)
      : this.fallback.listAttempts(query);
  }

  async loadAttempt(attemptId: string) {
    return (
      (await this.read<ExerciseAttempt>(EXERCISE_ATTEMPTS_STORE, attemptId)) ??
      this.fallback.loadAttempt(attemptId)
    );
  }

  async saveAttempt(attempt: ExerciseAttempt) {
    await this.write(EXERCISE_ATTEMPTS_STORE, attempt, () => this.fallback.saveAttempt(attempt));
  }

  private async read<T>(storeName: ExerciseStoreName, key: IDBValidKey): Promise<T | undefined> {
    try {
      const db = await openInteractiveTimelineDatabase();
      return db ? await requestToPromise<T | undefined>(db.transaction(storeName).objectStore(storeName).get(key)) : undefined;
    } catch {
      return undefined;
    }
  }

  private async readAll<T>(storeName: ExerciseStoreName): Promise<T[] | undefined> {
    try {
      const db = await openInteractiveTimelineDatabase();
      return db ? await requestToPromise<T[]>(db.transaction(storeName).objectStore(storeName).getAll()) : undefined;
    } catch {
      return undefined;
    }
  }

  private async write(storeName: ExerciseStoreName, value: unknown, fallback: () => Promise<void>) {
    const db = await openInteractiveTimelineDatabase();

    if (!db) {
      await fallback();
      return;
    }

    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    await waitForIndexedDBTransaction(transaction);
  }

  private async delete(storeName: ExerciseStoreName, key: IDBValidKey, fallback: () => Promise<void>) {
    const db = await openInteractiveTimelineDatabase();

    if (!db) {
      await fallback();
      return;
    }

    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(key);
    await waitForIndexedDBTransaction(transaction);
  }
}

function byUpdatedAt(left: { updatedAt: string }, right: { updatedAt: string }) {
  return right.updatedAt.localeCompare(left.updatedAt);
}
