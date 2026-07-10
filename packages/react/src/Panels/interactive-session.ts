export type InteractiveExperienceScreen =
  | 'teacher-dashboard'
  | 'teacher-materials'
  | 'teacher-recording'
  | 'teacher-review'
  | 'learner-library'
  | 'learner-player';

export interface InteractiveExperienceState {
  screen: InteractiveExperienceScreen;
  selectedRecordingId?: string;
  activeRecordingId?: string;
}

export type InteractiveExperienceAction =
  | { type: 'SHOW_TEACHER_DASHBOARD' }
  | { type: 'PREPARE_MATERIALS' }
  | { type: 'START_RECORDING' }
  | { type: 'REVIEW_RECORDING'; recordingId?: string }
  | { type: 'SHOW_LEARNER_LIBRARY' }
  | { type: 'SELECT_LEARNER_RECORDING'; recordingId: string }
  | { type: 'OPEN_LEARNER_RECORDING'; recordingId: string }
  | { type: 'EXIT_LEARNER_PLAYER' };

export const initialInteractiveExperienceState: InteractiveExperienceState = {
  screen: 'teacher-dashboard',
};

export function interactiveExperienceReducer(
  state: InteractiveExperienceState,
  action: InteractiveExperienceAction,
): InteractiveExperienceState {
  switch (action.type) {
    case 'SHOW_TEACHER_DASHBOARD':
      return { screen: 'teacher-dashboard' };
    case 'PREPARE_MATERIALS':
      return { ...state, screen: 'teacher-materials' };
    case 'START_RECORDING':
      return { ...state, screen: 'teacher-recording' };
    case 'REVIEW_RECORDING':
      return {
        ...state,
        screen: 'teacher-review',
        activeRecordingId: action.recordingId ?? state.activeRecordingId,
      };
    case 'SHOW_LEARNER_LIBRARY':
      return { screen: 'learner-library', selectedRecordingId: state.selectedRecordingId };
    case 'SELECT_LEARNER_RECORDING':
      return { ...state, selectedRecordingId: action.recordingId };
    case 'OPEN_LEARNER_RECORDING':
      return {
        screen: 'learner-player',
        selectedRecordingId: action.recordingId,
        activeRecordingId: action.recordingId,
      };
    case 'EXIT_LEARNER_PLAYER':
      return {
        screen: 'learner-library',
        selectedRecordingId: state.selectedRecordingId,
      };
  }
}

export function isImmersiveInteractiveScreen(screen: InteractiveExperienceScreen) {
  return screen === 'teacher-materials' || screen === 'teacher-recording' || screen === 'teacher-review' || screen === 'learner-player';
}
