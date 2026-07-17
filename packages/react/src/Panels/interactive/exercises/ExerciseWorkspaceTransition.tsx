import { useEffect, useRef, useState } from 'react';
import type { ExerciseTransitionPhase } from './exercise-transition.js';

interface Props {
  phase: ExerciseTransitionPhase;
  onCovered: () => void;
  onRevealed: () => void;
}

export function ExerciseWorkspaceTransition({ phase, onCovered, onRevealed }: Props) {
  const [opaque, setOpaque] = useState(false);
  const completedPhaseRef = useRef<ExerciseTransitionPhase>();
  const onCoveredRef = useRef(onCovered);
  const onRevealedRef = useRef(onRevealed);
  onCoveredRef.current = onCovered;
  onRevealedRef.current = onRevealed;
  const covering = phase === 'covering';
  const revealing = phase === 'revealing-exercise' || phase === 'revealing-lesson';

  useEffect(() => {
    completedPhaseRef.current = undefined;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      setOpaque(covering);
      queueMicrotask(() => {
        if (covering) {onCoveredRef.current();}
        else if (revealing) {onRevealedRef.current();}
      });
      return undefined;
    }

    const frame = requestAnimationFrame(() => setOpaque(covering));
    return () => cancelAnimationFrame(frame);
  }, [phase, covering, revealing]);

  if (!covering && !revealing) {
    return null;
  }

  return (
    <div
      data-exercise-workspace-transition={phase}
      role="status"
      aria-live="polite"
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget || event.propertyName !== 'opacity' || completedPhaseRef.current === phase) {
          return;
        }
        completedPhaseRef.current = phase;
        if (covering && opaque) {onCoveredRef.current();}
        else if (revealing && !opaque) {onRevealedRef.current();}
      }}
      className="absolute inset-0 z-[60] grid place-items-center bg-tk-background-primary transition-opacity duration-200"
      style={{ opacity: opaque ? 1 : 0, pointerEvents: 'all' }}
    >
      <div className="flex items-center gap-2 text-sm text-tk-text-secondary">
        <span className="i-ph-spinner-gap animate-spin text-lg" aria-hidden="true" />
        {phase === 'covering' ? 'Preparing workspace…' : 'Workspace ready'}
      </div>
    </div>
  );
}
