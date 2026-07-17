export type ExerciseTransitionPhase =
  | 'idle'
  | 'loading-introduction'
  | 'introduction'
  | 'load-error'
  | 'covering'
  | 'revealing-exercise'
  | 'active'
  | 'revealing-lesson';

export type ExerciseTransitionAction =
  | { type: 'INTERCEPT' }
  | { type: 'INTRODUCTION_READY' }
  | { type: 'INTRODUCTION_FAILED' }
  | { type: 'BEGIN_COVER' }
  | { type: 'REVEAL_EXERCISE' }
  | { type: 'EXERCISE_REVEALED' }
  | { type: 'REVEAL_LESSON' }
  | { type: 'LESSON_REVEALED' }
  | { type: 'RESET' };

export function exerciseTransitionReducer(
  phase: ExerciseTransitionPhase,
  action: ExerciseTransitionAction,
): ExerciseTransitionPhase {
  switch (action.type) {
    case 'INTERCEPT': {
      return 'loading-introduction';
    }
    case 'INTRODUCTION_READY': {
      return phase === 'loading-introduction' || phase === 'load-error' ? 'introduction' : phase;
    }
    case 'INTRODUCTION_FAILED': {
      return phase === 'loading-introduction' ? 'load-error' : phase;
    }
    case 'BEGIN_COVER': {
      return phase === 'introduction' || phase === 'load-error' || phase === 'active' ? 'covering' : phase;
    }
    case 'REVEAL_EXERCISE': {
      return phase === 'covering' ? 'revealing-exercise' : phase;
    }
    case 'EXERCISE_REVEALED': {
      return phase === 'revealing-exercise' ? 'active' : phase;
    }
    case 'REVEAL_LESSON': {
      return phase === 'covering' ? 'revealing-lesson' : phase;
    }
    case 'LESSON_REVEALED': {
      return phase === 'revealing-lesson' ? 'idle' : phase;
    }
    case 'RESET': {
      return 'idle';
    }
  }
}

export function isExerciseIntroductionVisible(phase: ExerciseTransitionPhase) {
  return phase === 'loading-introduction' || phase === 'introduction' || phase === 'load-error';
}

export function isExerciseWorkspaceCovered(phase: ExerciseTransitionPhase) {
  return phase === 'covering' || phase === 'revealing-exercise' || phase === 'revealing-lesson';
}
