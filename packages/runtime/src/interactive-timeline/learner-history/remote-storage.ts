import type {
  LearnerBranchAggregate,
  LearnerBranchQuery,
  LearnerBranchSyncResult,
} from './types.js';

export interface LearnerHistoryRemoteStorage {
  listAggregates(query: LearnerBranchQuery): Promise<LearnerBranchAggregate[]>;
  loadAggregate(branchId: string): Promise<LearnerBranchAggregate | undefined>;
  syncAggregate(aggregate: LearnerBranchAggregate): Promise<LearnerBranchSyncResult>;
}

interface RemoteOptions {
  baseUrl?: string;
}

export class RemoteLearnerHistoryStorage implements LearnerHistoryRemoteStorage {
  private readonly baseUrl: string;

  constructor({ baseUrl = '/api/interactive/learner-branches' }: RemoteOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async listAggregates(query: LearnerBranchQuery): Promise<LearnerBranchAggregate[]> {
    const params = new URLSearchParams();
    if (query.lessonId) params.set('lessonId', query.lessonId);
    if (query.teacherRecordingId) params.set('teacherRecordingId', query.teacherRecordingId);
    if (query.teacherRecordingVersion !== undefined) {
      params.set('teacherRecordingVersion', String(query.teacherRecordingVersion));
    }
    const response = await this.request<{ learnerBranches: LearnerBranchAggregate[] }>(
      params.size ? `?${params}` : '',
    );
    return response.learnerBranches ?? [];
  }

  async loadAggregate(branchId: string): Promise<LearnerBranchAggregate | undefined> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(branchId)}`, {
      credentials: 'same-origin',
    });
    if (response.status === 404) return undefined;
    return this.readResponse<{ learnerBranch: LearnerBranchAggregate }>(response).then((body) => body.learnerBranch);
  }

  async syncAggregate(aggregate: LearnerBranchAggregate): Promise<LearnerBranchSyncResult> {
    const response = await this.request<{ learnerBranch: LearnerBranchAggregate; outcome: LearnerBranchSyncResult['outcome'] }>(
      `/${encodeURIComponent(aggregate.branch.id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnerBranch: aggregate }),
      },
    );
    return { aggregate: response.learnerBranch, outcome: response.outcome };
  }

  private async request<T>(suffix: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${suffix}`, { ...init, credentials: 'same-origin' });
    return this.readResponse<T>(response);
  }

  private async readResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      throw new Error(`Learner history sync failed (${response.status}): ${message}`);
    }
    return response.json() as Promise<T>;
  }
}
