import { describe, expect, it } from 'vitest';
import { exerciseTransitionReducer } from './exercise-transition.js';

describe('exercise transition', () => {
  it('moves through introduction and a covered exercise reveal', () => {
    let phase = exerciseTransitionReducer('idle', { type: 'INTERCEPT' });
    phase = exerciseTransitionReducer(phase, { type: 'INTRODUCTION_READY' });
    phase = exerciseTransitionReducer(phase, { type: 'BEGIN_COVER' });
    phase = exerciseTransitionReducer(phase, { type: 'REVEAL_EXERCISE' });
    phase = exerciseTransitionReducer(phase, { type: 'EXERCISE_REVEALED' });

    expect(phase).toBe('active');
  });

  it('keeps the lesson covered until restoration is ready', () => {
    let phase = exerciseTransitionReducer('active', { type: 'BEGIN_COVER' });
    phase = exerciseTransitionReducer(phase, { type: 'REVEAL_LESSON' });
    expect(phase).toBe('revealing-lesson');
    expect(exerciseTransitionReducer(phase, { type: 'LESSON_REVEALED' })).toBe('idle');
  });

  it('supports retrying a failed introduction', () => {
    const loading = exerciseTransitionReducer('idle', { type: 'INTERCEPT' });
    const failed = exerciseTransitionReducer(loading, { type: 'INTRODUCTION_FAILED' });
    expect(exerciseTransitionReducer(failed, { type: 'INTERCEPT' })).toBe('loading-introduction');
  });
});
