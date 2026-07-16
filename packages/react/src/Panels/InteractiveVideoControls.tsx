import { useEffect, useMemo, useRef, useState } from 'react';
import { InteractiveHistoryTimeline } from './InteractiveHistoryTimeline.js';
import { buildLearnerTimelineGroups, getLatestLearnerGraphSelection, type LearnerTimelineGroup } from './interactive/history/learner-history-graph.js';
import { countCheckpoints, countDrafts, getWorkGroupUpdatedAt, MyWorkSessionCard } from './interactive/history/MyWorkSessionCard.js';
import { InteractiveButton, InteractiveStatusBadge, formatInteractiveTime } from './InteractivePocUi.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

interface InteractiveVideoControlsProps {
  audience: 'teacher' | 'learner';
  model: InteractivePocControlsModel;
  onPlay: () => void;
  onPause: () => void;
}

export function InteractiveVideoControls({ audience, model, onPlay, onPause }: InteractiveVideoControlsProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const closeHistoryButtonRef = useRef<HTMLButtonElement>(null);
  const isLearner = audience === 'learner';
  const isLearnerWorkspace = model.workspaceOwner === 'learner';
  const workGroups = useMemo(
    () => buildLearnerTimelineGroups(model.learnerBranchTimelineSummaries),
    [model.learnerBranchTimelineSummaries],
  );
  const sortedWorkGroups = useMemo(
    () => [...workGroups].sort((a, b) => getWorkGroupUpdatedAt(b).localeCompare(getWorkGroupUpdatedAt(a))),
    [workGroups],
  );
  const workItemCount = workGroups.length + model.learnerCheckpoints.length;

  useEffect(() => {
    if (historyOpen) closeHistoryButtonRef.current?.focus();
  }, [historyOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches('input, textarea, select, [contenteditable="true"], .cm-content');

      if (event.key === 'Escape' && historyOpen) {
        event.preventDefault();
        setHistoryOpen(false);
        historyButtonRef.current?.focus();
        return;
      }

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

  function openWorkGroup(group: LearnerTimelineGroup) {
    const latest = getLatestLearnerGraphSelection(group);
    if (!latest) return;
    model.onSelectLearnerGraphNode(latest.branchId, latest.kind, latest.commitId);
    setHistoryOpen(false);
    window.setTimeout(() => historyButtonRef.current?.focus(), 0);
  }

  return (
    <>
      <footer aria-label="Interactive lesson controls" className="relative z-20 shrink-0 border-t border-tk-border-primary bg-tk-background-primary px-4 pb-3 pt-2 shadow-[0_-8px_30px_rgba(0,0,0,0.18)]">
        <div hidden>
          <span>Draft status: {model.draftStatus}</span>
          <span>Current draft id: {model.currentDraftId}</span>
          <span>Playback status: {model.playbackStatus}</span>
          <span>Mode: {model.mode}</span>
          <span>Playhead ms: {model.playheadMs}</span>
          <span>Origin event seq: {model.pausedTeacherEventSeq}</span>
          <span>Active learner branch id: {model.activeLearnerBranchId}</span>
          <span>Learner branch count: {model.learnerBranches.length}</span>
          <span>Learner commit count: {model.learnerCommitCount}</span>
          <span>Learner history status: {model.learnerHistoryStatus}</span>
          <span>Learner remote sync status: {model.learnerRemoteSyncStatus}</span>
          <span>Learner history view mode: {model.learnerHistoryViewMode}</span>
          <span>Selected learner event seq: {model.selectedLearnerEventSeq ?? -1}</span>
          <span>Selected learner commit id: {model.selectedLearnerCommitId ?? 'none'}</span>
          <span>Last learner commit name: {model.lastLearnerCommitName}</span>
          <span>Published status: {model.publishedStatus}</span>
          <span>Published recording id: {model.publishedRecordingId}</span>
          <span>Work status: {model.learnerDeltaStatus}</span>
          <span>Saved work count: {model.learnerDeltaCount}</span>
          <span>Media status: {model.mediaStatus}</span>
          <span>Media kind: {model.mediaKind}</span>
          <span>Media duration ms: {model.mediaDurationMs}</span>
        </div>
        <div className="mx-auto grid max-w-screen-2xl gap-2">
          <InteractiveHistoryTimeline model={model} isLearner={isLearner} />

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
            {isLearner ? (
              <>
                <InteractiveStatusBadge tone={isLearnerWorkspace ? 'warning' : 'info'}>
                  {model.learnerHistoryViewMode === 'historical'
                    ? 'Viewing earlier version'
                    : isLearnerWorkspace
                      ? 'My workspace'
                      : 'Following teacher'}
                </InteractiveStatusBadge>
                <span aria-label="Cursor legend" className="flex items-center gap-2 text-xs text-tk-text-secondary">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />Instructor</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" aria-hidden="true" />You</span>
                </span>
              </>
            ) : null}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {model.mediaPreviewUrl && model.mediaKind === 'audio' ? (
                <audio aria-label="Recorded audio preview" controls preload="auto" src={model.mediaPreviewUrl} ref={model.onMediaElementRef} className="h-8 w-44" />
              ) : null}
              {isLearner ? (
                <>
                  {isLearnerWorkspace ? (
                    <>
                      <InteractiveStatusBadge tone={model.isLearnerWorkspaceDirty ? 'warning' : 'positive'}>
                        {model.isLearnerWorkspaceDirty ? 'Unsaved changes' : 'Workspace saved'}
                      </InteractiveStatusBadge>
                      <span aria-live="polite" aria-atomic="true" className="text-xs text-tk-text-secondary">
                        {model.learnerHistoryStatus} · {model.learnerRemoteSyncStatus}
                      </span>
                      <span className="text-xs text-tk-text-secondary">Ctrl/Cmd+S creates a checkpoint · Play resumes the lesson</span>
                    </>
                  ) : (
                    <span className="text-xs text-tk-text-secondary">Edit code to pause automatically and create your branch</span>
                  )}
                  <InteractiveButton ref={historyButtonRef} variant="ghost" icon="i-ph-folder-open" onClick={() => setHistoryOpen(true)}>
                    My Work ({workItemCount})
                  </InteractiveButton>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </footer>

      {isLearner && historyOpen ? (
        <aside role="dialog" aria-modal="true" aria-labelledby="learner-work-title" className="fixed bottom-0 right-0 top-14 z-[1020] flex w-[min(27rem,94vw)] flex-col border-l border-tk-border-primary bg-tk-background-primary p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-tk-border-primary pb-3">
            <div>
              <h2 id="learner-work-title" className="m-0 text-base font-700 text-tk-text-primary">My Work</h2>
              <p className="m-0 mt-1 text-xs text-tk-text-secondary">Your drafts are autosaved. Ctrl/Cmd+S creates a checkpoint.</p>
              <p className="m-0 mt-2 text-xs font-medium text-tk-text-primary">
                {workGroups.length} work session{workGroups.length === 1 ? '' : 's'} · {countCheckpoints(workGroups)} checkpoint{countCheckpoints(workGroups) === 1 ? '' : 's'} · {countDrafts(workGroups)} autosaved draft{countDrafts(workGroups) === 1 ? '' : 's'}
              </p>
            </div>
            <InteractiveButton ref={closeHistoryButtonRef} variant="ghost" icon="i-ph-x" onClick={() => { setHistoryOpen(false); historyButtonRef.current?.focus(); }}>Close</InteractiveButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-3">
            {model.learnerRemoteSyncStatus.includes('offline') || model.learnerRemoteSyncStatus.includes('failed') ? (
              <p role="status" className="mb-3 rounded border border-amber-500/40 bg-amber-950/20 p-2 text-xs text-amber-200">
                Your work is saved on this device. Remote sync will retry automatically.
              </p>
            ) : null}
            {workItemCount === 0 ? (
              <div className="rounded-lg border border-dashed border-tk-border-primary p-5 text-center">
                <span className="i-ph-pencil-simple-line mb-2 inline-block text-2xl text-orange-300" aria-hidden="true" />
                <p className="m-0 text-sm font-medium text-tk-text-primary">No work yet</p>
                <p className="m-0 mt-1 text-xs text-tk-text-secondary">Edit a file during the lesson to create your first autosaved work session.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {sortedWorkGroups.map((group) => (
                  <MyWorkSessionCard
                    key={group.key}
                    group={group}
                    current={model.workspaceOwner === 'learner' && group.branches.some((branch) => branch.branchId === model.activeLearnerBranchId)}
                    onOpen={() => openWorkGroup(group)}
                  />
                ))}
                {model.learnerCheckpoints.map((checkpoint) => (
                  <article key={checkpoint.id} className="rounded-lg border border-tk-border-primary bg-tk-background-secondary p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <strong className="block text-sm text-tk-text-primary">Imported checkpoint</strong>
                        <span className="text-xs text-tk-text-secondary">Started at lesson {formatInteractiveTime(checkpoint.teacherTimestampMs)}</span>
                      </div>
                      <span className="rounded-full bg-violet-500/15 px-2 py-1 text-[0.65rem] font-medium text-violet-200">Legacy</span>
                    </div>
                    <p className="my-2 text-xs text-tk-text-secondary">{checkpoint.changedFileCount} changed file{checkpoint.changedFileCount === 1 ? '' : 's'} · {checkpoint.versionCount} saved version{checkpoint.versionCount === 1 ? '' : 's'}</p>
                    <button type="button" onClick={() => { model.onOpenLearnerCheckpoint(checkpoint.id); setHistoryOpen(false); historyButtonRef.current?.focus(); }} className="w-full rounded bg-violet-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                      Open work
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </aside>
      ) : null}
    </>
  );
}
