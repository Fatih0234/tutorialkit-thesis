import { classNames } from '../utils/classnames.js';
import {
  InteractiveButton,
  InteractiveCard,
  InteractiveStatusBadge,
  formatInteractiveTime,
} from './InteractivePocUi.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

interface InteractiveEditorPlayerProps {
  audience: 'teacher' | 'learner';
  title: string;
  description: string;
  model: InteractivePocControlsModel;
  onPlay: () => void;
  onPause: () => void;
  onTryItYourself?: () => void;
}

export function InteractiveEditorPlayer({
  audience,
  title,
  description,
  model,
  onPlay,
  onPause,
  onTryItYourself,
}: InteractiveEditorPlayerProps) {
  const {
    isPlaying,
    mode,
    playbackStatus,
    playheadMs,
    recordingDurationMs,
    mediaKind,
    mediaPreviewUrl,
    canPlayRecording,
    canPausePlayback,
    canSeekPlayback,
    canEnterLearnerWorkspace,
    learnerCheckpoints,
    activeLearnerCheckpointId,
    isLearnerWorkspaceDirty,
    onRestartPlayback,
    onSeekPlayback,
    onOpenLearnerCheckpoint,
    onMediaElementRef,
  } = model;
  const isLearnerEditing = mode === 'learner-editing';
  const timelineEndMs = Math.max(1, recordingDurationMs);
  const timelineValueMs = recordingDurationMs > 0 ? Math.min(recordingDurationMs, Math.max(0, playheadMs)) : 0;
  const playLabel = audience === 'learner' ? 'Play Lesson' : 'Play Preview';

  return (
    <InteractiveCard
      aria-label={audience === 'learner' ? 'Lesson player' : 'Recording preview player'}
      className={classNames(
        'relative grid gap-3 overflow-hidden',
        isLearnerEditing ? 'border-blue-500/60 bg-blue-950/15' : '',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={classNames(
              'grid h-10 w-10 shrink-0 place-items-center rounded-full text-xl',
              isPlaying
                ? 'animate-pulse bg-blue-600 text-white'
                : isLearnerEditing
                  ? 'bg-blue-950/50 text-blue-200'
                  : 'bg-tk-background-active text-tk-text-secondary',
            )}
          >
            <span className={isLearnerEditing ? 'i-ph-pencil-simple-duotone' : 'i-ph-play-duotone'} />
          </span>
          <div className="min-w-0">
            <h3 className="m-0 text-sm font-600 text-tk-text-primary">{title}</h3>
            <p className="m-0 text-xs text-tk-text-secondary">{description}</p>
            <div aria-live="polite" role="status" className="mt-1 flex flex-wrap gap-1.5">
              <InteractiveStatusBadge tone={isPlaying ? 'positive' : 'neutral'}>
                Playback status: {playbackStatus}
              </InteractiveStatusBadge>
              <InteractiveStatusBadge tone={isLearnerEditing ? 'info' : 'neutral'}>Mode: {mode}</InteractiveStatusBadge>
              {audience === 'learner' && isLearnerEditing ? (
                <InteractiveStatusBadge tone={isLearnerWorkspaceDirty ? 'warning' : 'positive'}>
                  {isLearnerWorkspaceDirty ? 'Unsaved experiment changes' : 'Experiment saved'}
                </InteractiveStatusBadge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="text-right">
          <strong className="font-mono text-sm text-tk-text-primary">
            {formatInteractiveTime(playheadMs)} / {formatInteractiveTime(recordingDurationMs)}
          </strong>
          <p className="m-0 text-xs text-tk-text-secondary">Interactive editor timeline</p>
        </div>
      </div>

      {mediaPreviewUrl && mediaKind === 'audio' ? (
        <audio
          className="h-9 max-w-full"
          aria-label="Recorded audio preview"
          controls
          preload="auto"
          src={mediaPreviewUrl}
          ref={onMediaElementRef}
        />
      ) : null}
      {mediaPreviewUrl && mediaKind === 'webcam' ? (
        <video
          className="pointer-events-none max-h-36 max-w-56 rounded-md border border-tk-border-primary object-cover"
          aria-label="Recorded webcam preview"
          playsInline
          preload="auto"
          src={mediaPreviewUrl}
          ref={onMediaElementRef}
        />
      ) : null}

      <div className="grid gap-1">
        <div className="relative pt-3">
          <input
            aria-label="Editor playback timeline"
            type="range"
            min={0}
            max={timelineEndMs}
            step={1}
            value={timelineValueMs}
            disabled={!canSeekPlayback}
            onChange={(event) => onSeekPlayback(Number(event.currentTarget.value))}
            className="w-full cursor-pointer accent-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {audience === 'learner' ? (
            <div aria-label="My experiment markers" className="pointer-events-none absolute inset-x-0 top-0 h-4">
              {learnerCheckpoints.map((checkpoint) => {
                const markerPosition = Math.min(100, Math.max(0, (checkpoint.teacherTimestampMs / timelineEndMs) * 100));
                const isActive = checkpoint.id === activeLearnerCheckpointId;
                const markerLabel = `Open my experiment at ${formatInteractiveTime(checkpoint.teacherTimestampMs)}`;

                return (
                  <button
                    key={checkpoint.id}
                    type="button"
                    aria-label={markerLabel}
                    title={`${markerLabel} · ${checkpoint.changedFileCount} changed files · ${checkpoint.versionCount} saved version${checkpoint.versionCount === 1 ? '' : 's'}`}
                    disabled={isLearnerEditing}
                    onClick={() => onOpenLearnerCheckpoint(checkpoint.id)}
                    className={classNames(
                      'pointer-events-auto absolute top-0 h-3 w-3 -translate-x-1/2 rounded-full border-2 shadow-sm transition-transform hover:scale-125 disabled:cursor-not-allowed disabled:opacity-60',
                      isActive ? 'border-violet-100 bg-violet-400 ring-2 ring-violet-400/30' : 'border-violet-200 bg-violet-500',
                    )}
                    style={{ left: `${markerPosition}%` }}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between font-mono text-[11px] text-tk-text-secondary">
          <span>00:00</span>
          <span>
            Playhead ms: {playheadMs}
            {audience === 'learner' ? ` · ${learnerCheckpoints.length} saved experiment markers` : ''}
          </span>
          <span>{formatInteractiveTime(recordingDurationMs)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <InteractiveButton variant="primary" icon="i-ph-play-fill" onClick={onPlay} disabled={!canPlayRecording}>
          {playLabel}
        </InteractiveButton>
        <InteractiveButton icon="i-ph-pause-fill" onClick={onPause} disabled={!canPausePlayback}>
          Pause
        </InteractiveButton>
        <InteractiveButton icon="i-ph-skip-back-fill" onClick={onRestartPlayback} disabled={!canSeekPlayback && !canPausePlayback}>
          Restart
        </InteractiveButton>
        {onTryItYourself ? (
          <InteractiveButton icon="i-ph-pencil-simple" onClick={onTryItYourself} disabled={!canEnterLearnerWorkspace}>
            Try It Yourself
          </InteractiveButton>
        ) : null}
      </div>
    </InteractiveCard>
  );
}
