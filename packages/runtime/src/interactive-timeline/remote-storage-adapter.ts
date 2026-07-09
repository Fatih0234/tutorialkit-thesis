import type { InteractiveUser } from './identity.js';
import { getRecordingMediaAssetMetadata, type RecordingMediaAsset } from './media.js';
import { saveLearnerDeltas, saveTeacherRecording } from './storage.js';
import {
  getTeacherRecordingDraftSummary,
  type InteractiveTimelineStorage,
  type LearnerDeltaQuery,
  type TeacherRecordingDraftSummary,
} from './storage-adapter.js';
import type { LearnerDelta, TeacherRecording } from './types.js';

interface RemoteInteractiveTimelineStorageOptions {
  baseUrl?: string;
}

interface TeacherRecordingResponse {
  teacherRecording: TeacherRecording | null;
}

interface TeacherRecordingsResponse {
  teacherRecordings: TeacherRecording[];
}

interface LearnerDeltaResponse {
  learnerDelta: LearnerDelta | null;
}

interface LearnerDeltasResponse {
  learnerDeltas: LearnerDelta[];
}

interface MediaAssetMetadataResponse {
  mediaAsset: Omit<RecordingMediaAsset, 'blob'> | null;
  downloadUrl?: string;
}

interface MediaAssetsMetadataResponse {
  mediaAssets: Omit<RecordingMediaAsset, 'blob'>[];
}

interface CurrentUserResponse {
  user: InteractiveUser | null;
}

interface DevUsersResponse {
  users: InteractiveUser[];
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getQueryString(query?: LearnerDeltaQuery, { includeUserId = true }: { includeUserId?: boolean } = {}): string {
  const params = new URLSearchParams();

  if (query?.lessonId) {
    params.set('lessonId', query.lessonId);
  }

  if (query?.teacherRecordingId) {
    params.set('teacherRecordingId', query.teacherRecordingId);
  }

  if (query?.teacherRecordingVersion) {
    params.set('teacherRecordingVersion', String(query.teacherRecordingVersion));
  }

  if (includeUserId && query?.userId) {
    params.set('userId', query.userId);
  }

  const queryString = params.toString();

  return queryString ? `?${queryString}` : '';
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

export class RemoteInteractiveTimelineStorage implements InteractiveTimelineStorage {
  private readonly baseUrl: string;

  constructor({ baseUrl = '/api/interactive' }: RemoteInteractiveTimelineStorageOptions = {}) {
    this.baseUrl = trimTrailingSlash(baseUrl);
  }

  async loadTeacherRecording(id?: string): Promise<TeacherRecording | undefined> {
    if (id) {
      const response = await this.requestJson<TeacherRecordingResponse>(`/teacher-recordings/${encodeURIComponent(id)}`);
      const recording = response.teacherRecording ?? undefined;

      if (recording) {
        saveTeacherRecording(recording);
      }

      return recording;
    }

    const [latest] = await this.listTeacherRecordingDrafts();

    if (!latest) {
      return undefined;
    }

    return this.loadTeacherRecording(latest.id);
  }

  async saveTeacherRecording(recording: TeacherRecording): Promise<void> {
    const response = await this.requestJson<TeacherRecordingResponse>('/teacher-recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recording),
    });

    if (response.teacherRecording) {
      saveTeacherRecording(response.teacherRecording);
    }
  }

  async loadLearnerDeltas(query?: LearnerDeltaQuery): Promise<LearnerDelta[]> {
    const response = await this.requestJson<LearnerDeltasResponse>(`/learner-deltas${getQueryString(query, { includeUserId: false })}`);
    const deltas = sortLearnerDeltasOldestFirst(response.learnerDeltas ?? []);

    saveLearnerDeltas(deltas);

    return deltas;
  }

  async loadLatestLearnerDelta(query?: LearnerDeltaQuery): Promise<LearnerDelta | undefined> {
    const response = await this.requestJson<LearnerDeltaResponse>(`/learner-deltas/latest${getQueryString(query, { includeUserId: false })}`);
    const delta = response.learnerDelta ?? undefined;

    if (delta) {
      const deltas = await this.loadLearnerDeltas({
        lessonId: delta.lessonId,
        teacherRecordingId: delta.teacherRecordingId,
        teacherRecordingVersion: delta.teacherRecordingVersion,
        userId: delta.userId,
      });

      saveLearnerDeltas(deltas);
    }

    return delta;
  }

  async saveLearnerDelta(delta: LearnerDelta): Promise<void> {
    const response = await this.requestJson<LearnerDeltaResponse>('/learner-deltas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(delta),
    });
    const savedDelta = response.learnerDelta ?? delta;

    const deltas = await this.loadLearnerDeltas({
      lessonId: savedDelta.lessonId,
      teacherRecordingId: savedDelta.teacherRecordingId,
      teacherRecordingVersion: savedDelta.teacherRecordingVersion,
    });

    saveLearnerDeltas(deltas);
  }

