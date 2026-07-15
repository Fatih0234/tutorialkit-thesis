import { normalizeExecutionEventPayload } from './event-validation.js';
import { normalizeFiles, normalizePath } from './path.js';
import type {
  ExecutionFailedPayload,
  ExecutionFinishedPayload,
  ExecutionInterruptedPayload,
  ExecutionOutputPayload,
  ExecutionStartedPayload,
  FileChangedPayload,
  FilesSnapshot,
  MaterializedExecutionState,
  TeacherRecording,
} from './types.js';

export function materializeTeacherState(recording: TeacherRecording, untilMs: number): FilesSnapshot {
  const files: FilesSnapshot = { ...normalizeFiles(recording.baseFiles) };

  const events = [...recording.events].sort((a, b) => {
    if (a.tMs !== b.tMs) {
      return a.tMs - b.tMs;
    }

    return a.seq - b.seq;
  });

  for (const event of events) {
    if (event.tMs > untilMs) {
      break;
    }

    if ((event.type === 'file.created' || event.type === 'file.changed') && event.filePath) {
      const payload = event.payload as FileChangedPayload | undefined;

      if (typeof payload?.content === 'string') {
        files[normalizePath(event.filePath)] = payload.content;
      }
    }
  }

  return files;
}

export function materializeExecutionState(recording: TeacherRecording, untilMs: number): MaterializedExecutionState {
  const state: MaterializedExecutionState = { output: [], status: 'idle' };
  const events = [...recording.events].sort((a, b) => (a.tMs === b.tMs ? a.seq - b.seq : a.tMs - b.tMs));

  for (const event of events) {
    if (event.tMs > untilMs) {
      break;
    }

    let payload: unknown;

    try {
      payload = normalizeExecutionEventPayload(event.type, event.payload);
    } catch {
      continue;
    }

    if (event.type === 'execution.started') {
      const started = payload as ExecutionStartedPayload;
      state.activeExecutionId = started.executionId;
      state.output = [];
      state.status = 'running';
      delete state.exitCode;
      delete state.traceback;
    } else if (event.type === 'execution.stdout' || event.type === 'execution.stderr') {
      const output = payload as ExecutionOutputPayload;

      if (output.executionId !== state.activeExecutionId) {
        continue;
      }

      state.output.push({
        executionId: output.executionId,
        stream: event.type === 'execution.stdout' ? 'stdout' : 'stderr',
        value: output.value,
      });
    } else if (event.type === 'execution.finished') {
      const finished = payload as ExecutionFinishedPayload;

      if (finished.executionId !== state.activeExecutionId) {
        continue;
      }

      state.status = 'finished';
      state.exitCode = finished.exitCode;
    } else if (event.type === 'execution.failed') {
      const failed = payload as ExecutionFailedPayload;

      if (failed.executionId !== state.activeExecutionId) {
        continue;
      }

      state.status = 'failed';
      state.traceback = failed.traceback;
    } else if (event.type === 'execution.interrupted') {
      const interrupted = payload as ExecutionInterruptedPayload;

      if (interrupted.executionId !== state.activeExecutionId) {
        continue;
      }

      state.status = 'interrupted';
    }
  }

  return state;
}

export function getFinalTeacherState(recording: TeacherRecording): FilesSnapshot {
  return materializeTeacherState(recording, Number.POSITIVE_INFINITY);
}
