import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import {
  initialInteractiveExperienceState,
  interactiveExperienceReducer,
  type InteractiveExperienceAction,
  type InteractiveExperienceState,
} from './interactive-session.js';

interface InteractiveExperienceContextValue {
  experience: InteractiveExperienceState;
  dispatchExperience: Dispatch<InteractiveExperienceAction>;
}

const InteractiveExperienceContext = createContext<InteractiveExperienceContextValue | null>(null);

export function InteractiveExperienceProvider({ children }: { children: ReactNode }) {
  const [experience, dispatchExperience] = useReducer(interactiveExperienceReducer, initialInteractiveExperienceState);
  const value = useMemo(() => ({ experience, dispatchExperience }), [experience]);

  return <InteractiveExperienceContext.Provider value={value}>{children}</InteractiveExperienceContext.Provider>;
}

export function useInteractiveExperienceState() {
  const value = useContext(InteractiveExperienceContext);

  if (!value) {
    throw new Error('useInteractiveExperienceState must be used inside InteractiveExperienceProvider.');
  }

  return value;
}
