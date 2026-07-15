export interface TimelinePlaybackClockOptions {
  endTimeMs: number;
  onTick: (currentTimeMs: number) => void;
  onFinish: () => void;
  now?: () => number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (frameId: number) => void;
}

function getDefaultNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function requestDefaultFrame(callback: FrameRequestCallback): number {
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    throw new Error('TimelinePlaybackClock requires requestAnimationFrame.');
  }

  return globalThis.requestAnimationFrame(callback);
}

function cancelDefaultFrame(frameId: number): void {
  globalThis.cancelAnimationFrame?.(frameId);
}

function normalizeTimelineTimeMs(timeMs: number, endTimeMs: number): number {
  return Math.max(0, Math.min(Math.max(0, Math.round(endTimeMs)), Math.round(timeMs)));
}

export class TimelinePlaybackClock {
  private readonly endTimeMs: number;
  private readonly now: () => number;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly cancelFrame: (frameId: number) => void;
  private readonly onTick: (currentTimeMs: number) => void;
  private readonly onFinish: () => void;
  private frameId: number | undefined;
  private playing = false;
  private startedAtClockMs = 0;
  private startedAtTimelineMs = 0;
  private currentTimeMsValue = 0;

  constructor({
    endTimeMs,
    onTick,
    onFinish,
    now = getDefaultNowMs,
    requestFrame = requestDefaultFrame,
    cancelFrame = cancelDefaultFrame,
  }: TimelinePlaybackClockOptions) {
    this.endTimeMs = Math.max(0, Math.round(endTimeMs));
    this.onTick = onTick;
    this.onFinish = onFinish;
    this.now = now;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
  }

  get currentTimeMs(): number {
    if (!this.playing) {
      return this.currentTimeMsValue;
    }

    return this.computeCurrentTimeMs();
  }

  playFrom(startMs: number): void {
    this.cancelPendingFrame();
    this.startedAtTimelineMs = normalizeTimelineTimeMs(startMs, this.endTimeMs);
    this.currentTimeMsValue = this.startedAtTimelineMs;
    this.startedAtClockMs = this.now();
    this.playing = true;

    this.onTick(this.currentTimeMsValue);

    if (this.currentTimeMsValue >= this.endTimeMs) {
      this.finish();
      return;
    }

    this.queueNextFrame();
  }

  pause(): void {
    if (!this.playing) {
      return;
    }

    this.currentTimeMsValue = this.computeCurrentTimeMs();
    this.playing = false;
    this.cancelPendingFrame();
    this.onTick(this.currentTimeMsValue);
  }

  stop(): void {
    if (this.playing) {
      this.currentTimeMsValue = this.computeCurrentTimeMs();
    }

    this.playing = false;
    this.cancelPendingFrame();
  }

  private computeCurrentTimeMs(): number {
    return normalizeTimelineTimeMs(this.startedAtTimelineMs + this.now() - this.startedAtClockMs, this.endTimeMs);
  }

  private queueNextFrame(): void {
    this.frameId = this.requestFrame(this.handleFrame);
  }

  private cancelPendingFrame(): void {
    if (this.frameId === undefined) {
      return;
    }

    this.cancelFrame(this.frameId);
    this.frameId = undefined;
  }

  private readonly handleFrame = (): void => {
    this.frameId = undefined;

    if (!this.playing) {
      return;
    }

    this.currentTimeMsValue = this.computeCurrentTimeMs();
    this.onTick(this.currentTimeMsValue);

    if (this.currentTimeMsValue >= this.endTimeMs) {
      this.finish();
      return;
    }

    this.queueNextFrame();
  };

  private finish(): void {
    this.playing = false;
    this.cancelPendingFrame();
    this.currentTimeMsValue = this.endTimeMs;
    this.onFinish();
  }
}
