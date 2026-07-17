import { describe, expect, it } from 'vitest';
import {
  initialInteractiveExperienceState,
  interactiveExperienceReducer,
  isImmersiveInteractiveScreen,
} from './interactive-session.js';

describe('interactive experience session', () => {
  it('separates selected learner recordings from active player recordings', () => {
    const selected = interactiveExperienceReducer(initialInteractiveExperienceState, {
      type: 'SELECT_LEARNER_RECORDING',
      recordingId: 'recording-1',
    });

    expect(selected).toEqual({ screen: 'teacher-dashboard', selectedRecordingId: 'recording-1' });
    expect(selected.activeRecordingId).toBeUndefined();

    const active = interactiveExperienceReducer(selected, {
      type: 'OPEN_LEARNER_RECORDING',
      recordingId: 'recording-1',
    });

    expect(active.screen).toBe('learner-player');
    expect(active.activeRecordingId).toBe('recording-1');
  });

  it('keeps prepared exercise authoring separate from recording', () => {
    const recording = interactiveExperienceReducer(initialInteractiveExperienceState, { type: 'START_RECORDING' });
    const authoring = interactiveExperienceReducer(initialInteractiveExperienceState, { type: 'AUTHOR_EXERCISE' });

    expect(recording.screen).toBe('teacher-recording');
    expect(authoring.screen).toBe('teacher-exercise-authoring');
    expect(isImmersiveInteractiveScreen(authoring.screen)).toBe(true);
  });

  it('returns from immersive screens to isolated management screens', () => {
    const review = interactiveExperienceReducer(initialInteractiveExperienceState, { type: 'REVIEW_RECORDING' });
    const dashboard = interactiveExperienceReducer(review, { type: 'SHOW_TEACHER_DASHBOARD' });
    const learner = interactiveExperienceReducer(dashboard, { type: 'SHOW_LEARNER_LIBRARY' });

    expect(isImmersiveInteractiveScreen(review.screen)).toBe(true);
    expect(isImmersiveInteractiveScreen(dashboard.screen)).toBe(false);
    expect(learner.screen).toBe('learner-library');
  });
});
