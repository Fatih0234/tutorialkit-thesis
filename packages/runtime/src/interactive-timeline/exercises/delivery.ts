import type { ExerciseValidationBundle, LearnerExerciseDelivery } from './types.js';

export class RemoteExerciseDeliveryClient {
  constructor(private readonly baseUrl = '/api/interactive') {}

  async load(recordingId: string, pointId: string): Promise<LearnerExerciseDelivery> {
    return this.request(
      `/exercise-delivery/${encodeURIComponent(recordingId)}/${encodeURIComponent(pointId)}`,
    );
  }

  async loadVersion(recordingId: string, pointId: string, version: number): Promise<LearnerExerciseDelivery> {
    return this.request(
      `/exercise-delivery/${encodeURIComponent(recordingId)}/${encodeURIComponent(pointId)}/versions/${version}`,
    );
  }

  async loadValidationBundle(
    recordingId: string,
    pointId: string,
    version: number,
  ): Promise<ExerciseValidationBundle> {
    return this.request(
      `/exercise-delivery/${encodeURIComponent(recordingId)}/${encodeURIComponent(pointId)}/versions/${version}/validation`,
    );
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, { credentials: 'same-origin' });

    if (!response.ok) {
      throw new Error(`Exercise delivery failed (${response.status}): ${await response.text()}`);
    }

    return response.json() as Promise<T>;
  }
}
