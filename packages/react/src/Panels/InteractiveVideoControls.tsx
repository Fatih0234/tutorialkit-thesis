import { useEffect, useState } from 'react';
import { classNames } from '../utils/classnames.js';
import { InteractiveButton, InteractiveStatusBadge, formatInteractiveTime } from './InteractivePocUi.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

interface InteractiveVideoControlsProps {
  audience: 'teacher' | 'learner';
  model: InteractivePocControlsModel;
  onPlay: () => void;
  onPause: () => void;
}

export function InteractiveVideoControls({ audience, model, onPlay, onPause }: InteractiveVideoControlsProps) {
  const [experimentsOpen, setExperimentsOpen] = useState(false);
  const durationMs = Math.max(1, model.recordingDurationMs);
  const timelineValueMs = model.recordingDurationMs > 0
    ? Math.min(model.recordingDurationMs, Math.max(0, model.playheadMs))
    : 0;
  const playedPercent = (timelineValueMs / durationMs) * 100;
  const isLearner = audience === 'learner';
  const isExperimenting = model.mode === 'learner-editing';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches('input, textarea, select, [contenteditable="true"], .cm-content');

      if (isTyping) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        if (model.isPlaying) {
          onPause();
        } else if (model.canPlayRecording) {
          onPlay();
        }
      } else if (event.key === 'ArrowLeft' && model.canSeekPlayback) {
        event.preventDefault();
        model.onSeekPlayback(Math.max(0, model.playheadMs - 5000));
      } else if (event.key === 'ArrowRight' && model.canSeekPlayback) {
        event.preventDefault();
        model.onSeekPlayback(Math.min(model.recordingDurationMs, model.playheadMs + 5000));
      } else if (event.key === 'Home' && model.canSeekPlayback) {
        event.preventDefault();
        model.onRestartPlayback();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [model, onPause, onPlay]);

  return (
    <>
      {isLearner && model.isResumeConfirmationVisible ? (
        <section role="alert" aria-label="Unsaved experiment warning" className="shrink-0 border-t border-amber-500/60 bg-amber-950 px-4 py-2 text-amber-50">
          <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-xs"><strong>Unsaved experiment.</strong> Save it before returning to the lecture?</p>
            <div className="flex gap-1.5">
              <InteractiveButton variant="primary" icon="i-ph-floppy-disk" onClick={model.onSaveAndResumeTeacher}>Save and Resume</InteractiveButton>
              <InteractiveButton icon="i-ph-play" onClick={model.onDiscardAndResumeTeacher}>Resume Without Saving</InteractiveButton>
              <InteractiveButton variant="ghost" icon="i-ph-x" onClick={model.onCancelResumeTeacher}>Cancel</InteractiveButton>
            </div>
          </div>
        </section>
      ) : null}

      <footer aria-label="Interactive lesson controls" className="relative z-20 shrink-0 border-t border-tk-border-primary bg-tk-background-primary px-4 pb-3 pt-2 shadow-[0_-8px_30px_rgba(0,0,0,0.18)]">
        <div hidden>
          <span>Draft status: {model.draftStatus}</span>
          <span>Current draft id: {model.currentDraftId}</span>
          <span>Playback status: {model.playbackStatus}</span>
          <span>Mode: {model.mode}</span>
          <span>Playhead ms: {model.playheadMs}</span>
          <span>Published status: {model.publishedStatus}</span>
          <span>Published recording id: {model.publishedRecordingId}</span>
          <span>Work status: {model.learnerDeltaStatus}</span>
          <span>Saved work count: {model.learnerDeltaCount}</span>
          <span>Media status: {model.mediaStatus}</span>
          <span>Media kind: {model.mediaKind}</span>
          <span>Media duration ms: {model.mediaDurationMs}</span>
        </div>
        <div className="mx-auto grid max-w-screen-2xl gap-2">
          <div className="group relative h-5">
            <div className="absolute inset-x-0 top-2 h-1.5 overflow-hidden rounded-full bg-tk-background-active">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${playedPercent}%` }} />
            </div>
            {isLearner ? (
              <div aria-label="My experiment markers" className="pointer-events-none absolute inset-0">
                {model.learnerCheckpoints.map((checkpoint) => {
                  const position = Math.min(99.3, Math.max(0.7, (checkpoint.teacherTimestampMs / durationMs) * 100));
                  const label = `Open my experiment at ${formatInteractiveTime(checkpoint.teacherTimestampMs)}`;
                  return (
                    <button
                      key={checkpoint.id}
                      type="button"
                      aria-label={label}
                      title={`${label} · ${checkpoint.versionCount} saved version${checkpoint.versionCount === 1 ? '' : 's'}`}
                      disabled={isExperimenting}
                      onClick={() => model.onOpenLearnerCheckpoint(checkpoint.id)}
                      className={classNames(
                        'pointer-events-auto absolute top-0 z-10 h-5 w-3 -translate-x-1/2 rounded-full border-2 border-violet-100 bg-violet-500 shadow transition-transform hover:scale-125 disabled:opacity-50',
                        checkpoint.id === model.activeLearnerCheckpointId && 'ring-2 ring-violet-400/40',
                      )}
                      style={{ left: `${position}%` }}
                    />
                  );
                })}
              </div>
            ) : null}
            <input
              type="range"
              aria-label="Lesson timeline"
              min={0}
              max={durationMs}
              step={1}
              value={timelineValueMs}
              disabled={!model.canSeekPlayback}
              onChange={(event) => model.onSeekPlayback(Number(event.currentTarget.value))}
              className="absolute inset-0 h-5 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <InteractiveButton
              variant="primary"
              icon={model.isPlaying ? 'i-ph-pause-fill' : 'i-ph-play-fill'}
              onClick={model.isPlaying ? onPause : onPlay}
              disabled={model.isPlaying ? !model.canPausePlayback : !model.canPlayRecording}
              className="h-10 w-10 justify-center rounded-full p-0"
            >
              <span className="sr-only">{model.isPlaying ? 'Pause' : 'Play'}</span>
            </InteractiveButton>
            <InteractiveButton variant="ghost" icon="i-ph-skip-back-fill" onClick={model.onRestartPlayback} disabled={!model.canSeekPlayback}>
              Restart
            </InteractiveButton>
            <strong className="min-w-28 font-mono text-xs text-tk-text-primary">
              {formatInteractiveTime(model.playheadMs)} / {formatInteractiveTime(model.recordingDurationMs)}
            </strong>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {model.mediaPreviewUrl && model.mediaKind === 'audio' ? (
                <audio aria-label="Recorded audio preview" controls preload="auto" src={model.mediaPreviewUrl} ref={model.onMediaElementRef} className="h-8 w-44" />
              ) : null}
              {isLearner ? (
                <>
                  {isExperimenting ? (
                    <>
                      <InteractiveStatusBadge tone={model.isLearnerWorkspaceDirty ? 'warning' : 'positive'}>
                        {model.isLearnerWorkspaceDirty ? 'Unsaved changes' : 'Experiment saved'}
                      </InteractiveStatusBadge>
                      <InteractiveButton variant="primary" icon="i-ph-floppy-disk" onClick={model.onSaveLearnerDelta} disabled={!model.canSaveLearnerDelta}>Save Experiment</InteractiveButton>
                      <InteractiveButton icon="i-ph-arrow-counter-clockwise" onClick={model.onResumeTeacher} disabled={!model.canResumeTeacher}>Return to Lecture</InteractiveButton>
                    </>
                  ) : (
                    <InteractiveButton icon="i-ph-pencil-simple" onClick={model.onPausePlayback} disabled={!model.canEnterLearnerWorkspace}>Pause and Experiment</InteractiveButton>
                  )}
                  <InteractiveButton variant="ghost" icon="i-ph-map-pin" onClick={() => setExperimentsOpen(true)}>
                    My Experiments ({model.learnerCheckpoints.length})
                  </InteractiveButton>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </footer>

      {isLearner && experimentsOpen ? (
        <aside aria-label="My experiments drawer" className="fixed bottom-0 right-0 top-14 z-[1020] flex w-[min(24rem,90vw)] flex-col border-l border-tk-border-primary bg-tk-background-primary p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-tk-border-primary pb-3">
            <div>
              <h2 className="m-0 text-base font-700 text-tk-text-primary">My Experiments</h2>
              <p className="m-0 text-xs text-tk-text-secondary">Saved branches on this lecture timeline.</p>
            </div>
            <InteractiveButton variant="ghost" icon="i-ph-x" onClick={() => setExperimentsOpen(false)}>Close</InteractiveButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-3">
            {model.learnerCheckpoints.length === 0 ? (
              <p className="text-sm text-tk-text-secondary">No experiments yet. Pause the lecture and edit the workspace to create one.</p>
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {model.learnerCheckpoints.map((checkpoint) => (
                  <li key={checkpoint.id}>
                    <button
                      type="button"
                      disabled={isExperimenting}
                      onClick={() => { model.onOpenLearnerCheckpoint(checkpoint.id); setExperimentsOpen(false); }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-tk-border-primary bg-tk-background-secondary p-3 text-left hover:border-violet-400 disabled:opacity-50"
                    >
                      <span>
                        <strong className="block text-sm text-tk-text-primary">Experiment at {formatInteractiveTime(checkpoint.teacherTimestampMs)}</strong>
                        <span className="text-xs text-tk-text-secondary">{checkpoint.changedFileCount} changed files · {checkpoint.versionCount} saved versions</span>
                      </span>
                      <span className="i-ph-arrow-right text-violet-300" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      ) : null}
    </>
  );
}
