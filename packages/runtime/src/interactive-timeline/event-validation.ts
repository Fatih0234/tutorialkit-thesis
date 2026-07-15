import type {
  ExecutionFailedPayload,
  ExecutionFinishedPayload,
  ExecutionInterruptedPayload,
  ExecutionOutputPayload,
  ExecutionStartedPayload,
  TimelineEventType,
} from './types.js';

export const MAX_EXECUTION_OUTPUT_CHUNK_LENGTH = 1024 * 1024;
export const MAX_EXECUTION_TRACEBACK_LENGTH = 2 * 1024 * 1024;

const SAFE_EXECUTION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;

const TIMELINE_EVENT_TYPES: ReadonlySet<string> = new Set<TimelineEventType>([
  'recording.started',
  'file.opened',
  'file.created',
  'file.changed',
  'editor.scrolled',
  'editor.selection.changed',
  'pointer.changed',
  'pointer.clicked',
  'presentation.changed',
  'whiteboard.scene.changed',
  'execution.started',
  'execution.stdout',
  'execution.stderr',
  'execution.finished',
  'execution.failed',
  'execution.interrupted',
  'playback.marker',
]);

function objectPayload(payload: unknown, type: string): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${type} payload must be an object.`);
  }

  return payload as Record<string, unknown>;
}

function executionId(payload: Record<string, unknown>): string {
  if (typeof payload.executionId !== 'string' || !SAFE_EXECUTION_ID.test(payload.executionId)) {
    throw new Error('Execution event executionId is invalid.');
  }

  return payload.executionId;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  return value;
}

function duration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Execution event durationMs must be finite and non-negative.');
  }

  return value;
}

export function isTimelineEventType(value: unknown): value is TimelineEventType {
  return typeof value === 'string' && TIMELINE_EVENT_TYPES.has(value);
}

export function normalizeExecutionEventPayload(type: TimelineEventType, payload: unknown): unknown {
  if (!type.startsWith('execution.')) {
    return payload;
  }

  const candidate = objectPayload(payload, type);
  const id = executionId(candidate);

  if (type === 'execution.started') {
    if (candidate.provider !== 'webcontainer' && candidate.provider !== 'pyodide') {
      throw new Error('Execution started provider is invalid.');
    }

    return {
      executionId: id,
      provider: candidate.provider,
      entrypoint: optionalString(candidate.entrypoint, 'Execution entrypoint'),
      command: optionalString(candidate.command, 'Execution command'),
    } satisfies ExecutionStartedPayload;
  }

  if (type === 'execution.stdout' || type === 'execution.stderr') {
    if (typeof candidate.value !== 'string' || candidate.value.length > MAX_EXECUTION_OUTPUT_CHUNK_LENGTH) {
      throw new Error('Execution output must be a string within the size limit.');
    }

    return { executionId: id, value: candidate.value } satisfies ExecutionOutputPayload;
  }

  if (type === 'execution.finished') {
    if (
      typeof candidate.exitCode !== 'number' ||
      !Number.isFinite(candidate.exitCode) ||
      !Number.isInteger(candidate.exitCode)
    ) {
      throw new Error('Execution exitCode must be a finite integer.');
    }

    return {
      executionId: id,
      exitCode: candidate.exitCode,
      durationMs: duration(candidate.durationMs),
    } satisfies ExecutionFinishedPayload;
  }

  if (type === 'execution.failed') {
    if (typeof candidate.traceback !== 'string' || candidate.traceback.length > MAX_EXECUTION_TRACEBACK_LENGTH) {
      throw new Error('Execution traceback must be a string within the size limit.');
    }

    return {
      executionId: id,
      traceback: candidate.traceback,
      durationMs: duration(candidate.durationMs),
    } satisfies ExecutionFailedPayload;
  }

  return { executionId: id } satisfies ExecutionInterruptedPayload;
}
