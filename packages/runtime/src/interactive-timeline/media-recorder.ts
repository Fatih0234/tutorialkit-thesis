import type { RecordingMediaAsset, RecordingMediaKind } from './media.js';

export type InteractiveMediaRecorderStatus =
  | 'idle'
  | 'permission-needed'
  | 'ready'
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'unavailable'
  | 'error';

export interface InteractiveMediaRecorderOptions {
  fake?: boolean;
}

export interface StartInteractiveMediaRecorderOptions {
  recordingId: string;
  startedAtMs?: number;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function canUseBrowserMediaRecorder(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof globalThis.MediaRecorder !== 'undefined'
  );
}

function getSupportedMimeType(kind: RecordingMediaKind): string {
  if (typeof globalThis.MediaRecorder === 'undefined') {
    return kind === 'audio' ? 'audio/webm' : 'video/webm';
  }

  const candidates =
    kind === 'audio'
      ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
      : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

  return candidates.find((candidate) => globalThis.MediaRecorder.isTypeSupported(candidate)) ?? '';
}

function getMediaConstraints(kind: RecordingMediaKind): MediaStreamConstraints {
  const audio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  if (kind === 'audio') {
    return { audio };
  }

  return { audio, video: true };
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function createSilentWavBlob(durationMs: number): Blob {
  const sampleRate = 8000;
  const channelCount = 1;
  const bytesPerSample = 2;
  const normalizedDurationMs = Math.max(1000, Math.round(durationMs));
  const sampleCount = Math.max(1, Math.ceil((sampleRate * normalizedDurationMs) / 1000));
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  return new Blob([buffer], { type: 'audio/wav' });
}

export class InteractiveMediaRecorder {
  private readonly fake: boolean;
  private chunks: Blob[] = [];
  private kindValue: RecordingMediaKind | undefined;
  private mediaRecorder: MediaRecorder | undefined;
  private stream: MediaStream | undefined;
  private recordingId: string | undefined;
  private startedAtMs = 0;
  private pausedAtMs = 0;
  private totalPausedMs = 0;
  private statusValue: InteractiveMediaRecorderStatus = 'permission-needed';
  private errorValue: string | undefined;

  constructor({ fake = false }: InteractiveMediaRecorderOptions = {}) {
    this.fake = fake;

    if (!fake && !canUseBrowserMediaRecorder()) {
      this.statusValue = 'unavailable';
    }
  }

  get status(): InteractiveMediaRecorderStatus {
    return this.statusValue;
  }

  get error(): string | undefined {
    return this.errorValue;
  }

  get kind(): RecordingMediaKind | undefined {
    return this.kindValue;
  }

  get startedAt(): number {
    return this.startedAtMs;
  }

  get mediaStream(): MediaStream | undefined {
    return this.stream;
  }

  isAvailable(): boolean {
    return this.fake || canUseBrowserMediaRecorder();
  }

  async prepare(kind: RecordingMediaKind): Promise<void> {
    this.kindValue = kind;
    this.errorValue = undefined;

    if (this.fake) {
      this.statusValue = 'ready';
      return;
    }

    if (!canUseBrowserMediaRecorder()) {
      this.statusValue = 'unavailable';
      this.errorValue = 'Media recording is unavailable in this browser.';
      throw new Error(this.errorValue);
    }

    this.statusValue = 'permission-needed';

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints(kind));
      this.statusValue = 'ready';
    } catch (error) {
      this.statusValue = 'error';
      this.errorValue = error instanceof Error ? error.message : 'Media permission was denied.';
      throw error;
    }
  }

  start({ recordingId, startedAtMs = Date.now() }: StartInteractiveMediaRecorderOptions): void {
    if (!this.kindValue) {
      throw new Error('Media kind must be prepared before recording starts.');
    }

    this.recordingId = recordingId;
    this.startedAtMs = startedAtMs;
    this.pausedAtMs = 0;
    this.totalPausedMs = 0;
    this.chunks = [];

    if (this.fake) {
      this.statusValue = 'recording';
      return;
    }

    if (!this.stream) {
      throw new Error('Media stream must be prepared before recording starts.');
    }

    const mimeType = getSupportedMimeType(this.kindValue);
    const options = mimeType ? { mimeType } : undefined;
    const recorder = new globalThis.MediaRecorder(this.stream, options);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder = recorder;
    recorder.start();
    this.statusValue = 'recording';
  }

  pause(nowMs = Date.now()): boolean {
    if (this.statusValue !== 'recording') {
      return false;
    }

    if (!this.fake && this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.pause();
    }

    this.pausedAtMs = nowMs;
    this.statusValue = 'paused';
    return true;
  }

  resume(nowMs = Date.now()): boolean {
    if (this.statusValue !== 'paused') {
      return false;
    }

    this.totalPausedMs += Math.max(0, nowMs - this.pausedAtMs);
    this.pausedAtMs = 0;

    if (!this.fake && this.mediaRecorder?.state === 'paused') {
      this.mediaRecorder.resume();
    }

    this.statusValue = 'recording';
    return true;
  }

  async stop(): Promise<RecordingMediaAsset | undefined> {
    if (!this.kindValue || !this.recordingId || !['recording', 'paused'].includes(this.statusValue)) {
      this.stopTracks();
      return undefined;
    }

    if (this.fake) {
      const durationMs = Math.max(1000, this.getElapsedMs(Date.now()));
      const asset: RecordingMediaAsset = {
        id: createId('media-asset'),
        recordingId: this.recordingId,
        kind: this.kindValue,
        mimeType: 'audio/wav',
        durationMs,
        createdAt: new Date().toISOString(),
        blob: createSilentWavBlob(durationMs),
      };

      this.statusValue = 'stopped';

      return asset;
    }

    const recorder = this.mediaRecorder;

    if (!recorder) {
      this.stopTracks();
      return undefined;
    }

    const stopped =
      recorder.state === 'inactive'
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            recorder.onstop = () => resolve();
          });

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }

    await stopped;
    const durationMs = Math.max(0, this.getElapsedMs(Date.now()));
    this.stopTracks();
    this.statusValue = 'stopped';

    const fallbackMimeType = this.kindValue === 'audio' ? 'audio/webm' : 'video/webm';
    const mimeType = recorder.mimeType || this.chunks[0]?.type || fallbackMimeType;

    return {
      id: createId('media-asset'),
      recordingId: this.recordingId,
      kind: this.kindValue,
      mimeType,
      durationMs,
      createdAt: new Date().toISOString(),
      blob: new Blob(this.chunks, { type: mimeType }),
    };
  }

  abort(): void {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    } catch {
      // best-effort cleanup for permission or device errors
    }

    this.stopTracks();
    this.statusValue = 'idle';
    this.pausedAtMs = 0;
    this.totalPausedMs = 0;
  }

  private getElapsedMs(nowMs: number): number {
    const effectiveNow = this.statusValue === 'paused' ? this.pausedAtMs : nowMs;
    return Math.max(0, effectiveNow - this.startedAtMs - this.totalPausedMs);
  }

  private stopTracks(): void {
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }

    this.stream = undefined;
  }
}
