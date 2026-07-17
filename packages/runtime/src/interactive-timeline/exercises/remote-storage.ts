import type { ExerciseStorage } from './storage.js';
import type { ExerciseAttempt, ExerciseCatalogEntry, ExerciseDraft, ExerciseVersion } from './types.js';

export class RemoteExerciseStorage implements ExerciseStorage {
  constructor(private readonly baseUrl = '/api/interactive') {}

  async listDrafts(_ownerUserId?: string) {
    return (await this.request<{ exerciseDrafts: ExerciseDraft[] }>('/exercise-drafts')).exerciseDrafts ?? [];
  }

  async loadDraft(exerciseId: string) {
    const response = await fetch(this.url(`/exercise-drafts/${encodeURIComponent(exerciseId)}`), {
      credentials: 'same-origin',
    });
    if (response.status === 404) {return undefined;}
    return (await this.read<{ exerciseDraft: ExerciseDraft }>(response)).exerciseDraft;
  }

  async saveDraft(draft: ExerciseDraft) {
    await this.request(`/exercise-drafts/${encodeURIComponent(draft.exerciseId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseDraft: draft }),
    });
  }

  async deleteDraft(exerciseId: string) {
    await this.request(`/exercise-drafts/${encodeURIComponent(exerciseId)}`, { method: 'DELETE' });
  }

  async listCatalog(_ownerUserId?: string) {
    return (await this.request<{ exercises: ExerciseCatalogEntry[] }>('/exercises')).exercises ?? [];
  }

  async loadCatalogEntry(exerciseId: string) {
    const response = await fetch(this.url(`/exercises/${encodeURIComponent(exerciseId)}`), {
      credentials: 'same-origin',
    });
    if (response.status === 404) {return undefined;}
    return (await this.read<{ exercise: ExerciseCatalogEntry }>(response)).exercise;
  }

  async saveCatalogEntry(entry: ExerciseCatalogEntry) {
    await this.request(`/exercises/${encodeURIComponent(entry.exerciseId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise: entry }),
    });
  }

  async listVersions(exerciseId: string) {
    return (
      await this.request<{ exerciseVersions: ExerciseVersion[] }>(
        `/exercises/${encodeURIComponent(exerciseId)}/versions`,
      )
    ).exerciseVersions ?? [];
  }

  async loadVersion(exerciseId: string, version: number) {
    const response = await fetch(
      this.url(`/exercises/${encodeURIComponent(exerciseId)}/versions/${encodeURIComponent(String(version))}`),
      { credentials: 'same-origin' },
    );
    if (response.status === 404) {return undefined;}
    return (await this.read<{ exerciseVersion: ExerciseVersion }>(response)).exerciseVersion;
  }

  async saveVersion(version: ExerciseVersion) {
    await this.request(
      `/exercises/${encodeURIComponent(version.exerciseId)}/versions/${encodeURIComponent(String(version.version))}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseVersion: version }),
      },
    );
  }

  async listAttempts(
    query: Partial<Pick<ExerciseAttempt, 'userId' | 'teacherRecordingId' | 'exercisePointId'>> = {},
  ) {
    const params = new URLSearchParams();
    if (query.teacherRecordingId) {params.set('teacherRecordingId', query.teacherRecordingId);}
    if (query.exercisePointId) {params.set('exercisePointId', query.exercisePointId);}
    const suffix = params.size ? `?${params}` : '';
    return (await this.request<{ exerciseAttempts: ExerciseAttempt[] }>(`/exercise-attempts${suffix}`))
      .exerciseAttempts ?? [];
  }

  async loadAttempt(attemptId: string) {
    const response = await fetch(this.url(`/exercise-attempts/${encodeURIComponent(attemptId)}`), {
      credentials: 'same-origin',
    });
    if (response.status === 404) {return undefined;}
    return (await this.read<{ exerciseAttempt: ExerciseAttempt }>(response)).exerciseAttempt;
  }

  async saveAttempt(attempt: ExerciseAttempt) {
    await this.request(`/exercise-attempts/${encodeURIComponent(attempt.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseAttempt: attempt }),
    });
  }

  private url(path: string) {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`;
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.read<T>(await fetch(this.url(path), { ...init, credentials: 'same-origin' }));
  }

  private async read<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new Error(`Exercise storage request failed (${response.status}): ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  }
}
