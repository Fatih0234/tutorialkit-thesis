import { InteractiveEditorPlayer } from './InteractiveEditorPlayer.js';
import { InteractiveRecordingLibrary } from './InteractiveRecordingLibrary.js';
import {
  InteractiveButton,
  InteractiveCard,
  InteractiveStatusBadge,
  interactiveDetailsClassName,
  interactiveSummaryClassName,
} from './InteractivePocUi.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

export function InteractiveLearnerPlayback(props: InteractivePocControlsModel) {
  const {
    mode,
    playbackStatus,
    pausedTeacherTimestampMs,
    learnerDeltaCount,
    learnerDeltaStatus,
    conflictStatus,
    conflictedFiles,
    conflictDetails,
    isConflictResolutionVisible,
    areConflictDetailsVisible,
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
    canRestoreLearnerDelta,
    onSelectPublishedRecording,
    onLoadPublishedRecording,
    onPlayRecording,
    onContinuePlayback,
    onPausePlayback,
    onResumeTeacher,
    onSaveLearnerDelta,
    onRestoreLearnerDelta,
    onRestoreLearnerDeltaAnyway,
    onKeepTeacherVersion,
    onViewConflictDetails,
    onCancelConflictResolution,
    onPausePreviewPlayback,
  } = props;
  const hasConflicts = conflictStatus === 'conflict';
  const isLearnerEditing = mode === 'learner-editing';
  return (
    <section aria-labelledby="interactive-learner-heading" className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="interactive-learner-heading" className="m-0 text-base font-600 text-tk-text-primary">
            Learner Lesson
          </h2>
          <p className="m-0 text-xs text-tk-text-secondary">Follow the teacher recording, pause, and make the workspace your own.</p>
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
          compact
          title="Published lessons"
          description="Choose a published lesson to begin."
          emptyText="No published lessons available yet. Ask a teacher to publish or seed the demo."
          selectLabel="Select published lesson"
          recordings={publishedRecordings}
          selectedRecordingId={selectedPublishedRecordingId}
          onSelectRecording={onSelectPublishedRecording}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <InteractiveButton
            variant="primary"
            icon="i-ph-folder-open"
            onClick={() => onLoadPublishedRecording(selectedPublishedRecordingId)}
            disabled={!canLoadPublishedRecording}
          >
            Open Published Lesson
          </InteractiveButton>
          <span className="min-w-0 truncate text-xs text-tk-text-secondary" title={publishedRecordingId}>
            Published status: {publishedStatus} · Published recording id: {publishedRecordingId}
          </span>
        </div>
      </InteractiveCard>

      <InteractiveEditorPlayer
        audience="learner"
        title={isLearnerEditing ? 'Your workspace is active' : 'Interactive lesson player'}
        description="The editor is the playback surface: pause or seek without converting the lesson into video."
        model={props}
        onPlay={playbackStatus === 'paused' ? onContinuePlayback : onPlayRecording}
        onPause={onPausePreviewPlayback}
        onTryItYourself={onPausePlayback}
      />

      <div aria-label="Learner workspace toolbar" className="flex flex-wrap gap-1.5">
        <InteractiveButton icon="i-ph-arrow-counter-clockwise" onClick={onResumeTeacher} disabled={!canResumeTeacher}>
          Resume Teacher
        </InteractiveButton>
        <InteractiveButton icon="i-ph-floppy-disk" onClick={onSaveLearnerDelta} disabled={!canSaveLearnerDelta}>
          Save My Work
        </InteractiveButton>
        <InteractiveButton icon="i-ph-clock-counter-clockwise" onClick={onRestoreLearnerDelta} disabled={!canRestoreLearnerDelta}>
          Restore My Work
        </InteractiveButton>
      </div>

      <InteractiveCard aria-label="My work status" className="grid gap-2 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="flex items-center gap-1.5 text-sm text-tk-text-primary">
            <span aria-hidden="true" className="i-ph-files-duotone text-base text-tk-text-accent" />
            My Work
          </strong>
          <div className="flex flex-wrap gap-1">
            <InteractiveStatusBadge tone={learnerDeltaStatus === 'saved' || learnerDeltaStatus.startsWith('restored') ? 'positive' : 'neutral'}>
              Work status: {learnerDeltaStatus}
            </InteractiveStatusBadge>
            <InteractiveStatusBadge>Saved work count: {learnerDeltaCount}</InteractiveStatusBadge>
            <InteractiveStatusBadge tone={hasConflicts ? 'warning' : 'positive'}>
              Conflict Warning: {conflictStatus}
            </InteractiveStatusBadge>
          </div>
        </div>
        <p className="m-0 text-xs text-tk-text-secondary">
          Conflicted files: {conflictedFiles.length > 0 ? conflictedFiles.join(', ') : 'none'}
        </p>
      </InteractiveCard>

      {hasConflicts ? (
        <section
          aria-label="Conflict Warning"
          role="alert"
          className="rounded-lg border border-amber-500/60 bg-amber-950/20 p-3"
        >
          <div className="flex gap-2">
            <span aria-hidden="true" className="i-ph-warning-duotone mt-0.5 shrink-0 text-xl text-amber-300" />
            <div>
              <h3 className="m-0 text-sm font-600 text-amber-100">Conflict Warning</h3>
              <p className="mb-1 mt-0 text-xs text-amber-100/80">
                Your saved work touches files the teacher changed later. Nothing will be overwritten until you choose.
              </p>
              <ul aria-label="Conflicted files" className="m-0 pl-5 text-xs text-amber-100">
                {conflictedFiles.map((filePath) => (
                  <li key={filePath}>{filePath}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {isConflictResolutionVisible ? (
        <section
          aria-label="Conflict resolution"
          className="rounded-lg border-2 border-amber-500 bg-tk-background-secondary p-3 shadow-lg"
        >
          <div className="flex gap-2">
            <span aria-hidden="true" className="i-ph-git-diff-duotone mt-0.5 shrink-0 text-2xl text-amber-300" />
            <div className="min-w-0 flex-1">
              <h3 className="m-0 text-base font-600 text-tk-text-primary">Conflict Resolution</h3>
              <p className="mb-3 mt-1 text-xs text-tk-text-secondary">
                Choose how to handle your saved work. No automatic merge will run, and both source artifacts remain unchanged.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <InteractiveButton variant="primary" icon="i-ph-arrow-counter-clockwise" onClick={onRestoreLearnerDeltaAnyway}>
                  Restore My Work Anyway
                </InteractiveButton>
                <InteractiveButton icon="i-ph-chalkboard-teacher" onClick={onKeepTeacherVersion}>
                  Keep Teacher Version
                </InteractiveButton>
                <InteractiveButton icon="i-ph-list-magnifying-glass" onClick={onViewConflictDetails}>
                  View Conflict Details
                </InteractiveButton>
                <InteractiveButton variant="ghost" icon="i-ph-x" onClick={onCancelConflictResolution}>
                  Cancel
                </InteractiveButton>
              </div>
              {areConflictDetailsVisible ? (
                <div aria-label="Conflict details" className="mt-3 rounded-md border border-tk-border-primary bg-tk-background-primary p-2">
                  <h4 className="m-0 text-sm font-600 text-tk-text-primary">Conflict details</h4>
                  <ul className="mb-0 mt-2 grid gap-2 pl-5 text-xs text-tk-text-secondary">
                    {conflictDetails.map((detail) => (
                      <li key={`${detail.filePath}-${detail.teacherEventId}-${detail.teacherEventTimestampMs}`}>
                        <strong className="text-tk-text-primary">{detail.filePath}</strong>: learner changed file:{' '}
                        {detail.learnerChangedFile ? 'yes' : 'no'}; teacher changed same file after learner timestamp:{' '}
                        {detail.teacherChangedSameFileAfterLearnerTimestamp ? 'yes' : 'no'}; teacher event timestamp ms:{' '}
                        {detail.teacherEventTimestampMs}; teacher event id: {detail.teacherEventId}; teacher event seq:{' '}
                        {detail.teacherEventSeq ?? 'none'}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <details className={interactiveDetailsClassName}>
        <summary className={interactiveSummaryClassName}>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="i-ph-code-duotone text-base" />
            Technical status
          </span>
          <span aria-hidden="true" className="i-ph-caret-down-bold transition-transform group-open:rotate-180" />
        </summary>
        <dl className="mb-0 mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-tk-border-primary pt-3 text-xs text-tk-text-secondary">
          <dt>Paused teacher timestamp ms</dt>
          <dd className="m-0">{pausedTeacherTimestampMs}</dd>
          <dt>Recording storage source</dt>
          <dd className="m-0">{recordingStorageSource}</dd>
          <dt>Work identity</dt>
          <dd className="m-0">{canUseLearnerWork ? 'learner allowed' : 'learner sign-in required'}</dd>
        </dl>
      </details>
    </section>
  );
}
