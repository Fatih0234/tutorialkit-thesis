import type { FileChangedPayload, FilesSnapshot, TeacherRecording } from './types.js';
import { normalizeFiles, normalizePath } from './path.js';

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

export function getFinalTeacherState(recording: TeacherRecording): FilesSnapshot {
  return materializeTeacherState(recording, Number.POSITIVE_INFINITY);
}
