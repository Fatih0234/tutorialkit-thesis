import { describe, expect, it } from 'vitest';
import { materializeExecutionState } from './materialize.js';
import type { TeacherRecording, TimelineEvent } from './types.js';

function recording(events: TimelineEvent[]): TeacherRecording {
  return {
    id: 'r',
    lessonId: 'lesson',
    version: 1,
    startedAt: new Date(0).toISOString(),
    durationMs: 20,
    baseFiles: {},
    events,
  };
}

describe('execution timeline materialization', () => {
  it('orders equal timestamps by seq and rebuilds stdout/stderr deterministically', () => {
    const state = materializeExecutionState(
      recording([
        {
          id: 'stderr',
          seq: 2,
          tMs: 5,
          type: 'execution.stderr',
          origin: 'teacher',
          payload: { executionId: 'x', value: 'err' },
        },
        {
          id: 'stdout',
          seq: 1,
          tMs: 5,
          type: 'execution.stdout',
          origin: 'teacher',
          payload: { executionId: 'x', value: 'out' },
        },
        {
          id: 'start',
          seq: 0,
          tMs: 0,
          type: 'execution.started',
          origin: 'teacher',
          payload: { executionId: 'x', provider: 'pyodide', entrypoint: 'main.py' },
        },
        {
          id: 'finish',
          seq: 3,
          tMs: 10,
          type: 'execution.finished',
          origin: 'teacher',
          payload: { executionId: 'x', exitCode: 0, durationMs: 10 },
        },
      ]),
      10,
    );
    expect(state.output.map((chunk) => `${chunk.stream}:${chunk.value}`)).toEqual(['stdout:out', 'stderr:err']);
    expect(state).toMatchObject({ activeExecutionId: 'x', status: 'finished', exitCode: 0 });
  });

  it('clears previous output when a later execution starts and seeks correctly', () => {
    const events: TimelineEvent[] = [
      {
        id: 's1',
        seq: 0,
        tMs: 0,
        type: 'execution.started',
        origin: 'teacher',
        payload: { executionId: 'one', provider: 'pyodide' },
      },
      {
        id: 'o1',
        seq: 1,
        tMs: 1,
        type: 'execution.stdout',
        origin: 'teacher',
        payload: { executionId: 'one', value: 'old' },
      },
      {
        id: 's2',
        seq: 2,
        tMs: 5,
        type: 'execution.started',
        origin: 'teacher',
        payload: { executionId: 'two', provider: 'pyodide' },
      },
      {
        id: 'o2',
        seq: 3,
        tMs: 6,
        type: 'execution.stdout',
        origin: 'teacher',
        payload: { executionId: 'two', value: 'new' },
      },
    ];
    expect(materializeExecutionState(recording(events), 1).output[0]?.value).toBe('old');
    expect(materializeExecutionState(recording(events), 6).output[0]?.value).toBe('new');
  });
});
