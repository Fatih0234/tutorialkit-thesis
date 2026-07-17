import type {
  ExerciseAttempt,
  ExerciseCatalogEntry,
  ExerciseDraft,
  ExerciseVersion,
} from './types.js';

export interface ExerciseStorage {
  listDrafts(ownerUserId?: string): Promise<ExerciseDraft[]>;
  loadDraft(exerciseId: string): Promise<ExerciseDraft | undefined>;
  saveDraft(draft: ExerciseDraft): Promise<void>;
  deleteDraft(exerciseId: string): Promise<void>;
  listCatalog(ownerUserId?: string): Promise<ExerciseCatalogEntry[]>;
  loadCatalogEntry(exerciseId: string): Promise<ExerciseCatalogEntry | undefined>;
  saveCatalogEntry(entry: ExerciseCatalogEntry): Promise<void>;
  listVersions(exerciseId: string): Promise<ExerciseVersion[]>;
  loadVersion(exerciseId: string, version: number): Promise<ExerciseVersion | undefined>;
  saveVersion(version: ExerciseVersion): Promise<void>;
  listAttempts(query?: Partial<Pick<ExerciseAttempt, 'userId' | 'teacherRecordingId' | 'exercisePointId'>>): Promise<ExerciseAttempt[]>;
  loadAttempt(attemptId: string): Promise<ExerciseAttempt | undefined>;
  saveAttempt(attempt: ExerciseAttempt): Promise<void>;
}

export class MemoryExerciseStorage implements ExerciseStorage {
  private readonly drafts = new Map<string, ExerciseDraft>();
  private readonly catalog = new Map<string, ExerciseCatalogEntry>();
  private readonly versions = new Map<string, ExerciseVersion>();
  private readonly attempts = new Map<string, ExerciseAttempt>();

  async listDrafts(ownerUserId?: string) {
    return [...this.drafts.values()]
      .filter((draft) => !ownerUserId || draft.ownerUserId === ownerUserId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadDraft(exerciseId: string) {
    return this.drafts.get(exerciseId);
  }

  async saveDraft(draft: ExerciseDraft) {
    this.drafts.set(draft.exerciseId, structuredClone(draft));
  }

  async deleteDraft(exerciseId: string) {
    this.drafts.delete(exerciseId);
  }

  async listCatalog(ownerUserId?: string) {
    return [...this.catalog.values()]
      .filter((entry) => !ownerUserId || entry.ownerUserId === ownerUserId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadCatalogEntry(exerciseId: string) {
    return this.catalog.get(exerciseId);
  }

  async saveCatalogEntry(entry: ExerciseCatalogEntry) {
    this.catalog.set(entry.exerciseId, structuredClone(entry));
  }

  async listVersions(exerciseId: string) {
    return [...this.versions.values()]
      .filter((version) => version.exerciseId === exerciseId)
      .sort((a, b) => a.version - b.version);
  }

  async loadVersion(exerciseId: string, version: number) {
    return this.versions.get(versionKey(exerciseId, version));
  }

  async saveVersion(version: ExerciseVersion) {
    const key = versionKey(version.exerciseId, version.version);
    const existing = this.versions.get(key);

    if (existing && JSON.stringify(existing) !== JSON.stringify(version)) {
      throw new Error('Published exercise versions are immutable.');
    }

    this.versions.set(key, structuredClone(version));
  }

  async listAttempts(query: Partial<Pick<ExerciseAttempt, 'userId' | 'teacherRecordingId' | 'exercisePointId'>> = {}) {
    return [...this.attempts.values()]
      .filter((attempt) => !query.userId || attempt.userId === query.userId)
      .filter((attempt) => !query.teacherRecordingId || attempt.teacherRecordingId === query.teacherRecordingId)
      .filter((attempt) => !query.exercisePointId || attempt.exercisePointId === query.exercisePointId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadAttempt(attemptId: string) {
    return this.attempts.get(attemptId);
  }

  async saveAttempt(attempt: ExerciseAttempt) {
    this.attempts.set(attempt.id, structuredClone(attempt));
  }
}

export function exerciseVersionStorageKey(exerciseId: string, version: number): string {
  return versionKey(exerciseId, version);
}

function versionKey(exerciseId: string, version: number) {
  return `${exerciseId}:${version}`;
}
