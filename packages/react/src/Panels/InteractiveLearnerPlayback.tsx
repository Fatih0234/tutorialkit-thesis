import { InteractiveRecordingLibrary } from './InteractiveRecordingLibrary.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

export function InteractiveLearnerPlayback({
  mode,
  playbackStatus,
  playheadMs,
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
  canPlayRecording,
  canPausePlayback,
  canResumeTeacher,
  canSaveLearnerDelta,
  canRestoreLearnerDelta,
  onSelectPublishedRecording,
  onLoadPublishedRecording,
  onPlayRecording,
  onPausePlayback,
  onResumeTeacher,
  onSaveLearnerDelta,
  onRestoreLearnerDelta,
  onRestoreLearnerDeltaAnyway,
  onKeepTeacherVersion,
  onViewConflictDetails,
  onCancelConflictResolution,
}: InteractivePocControlsModel) {
  const hasConflicts = conflictStatus === 'conflict';

  return (
    <section aria-labelledby="interactive-learner-heading" style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h2 id="interactive-learner-heading" style={{ margin: 0 }}>
          Learner Lesson
        </h2>
        <p style={{ margin: 0 }}>Open a published lesson, follow the recording, then try the code yourself.</p>
        <p style={{ margin: 0 }}>
          Signed-in learner: {currentUser ? `${currentUser.displayName} (${currentUser.role})` : 'signed out'}
        </p>
      </div>

      <InteractiveRecordingLibrary
        title="Published lessons"
        description="Only published lessons are available to learners."
        emptyText="No published lessons available yet."
        selectLabel="Select published lesson"
        recordings={publishedRecordings}
        selectedRecordingId={selectedPublishedRecordingId}
        onSelectRecording={onSelectPublishedRecording}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => onLoadPublishedRecording(selectedPublishedRecordingId)}
          disabled={!canLoadPublishedRecording}
        >
          Open Published Lesson
        </button>
        <button type="button" onClick={onPlayRecording} disabled={!canPlayRecording}>
          Play Lesson
        </button>
        <button type="button" onClick={onPausePlayback} disabled={!canPausePlayback}>
          Try It Yourself
        </button>
        <button type="button" onClick={onResumeTeacher} disabled={!canResumeTeacher}>
          Resume Teacher
        </button>
        <button type="button" onClick={onSaveLearnerDelta} disabled={!canSaveLearnerDelta}>
          Save My Work
        </button>
        <button type="button" onClick={onRestoreLearnerDelta} disabled={!canRestoreLearnerDelta}>
          Restore My Work
        </button>
      </div>

      <div aria-live="polite" role="status" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <span>Published status: {publishedStatus}</span>
        <span>Published recording id: {publishedRecordingId}</span>
        <span>Recording storage source: {recordingStorageSource}</span>
        <span>Mode: {mode}</span>
        <span>Playback status: {playbackStatus}</span>
        <span>Playhead ms: {playheadMs}</span>
        <span>Paused teacher timestamp ms: {pausedTeacherTimestampMs}</span>
        <span>Saved work count: {learnerDeltaCount}</span>
        <span>Work status: {learnerDeltaStatus}</span>
        <span>Conflict Warning: {conflictStatus}</span>
        <span>Conflicted files: {conflictedFiles.length > 0 ? conflictedFiles.join(', ') : 'none'}</span>
        <span>Work identity: {canUseLearnerWork ? 'learner allowed' : 'learner sign-in required'}</span>
      </div>

      {hasConflicts ? (
        <section aria-label="Conflict Warning" role="alert" style={{ border: '1px solid #f59e0b', padding: '0.75rem' }}>
          <p style={{ marginTop: 0 }}>Conflict Warning: your saved work touches files the teacher changed later.</p>
          <ul aria-label="Conflicted files">
            {conflictedFiles.map((filePath) => (
              <li key={filePath}>{filePath}</li>
            ))}
          </ul>
        </section>
      ) : undefined}

      {isConflictResolutionVisible ? (
        <section aria-label="Conflict resolution" style={{ border: '1px solid #f59e0b', padding: '0.75rem' }}>
          <h3 style={{ marginTop: 0 }}>Conflict Resolution</h3>
          <p>Choose how to handle saved work that touches teacher-updated files. No automatic merge will run.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" onClick={onRestoreLearnerDeltaAnyway}>
              Restore My Work Anyway
            </button>
            <button type="button" onClick={onKeepTeacherVersion}>
              Keep Teacher Version
            </button>
            <button type="button" onClick={onViewConflictDetails}>
              View Conflict Details
            </button>
            <button type="button" onClick={onCancelConflictResolution}>
              Cancel
            </button>
          </div>
          {areConflictDetailsVisible ? (
            <div aria-label="Conflict details">
              <h4>Conflict details</h4>
              <ul>
                {conflictDetails.map((detail) => (
                  <li key={`${detail.filePath}-${detail.teacherEventId}-${detail.teacherEventTimestampMs}`}>
                    <strong>{detail.filePath}</strong>: learner changed file:{' '}
                    {detail.learnerChangedFile ? 'yes' : 'no'}; teacher changed same file after learner timestamp:{' '}
                    {detail.teacherChangedSameFileAfterLearnerTimestamp ? 'yes' : 'no'}; teacher event timestamp ms:{' '}
                    {detail.teacherEventTimestampMs}; teacher event id: {detail.teacherEventId}; teacher event seq:{' '}
                    {detail.teacherEventSeq ?? 'none'}
                  </li>
                ))}
              </ul>
            </div>
          ) : undefined}
        </section>
      ) : undefined}
    </section>
  );
}
