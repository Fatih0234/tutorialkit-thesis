import { InteractiveAuthoringPanel } from './InteractiveAuthoringPanel.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

export function InteractivePocControls(props: InteractivePocControlsModel) {
  const {
    mode,
    playbackStatus,
    playheadMs,
    pausedTeacherTimestampMs,
    learnerDeltaCount,
    learnerDeltaStatus,
    conflictStatus,
    conflictedFiles,
    canPlayRecording,
    canPausePlayback,
    canResumeTeacher,
    canSaveLearnerDelta,
    canRestoreLearnerDelta,
    onPlayRecording,
    onPausePlayback,
    onResumeTeacher,
    onSaveLearnerDelta,
    onRestoreLearnerDelta,
  } = props;

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
      <InteractiveAuthoringPanel {...props} />
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
      <span>Playback status: {playbackStatus}</span>
      <span>Playhead ms: {playheadMs}</span>
      <span>Paused teacher timestamp ms: {pausedTeacherTimestampMs}</span>
      <span>Learner delta count: {learnerDeltaCount}</span>
      <span>Learner delta status: {learnerDeltaStatus}</span>
      <span>Conflict status: {conflictStatus}</span>
      <span>Conflicted files: {conflictedFiles.length > 0 ? conflictedFiles.join(', ') : 'none'}</span>
    </div>
  );
}
