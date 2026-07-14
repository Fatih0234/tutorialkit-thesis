import type { RuntimeEvent } from '@tutorialkit/runtime';

/** Gates live worker events independently from materialized playback output. */
export class LiveRuntimeSession {
  private _generation = 0;
  private _accepting = false;
  private _executionId: string | undefined;

  begin(): number {
    this._generation += 1;
    this._accepting = true;
    this._executionId = undefined;

    return this._generation;
  }

  invalidate(): number {
    this._generation += 1;
    this._accepting = false;
    this._executionId = undefined;

    return this._generation;
  }

  accepts(event: RuntimeEvent): boolean {
    if (!this._accepting || event.type === 'ready') {
      return false;
    }

    if (event.type === 'execution.started') {
      this._executionId = event.executionId;

      return true;
    }

    return this._executionId === event.executionId;
  }
}
