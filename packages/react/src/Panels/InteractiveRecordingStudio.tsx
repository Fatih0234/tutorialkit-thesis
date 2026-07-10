import { useEffect, useRef, useState } from 'react';
import { classNames } from '../utils/classnames.js';
import { InteractiveButton, InteractiveStatusBadge, formatInteractiveTime } from './InteractivePocUi.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

interface InteractiveRecordingStudioProps {
  model: InteractivePocControlsModel;
  lessonId: string;
  initialFile: string;
  onStop: () => void;
}

function useRecordingElapsedTime(active: boolean) {
  const startedAtRef = useRef(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active) {
      startedAtRef.current = 0;
      setElapsedMs(0);
      return undefined;
    }

    startedAtRef.current = Date.now();
    const update = () => setElapsedMs(Date.now() - startedAtRef.current);
    update();
    const intervalId = window.setInterval(update, 250);

    return () => window.clearInterval(intervalId);
  }, [active]);

  return elapsedMs;
}

function LiveCameraPreview({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.srcObject = stream;
    void video.play().catch(() => undefined);

    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      aria-label="Live camera preview"
      className="h-20 w-28 rounded-md border border-red-400/50 bg-black object-cover shadow-lg"
      autoPlay
      muted
      playsInline
    />
  );
}

export function InteractiveRecordingStudio({ model, lessonId, initialFile, onStop }: InteractiveRecordingStudioProps) {
  const elapsedMs = useRecordingElapsedTime(model.isRecording);

  return (
    <header
      role="region"
      aria-label="Recording studio controls"
      className="shrink-0 border-b border-red-500/60 bg-red-950 px-4 py-3 text-red-50 shadow-lg"
    >
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-red-600 text-xl text-white">
            <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-30" />
            <span className="i-ph-record-fill relative" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-base font-700 text-white">Recording in progress</h1>
              <InteractiveStatusBadge tone="negative">Recording status: active</InteractiveStatusBadge>
            </div>
            <p className="m-0 truncate text-xs text-red-100/80">
              {lessonId} · Initial file: {initialFile || 'automatic'}
            </p>
            <div aria-live="polite" role="status" className="mt-1 flex flex-wrap gap-x-3 text-xs text-red-100/90">
              <strong className="font-mono text-sm">Elapsed: {formatInteractiveTime(elapsedMs)}</strong>
              <span>Event count: {model.eventCount}</span>
              <span>Draft status: {model.draftStatus}</span>
              <span>Media kind: {model.mediaKind}</span>
              <span>Media status: {model.mediaStatus}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {model.mediaKind === 'webcam' && model.liveMediaStream ? <LiveCameraPreview stream={model.liveMediaStream} /> : null}
          <InteractiveButton
            variant="danger"
            icon="i-ph-stop-fill"
            onClick={onStop}
            disabled={!model.canStopRecording}
            className={classNames('min-h-10 border-white/30 bg-red-600 px-4 text-sm font-700', 'hover:bg-red-500')}
          >
            Stop Recording
          </InteractiveButton>
        </div>
      </div>
    </header>
  );
}
