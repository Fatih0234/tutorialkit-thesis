import type { ExercisePoint } from './exercises/types.js';
import type {
  FileChangedPayload,
  FileCreatedPayload,
  TeacherRecording,
  TimelineEvent,
  TimelineEventType,
  FilesSnapshot,
} from './types.js';
import type { PresentationLayout, PresentationResource } from './presentation.js';
import { normalizeFiles, normalizePath } from './path.js';

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

interface StartRecordingOptions {
  lessonId: string;
  version?: number;
  baseFiles: FilesSnapshot;
  startedAtMs?: number;
  presentationResources?: PresentationResource[];
  initialPresentationLayout?: PresentationLayout;
}

export class TimelineRecorder {
  private recording: TeacherRecording | undefined;
  private startTime = 0;
  private seq = 0;
  private pausedAtMs: number | undefined;
  private totalPausedMs = 0;

  start({
    lessonId,
    version = 1,
    baseFiles,
    startedAtMs = Date.now(),
    presentationResources,
    initialPresentationLayout,
  }: StartRecordingOptions): TeacherRecording {
    this.startTime = startedAtMs;
    this.seq = 0;
    this.pausedAtMs = undefined;
    this.totalPausedMs = 0;

    this.recording = {
      id: createId('teacher-recording'),
      lessonId,
      version,
      startedAt: new Date(startedAtMs).toISOString(),
      durationMs: 0,
      baseFiles: normalizeFiles(baseFiles),
      events: [],
      ...(presentationResources ? { presentationResources: structuredClone(presentationResources) } : {}),
      ...(initialPresentationLayout ? { initialPresentationLayout: structuredClone(initialPresentationLayout) } : {}),
    };

    this.append('recording.started', {
      origin: 'system',
    });

    return this.recording;
  }

  isRecording(): boolean {
    return Boolean(this.recording);
  }

  isPaused(): boolean {
    return this.pausedAtMs !== undefined;
  }

  getCurrentPosition(nowMs = Date.now()) {
    return {
      timestampMs: this.getElapsedMs(nowMs),
      lastAppliedEventSeq: this.recording?.events.at(-1)?.seq ?? -1,
    };
  }

  pause(nowMs = Date.now()) {
    if (!this.recording || this.pausedAtMs !== undefined) {
      return undefined;
    }

    this.pausedAtMs = nowMs;
    return this.getCurrentPosition(nowMs);
  }

  resume(nowMs = Date.now()): boolean {
    if (!this.recording || this.pausedAtMs === undefined) {
      return false;
    }

    this.totalPausedMs += Math.max(0, nowMs - this.pausedAtMs);
    this.pausedAtMs = undefined;
    return true;
  }

  addExercisePoint(point: ExercisePoint): ExercisePoint | undefined {
    if (!this.recording || !this.isPaused()) {
      return undefined;
    }

    const position = this.getCurrentPosition();
    const normalized: ExercisePoint = {
      ...point,
      teacherTimestampMs: position.timestampMs,
      lastAppliedTeacherEventSeq: position.lastAppliedEventSeq,
    };
    this.recording.exercisePoints = [...(this.recording.exercisePoints ?? []), normalized];
    return normalized;
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
    if (!this.recording || this.isPaused()) {
      return undefined;
    }

    const event: TimelineEvent<TPayload> = {
      id: createId('event'),
      seq: this.seq++,
      tMs: options.tMs ?? this.getElapsedMs(Date.now()),
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

    this.recording.durationMs = this.getElapsedMs(Date.now());

    const stopped = this.recording;
    this.recording = undefined;
    this.pausedAtMs = undefined;
    this.totalPausedMs = 0;

    return stopped;
  }

  private getElapsedMs(nowMs: number): number {
    if (!this.recording) {
      return 0;
    }

    const effectiveNow = this.pausedAtMs ?? nowMs;
    return Math.max(0, effectiveNow - this.startTime - this.totalPausedMs);
  }
}
