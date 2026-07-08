import type { InteractivePocControlsModel } from './useInteractivePoc.js';

export function InteractivePocControls({
  isRecording,
  mode,
  playbackStatus,
  eventCount,
  playheadMs,
  pausedTeacherTimestampMs,
  learnerDeltaCount,
  learnerDeltaStatus,
  canStartRecording,
  canStopRecording,
  canPlayRecording,
  canPausePlayback,
  canResumeTeacher,
  canSaveLearnerDelta,
  canRestoreLearnerDelta,
  onStartRecording,
  onStopRecording,
  onPlayRecording,
  onPausePlayback,
  onResumeTeacher,
  onSaveLearnerDelta,
  onRestoreLearnerDelta,
}: InteractivePocControlsModel) {
  return (
    <div
      aria-label="Interactive timeline debug controls"
      style={{
        alignItems: 'center',
        borderBottom: '1px solid var(--tk-elements-panel-borderColor)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        padding: '0.5rem',
      }}
    >
      <button type="button" onClick={onStartRecording} disabled={!canStartRecording}>
        Start Recording
      </button>
      <button type="button" onClick={onStopRecording} disabled={!canStopRecording}>
        Stop Recording
      </button>
      <button type="button" onClick={onPlayRecording} disabled={!canPlayRecording}>
        Play Recording
      </button>
      <button type="button" onClick={onPausePlayback} disabled={!canPausePlayback}>
        Pause & Try It
      </button>
      <button type="button" onClick={onResumeTeacher} disabled={!canResumeTeacher}>
        Resume Teacher
      </button>
      <button type="button" onClick={onSaveLearnerDelta} disabled={!canSaveLearnerDelta}>
        Save Learner Delta
      </button>
      <button type="button" onClick={onRestoreLearnerDelta} disabled={!canRestoreLearnerDelta}>
        Restore Learner Delta
      </button>
      <span>Mode: {mode}</span>
      <span>Recording status: {isRecording ? 'active' : 'inactive'}</span>
      <span>Event count: {eventCount}</span>
      <span>Playback status: {playbackStatus}</span>
      <span>Playhead ms: {playheadMs}</span>
      <span>Paused teacher timestamp ms: {pausedTeacherTimestampMs}</span>
      <span>Learner delta count: {learnerDeltaCount}</span>
      <span>Learner delta status: {learnerDeltaStatus}</span>
    </div>
  );
}
