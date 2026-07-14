import { describe, expect, it } from 'vitest';
import {
  MAX_EXECUTION_OUTPUT_CHUNK_LENGTH,
  isTimelineEventType,
  normalizeExecutionEventPayload,
} from './event-validation.js';

describe('execution timeline event validation', () => {
  it('normalizes all valid execution payloads', () => {
    expect(
      normalizeExecutionEventPayload('execution.started', { executionId: 'run-1', provider: 'pyodide' }),
    ).toMatchObject({ executionId: 'run-1', provider: 'pyodide' });
    expect(normalizeExecutionEventPayload('execution.stdout', { executionId: 'run-1', value: '' })).toEqual({
      executionId: 'run-1',
      value: '',
    });
    expect(
      normalizeExecutionEventPayload('execution.finished', { executionId: 'run-1', exitCode: 0, durationMs: 0 }),
    ).toMatchObject({ exitCode: 0, durationMs: 0 });
    expect(
      normalizeExecutionEventPayload('execution.failed', { executionId: 'run-1', traceback: 'error', durationMs: 1 }),
    ).toMatchObject({ traceback: 'error' });
    expect(normalizeExecutionEventPayload('execution.interrupted', { executionId: 'run-1' })).toEqual({
      executionId: 'run-1',
    });
  });

  it.each([
    ['execution.stdout', { value: 'missing id' }],
    ['execution.started', { executionId: 'run', provider: 'unknown' }],
    ['execution.stdout', { executionId: 'run', value: 1 }],
    ['execution.finished', { executionId: 'run', exitCode: 0, durationMs: -1 }],
    ['execution.finished', { executionId: 'run', exitCode: 0, durationMs: Number.POSITIVE_INFINITY }],
    ['execution.finished', { executionId: 'run', exitCode: 1.5, durationMs: 1 }],
    ['execution.failed', { executionId: 'run', traceback: 1, durationMs: 1 }],
  ] as const)('rejects malformed %s payloads', (type, payload) => {
    expect(() => normalizeExecutionEventPayload(type, payload)).toThrow();
  });

  it('rejects oversized output and unknown event types', () => {
    expect(() =>
      normalizeExecutionEventPayload('execution.stderr', {
        executionId: 'run',
        value: 'x'.repeat(MAX_EXECUTION_OUTPUT_CHUNK_LENGTH + 1),
      }),
    ).toThrow(/size limit/);
    expect(isTimelineEventType('execution.unknown')).toBe(false);
  });
});
