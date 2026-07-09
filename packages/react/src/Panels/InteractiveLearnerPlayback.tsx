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
  publishedStatus,
  publishedRecordingId,
  recordingStorageSource,
  publishedRecordings,
  selectedPublishedRecordingId,
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
}: InteractivePocControlsModel) {
  return (
    <section aria-labelledby="interactive-learner-heading" style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h2 id="interactive-learner-heading" style={{ margin: 0 }}>
          Learner playback
        </h2>
        <p style={{ margin: 0 }}>Open a published recording, follow the lesson, then try the code yourself.</p>
      </div>

      <InteractiveRecordingLibrary
        title="Published lessons"
        description="Only published recordings are available to learners."
        emptyText="No published lessons available yet."
        selectLabel="Select learner recording"
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
          Open Recording
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
        <span>Conflict warning: {conflictStatus}</span>
        <span>Conflicted files: {conflictedFiles.length > 0 ? conflictedFiles.join(', ') : 'none'}</span>
      </div>
    </section>
  );
}
