import { InteractiveEditorPlayer } from './InteractiveEditorPlayer.js';
import { InteractiveRecordingLibrary } from './InteractiveRecordingLibrary.js';
import {
  InteractiveButton,
  InteractiveCard,
  InteractiveStatusBadge,
  formatInteractiveTime,
} from './InteractivePocUi.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

export function InteractiveLearnerPlayback(props: InteractivePocControlsModel) {
  const {
    mode,
    playbackStatus,
    pausedTeacherTimestampMs,
    learnerDeltaCount,
    learnerDeltaStatus,
    learnerCheckpoints,
    activeLearnerCheckpointId,
    isLearnerWorkspaceDirty,
    isResumeConfirmationVisible,
    publishedStatus,
    publishedRecordingId,
    recordingStorageSource,
    publishedRecordings,
    selectedPublishedRecordingId,
    currentUser,
    canUseLearnerWork,
    canLoadPublishedRecording,
    canResumeTeacher,
    canSaveLearnerDelta,
    onSelectPublishedRecording,
    onLoadPublishedRecording,
    onPlayRecording,
    onContinuePlayback,
    onPausePlayback,
    onResumeTeacher,
    onSaveLearnerDelta,
    onOpenLearnerCheckpoint,
    onSaveAndResumeTeacher,
    onDiscardAndResumeTeacher,
    onCancelResumeTeacher,
    onPausePreviewPlayback,
  } = props;
  const isLearnerEditing = mode === 'learner-editing';

  return (
    <section aria-labelledby="interactive-learner-heading" className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="interactive-learner-heading" className="m-0 text-base font-600 text-tk-text-primary">
            Learner Lesson
          </h2>
          <p className="m-0 text-xs text-tk-text-secondary">
            Follow the lecture, pause to experiment with its exact editor state, then return to the original timeline.
          </p>
        </div>
        <InteractiveStatusBadge
          tone={canUseLearnerWork ? 'positive' : 'warning'}
          icon={canUseLearnerWork ? 'i-ph-user-check' : 'i-ph-warning'}
        >
          {currentUser ? `${currentUser.displayName} · ${currentUser.role}` : 'Learner sign-in required'}
        </InteractiveStatusBadge>
      </div>

      <InteractiveCard className="grid gap-3">
        <InteractiveRecordingLibrary
          title="Published lessons"
          description="Choose a published lesson to begin."
          emptyText="No published lessons available yet."
          recordings={publishedRecordings}
          actionLabel="Open Lesson"
          actionIcon="i-ph-folder-open"
          onOpenRecording={onLoadPublishedRecording}
        />
      </InteractiveCard>

      <InteractiveEditorPlayer
        audience="learner"
        title={isLearnerEditing ? 'My Experiment' : 'Interactive lesson player'}
        description={
          isLearnerEditing
            ? `Working from the original lecture state at ${formatInteractiveTime(pausedTeacherTimestampMs)}.`
            : 'Playback always follows the teacher recording. Saved dots reopen your experiments.'
        }
        model={props}
        onPlay={playbackStatus === 'paused' ? onContinuePlayback : onPlayRecording}
        onPause={onPausePreviewPlayback}
        onTryItYourself={onPausePlayback}
      />

      <div aria-label="Learner workspace toolbar" className="flex flex-wrap items-center gap-1.5">
        <InteractiveButton icon="i-ph-arrow-counter-clockwise" onClick={onResumeTeacher} disabled={!canResumeTeacher}>
          Resume Lecture
        </InteractiveButton>
        <InteractiveButton variant="primary" icon="i-ph-floppy-disk" onClick={onSaveLearnerDelta} disabled={!canSaveLearnerDelta}>
          Save Experiment
        </InteractiveButton>
        {isLearnerEditing ? (
          <InteractiveStatusBadge tone={isLearnerWorkspaceDirty ? 'warning' : 'positive'}>
            {isLearnerWorkspaceDirty ? 'Unsaved changes' : 'No unsaved changes'}
          </InteractiveStatusBadge>
        ) : null}
      </div>

      {isResumeConfirmationVisible ? (
        <section aria-label="Unsaved experiment warning" role="alert" className="rounded-lg border-2 border-amber-500 bg-amber-950/20 p-3">
          <h3 className="m-0 text-sm font-600 text-amber-100">Save this experiment before resuming?</h3>
          <p className="mb-3 mt-1 text-xs text-amber-100/80">
            Lecture playback will restore the teacher’s original state. Unsaved experiment changes will otherwise be discarded.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <InteractiveButton variant="primary" icon="i-ph-floppy-disk" onClick={onSaveAndResumeTeacher}>
              Save and Resume
            </InteractiveButton>
            <InteractiveButton icon="i-ph-play" onClick={onDiscardAndResumeTeacher}>
              Resume Without Saving
            </InteractiveButton>
            <InteractiveButton variant="ghost" icon="i-ph-x" onClick={onCancelResumeTeacher}>
              Cancel
            </InteractiveButton>
          </div>
        </section>
      ) : null}

      <InteractiveCard aria-label="My experiments" className="grid gap-2 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="flex items-center gap-1.5 text-sm text-tk-text-primary">
            <span aria-hidden="true" className="i-ph-map-pin-duotone text-base text-violet-400" />
            My Experiments
          </strong>
          <div className="flex flex-wrap gap-1">
            <InteractiveStatusBadge tone={learnerDeltaStatus.includes('saved') || learnerDeltaStatus.includes('opened') ? 'positive' : 'neutral'}>
              Work status: {learnerDeltaStatus}
            </InteractiveStatusBadge>
            <InteractiveStatusBadge>Saved work count: {learnerDeltaCount}</InteractiveStatusBadge>
            <InteractiveStatusBadge>{learnerCheckpoints.length} timeline markers</InteractiveStatusBadge>
          </div>
        </div>

        {learnerCheckpoints.length === 0 ? (
          <p className="m-0 text-xs text-tk-text-secondary">
            No saved experiments yet. Pause the lecture, choose Try It Yourself, edit, and save.
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {learnerCheckpoints.map((checkpoint) => (
              <li key={checkpoint.id}>
                <button
                  type="button"
                  onClick={() => onOpenLearnerCheckpoint(checkpoint.id)}
                  disabled={isLearnerEditing}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-tk-border-primary bg-tk-background-primary px-2.5 py-2 text-left hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border-2 border-violet-200 bg-violet-500" />
                    <span className="min-w-0">
                      <strong className="block text-xs text-tk-text-primary">
                        Experiment at {formatInteractiveTime(checkpoint.teacherTimestampMs)}
                      </strong>
                      <span className="block truncate text-[11px] text-tk-text-secondary">
                        {checkpoint.changedFileCount} changed files · {checkpoint.versionCount} saved version
                        {checkpoint.versionCount === 1 ? '' : 's'} · {new Date(checkpoint.createdAt).toLocaleString()}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-violet-300">
                    {checkpoint.id === activeLearnerCheckpointId ? 'Active' : 'Open'}
                    <span aria-hidden="true" className="i-ph-arrow-right" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </InteractiveCard>

    </section>
  );
}