  async listTeacherRecordingDrafts(): Promise<TeacherRecordingDraftSummary[]> {
    const response = await this.requestJson<TeacherRecordingsResponse>('/teacher-recordings');

    return (response.teacherRecordings ?? []).map(getTeacherRecordingDraftSummary);
  }

  async loadTeacherRecordingDraft(id: string): Promise<TeacherRecording | undefined> {
    return this.loadTeacherRecording(id);
  }

  async saveTeacherRecordingDraft(recording: TeacherRecording): Promise<void> {
    await this.saveTeacherRecording(recording);
  }

  async deleteTeacherRecordingDraft(_id: string): Promise<void> {
    // Published recordings are immutable in this POC and are not deleted through the draft API.
  }

  async saveMediaAsset(asset: RecordingMediaAsset): Promise<void> {
    if (!asset.blob) {
      throw new Error('Remote media upload requires a Blob.');
    }

    const formData = new FormData();
    const metadata = getRecordingMediaAssetMetadata(asset);

    formData.set('metadata', JSON.stringify(metadata));
    formData.set('id', asset.id);
    formData.set('recordingId', asset.recordingId);
    formData.set('kind', asset.kind);
    formData.set('mimeType', asset.mimeType);
    formData.set('durationMs', String(asset.durationMs));
    formData.set('createdAt', asset.createdAt);
    formData.set('file', asset.blob, `${asset.id}.media`);

    await this.requestJson<MediaAssetMetadataResponse>('/media-assets', {
      method: 'POST',
      body: formData,
    });
  }

  async loadMediaAsset(assetId: string): Promise<RecordingMediaAsset | undefined> {
    const metadataResponse = await this.requestJson<MediaAssetMetadataResponse>(
      `/media-assets/${encodeURIComponent(assetId)}`,
      {
        headers: { Accept: 'application/json' },
      },
    );
    const mediaAsset = metadataResponse.mediaAsset ?? undefined;

    if (!mediaAsset) {
      return undefined;
    }

    const blobResponse = await fetch(this.toUrl(metadataResponse.downloadUrl ?? `/media-assets/${encodeURIComponent(assetId)}?blob=1`), {
      credentials: 'same-origin',
    });

    if (!blobResponse.ok) {
      throw new Error(`Unable to load remote media asset ${assetId}: ${blobResponse.status}`);
    }

    const blob = await blobResponse.blob();

    return {
      ...mediaAsset,
      blob,
    };
  }

  async deleteMediaAsset(assetId: string): Promise<void> {
    await this.requestJson<{ ok: boolean }>(`/media-assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
  }

  async listMediaAssetsForRecording(recordingId: string): Promise<RecordingMediaAsset[]> {
    const params = new URLSearchParams({ recordingId });
    const response = await this.requestJson<MediaAssetsMetadataResponse>(`/media-assets?${params.toString()}`);

    return response.mediaAssets ?? [];
  }

  async loadCurrentUser(): Promise<InteractiveUser | null> {
    const response = await this.requestJson<CurrentUserResponse>('/auth/me');

    return response.user;
  }

  async devLogin(userId: string): Promise<InteractiveUser | null> {
    const response = await this.requestJson<CurrentUserResponse>('/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    return response.user;
  }

  async logout(): Promise<void> {
    await this.requestJson<{ ok: boolean }>('/auth/logout', { method: 'POST' });
  }

  async listDevUsers(): Promise<InteractiveUser[]> {
    const response = await this.requestJson<DevUsersResponse>('/users/dev');

    return response.users ?? [];
  }

  private toUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    if (!path.startsWith('/')) {
      return `${this.baseUrl}/${path}`;
    }

    return path.startsWith(this.baseUrl) ? path : `${this.baseUrl}${path}`;
  }

  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(this.toUrl(path), {
      ...init,
      credentials: init.credentials ?? 'same-origin',
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');

      throw new Error(`Interactive remote storage request failed (${response.status}): ${text || response.statusText}`);
    }

    return (await response.json()) as T;
  }
}
