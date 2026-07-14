import { describe, expect, it } from 'vitest';
import { LiveRuntimeSession } from './live-runtime-session.js';

const started = { type: 'execution.started', executionId: 'learner', entrypoint: 'main.py' } as const;

describe('LiveRuntimeSession', () => {
  it('rejects delayed learner output after teacher playback invalidates the session', () => {
    const session = new LiveRuntimeSession();
    session.begin();
    expect(session.accepts(started)).toBe(true);
    session.invalidate();

    expect(session.accepts({ type: 'execution.stdout', executionId: 'learner', value: 'late' })).toBe(false);
    expect(session.accepts({ type: 'execution.stderr', executionId: 'learner', value: 'late error' })).toBe(false);
    expect(
      session.accepts({ type: 'execution.failed', executionId: 'learner', traceback: 'late failure', durationMs: 1 }),
    ).toBe(false);
    expect(session.accepts({ type: 'execution.interrupted', executionId: 'learner' })).toBe(false);
  });

  it('accepts events only for the active execution id', () => {
    const session = new LiveRuntimeSession();
    session.begin();
    session.accepts(started);

    expect(session.accepts({ type: 'execution.stdout', executionId: 'other', value: 'stale' })).toBe(false);
    expect(session.accepts({ type: 'execution.stdout', executionId: 'learner', value: 'current' })).toBe(true);
  });
});
