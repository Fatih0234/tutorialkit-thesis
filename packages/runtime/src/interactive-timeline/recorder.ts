import type {
  FileChangedPayload,
  FileCreatedPayload,
  TeacherRecording,
  TimelineEvent,
  TimelineEventType,
  FilesSnapshot,
} from './types.js';
import { normalizeFiles, normalizePath } from './path.js';

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

interface StartRecordingOptions {
  lessonId: string;
  version?: number;
  baseFiles: FilesSnapshot;
  startedAtMs?: number;
}

export class TimelineRecorder {
  private recording: TeacherRecording | undefined;
  private startTime = 0;
  private seq = 0;

  start({ lessonId, version = 1, baseFiles, startedAtMs = Date.now() }: StartRecordingOptions): TeacherRecording {
    this.startTime = startedAtMs;
    this.seq = 0;

    this.recording = {
      id: createId('teacher-recording'),
      lessonId,
      version,
      startedAt: new Date(startedAtMs).toISOString(),
      durationMs: 0,
      baseFiles: normalizeFiles(baseFiles),
      events: [],
    };

    this.append('recording.started', {
      origin: 'system',
    });

    return this.recording;
  }

  isRecording(): boolean {
    return Boolean(this.recording);
  }

  getRecording(): TeacherRecording | undefined {
    return this.recording;
  }

  append<TPayload>(
    type: TimelineEventType,
    options: {
      filePath?: string;
      payload?: TPayload;
      origin?: TimelineEvent['origin'];
      tMs?: number;
    } = {},
  ): TimelineEvent<TPayload> | undefined {
    if (!this.recording) {
      return undefined;
    }

    const event: TimelineEvent<TPayload> = {
      id: createId('event'),
      seq: this.seq++,
      tMs: options.tMs ?? Date.now() - this.startTime,
      type,
      filePath: options.filePath ? normalizePath(options.filePath) : undefined,
      payload: options.payload,
      origin: options.origin ?? 'teacher',
    };

    this.recording.events.push(event);

    return event;
  }

  recordFileOpened(filePath: string): void {
    this.append('file.opened', {
      filePath,
      payload: { filePath: normalizePath(filePath) },
    });
  }

  recordFileCreated(filePath: string, payload: FileCreatedPayload = { content: '' }): void {
    this.append('file.created', {
      filePath,
      payload,
    });
  }

  recordFileChanged(filePath: string, payload: FileChangedPayload): void {
    this.append('file.changed', {
      filePath,
      payload,
    });
  }

  stop(): TeacherRecording | undefined {
    if (!this.recording) {
      return undefined;
    }

    this.recording.durationMs = Date.now() - this.startTime;

    const stopped = this.recording;
    this.recording = undefined;

    return stopped;
  }
}
