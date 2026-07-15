import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_BATCH_DELAY_MS, runAfterEditorBatch } from './delayed-runtime-run.js';
import { LiveRuntimeSession } from './live-runtime-session.js';

describe('runAfterEditorBatch', () => {
  afterEach(() => vi.useRealTimers());

  it('does not execute or dispatch instrumentation after invalidation during the editor delay', async () => {
    vi.useFakeTimers();

    const session = new LiveRuntimeSession();
    const generation = session.begin();
    const environmentRun = vi.fn(async () => undefined);
    const executionEvent = vi.fn();
    const pending = runAfterEditorBatch({
      session,
      generation,
      isTeacherPlayback: () => false,
      onExecution: executionEvent,
      run: environmentRun,
    });

    session.invalidate();
    await vi.advanceTimersByTimeAsync(EDITOR_BATCH_DELAY_MS);

    await expect(pending).resolves.toBe(false);
    expect(environmentRun).not.toHaveBeenCalled();
    expect(executionEvent).not.toHaveBeenCalled();
  });
});
