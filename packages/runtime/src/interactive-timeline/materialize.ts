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

    if (event.type === 'execution.started') {
      const payload = event.payload as ExecutionStartedPayload;
      state.activeExecutionId = payload.executionId;
      state.output = [];
      state.status = 'running';
      delete state.exitCode;
      delete state.traceback;
    } else if (event.type === 'execution.stdout' || event.type === 'execution.stderr') {
      const payload = event.payload as ExecutionOutputPayload;
      state.output.push({
        executionId: payload.executionId,
        stream: event.type === 'execution.stdout' ? 'stdout' : 'stderr',
        value: payload.value,
      });
    } else if (event.type === 'execution.finished') {
      const payload = event.payload as ExecutionFinishedPayload;
      state.activeExecutionId = payload.executionId;
      state.status = 'finished';
      state.exitCode = payload.exitCode;
    } else if (event.type === 'execution.failed') {
      const payload = event.payload as ExecutionFailedPayload;
      state.activeExecutionId = payload.executionId;
      state.status = 'failed';
      state.traceback = payload.traceback;
    } else if (event.type === 'execution.interrupted') {
      state.activeExecutionId = (event.payload as ExecutionInterruptedPayload).executionId;
      state.status = 'interrupted';
    }
  }

  return state;
}

export function getFinalTeacherState(recording: TeacherRecording): FilesSnapshot {
  return materializeTeacherState(recording, Number.POSITIVE_INFINITY);
}
