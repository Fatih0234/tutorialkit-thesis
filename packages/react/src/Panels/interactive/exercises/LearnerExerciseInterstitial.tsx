import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { InteractivePocControlsModel } from '../../useInteractivePoc.js';
import { InteractiveButton, InteractiveStatusBadge } from '../../InteractivePocUi.js';

export function LearnerExerciseInterstitial({ model }: { model: InteractivePocControlsModel }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [visible, setVisible] = useState(false);
  const resumableAttempt = model.exerciseAttempts.find((attempt) => attempt.status !== 'passed');

  useEffect(() => {
    headingRef.current?.focus();
  }, [model.exerciseTransitionPhase]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  function keepFocusInDialog(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') {return;}
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hasAttribute('disabled'));
    if (!focusable.length) {return;}
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-checkpoint-heading"
      data-exercise-interstitial
      onKeyDown={keepFocusInDialog}
      className="absolute inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-[2px] transition-opacity duration-200 motion-reduce:transition-none"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-tk-border-primary bg-tk-background-primary p-5 shadow-2xl transition-transform duration-200 motion-reduce:transition-none"
        style={{ transform: visible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.985)' }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <InteractiveStatusBadge tone="warning">Lecture paused</InteractiveStatusBadge>
          <span className="text-xs text-tk-text-secondary">Exercise checkpoint</span>
        </div>
        <h2
          ref={headingRef}
          id="exercise-checkpoint-heading"
          tabIndex={-1}
          className="mb-0 mt-3 text-xl font-700 text-tk-text-primary outline-none"
        >
          {model.exerciseTransitionPhase === 'loading-introduction'
            ? 'Preparing the exercise…'
            : model.exerciseTransitionPhase === 'load-error'
              ? 'The exercise could not be prepared'
              : model.activeExercise?.title || 'Exercise checkpoint'}
        </h2>

        {model.exerciseTransitionPhase === 'loading-introduction' ? (
          <p role="status" className="mb-0 mt-3 text-sm text-tk-text-secondary">
            The lecture is paused at the exact checkpoint. Your current lesson view will remain unchanged.
          </p>
        ) : model.exerciseTransitionPhase === 'load-error' ? (
          <>
            <p role="alert" className="mb-0 mt-3 text-sm text-red-200">
              {model.exerciseStatusMessage || 'Unable to load the exercise. Your lesson position is safe.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <InteractiveButton variant="ghost" onClick={model.onSkipPendingExercise} icon="i-ph-skip-forward">
                Continue Lecture
              </InteractiveButton>
              <InteractiveButton variant="primary" onClick={model.onRetryExerciseIntroduction} icon="i-ph-arrow-clockwise">
                Retry
              </InteractiveButton>
            </div>
          </>
        ) : (
          <>
            <p className="mb-0 mt-3 whitespace-pre-wrap text-sm text-tk-text-secondary">
              {model.activeExercise?.instructions}
            </p>
            <p className="mb-0 mt-3 rounded-md border border-tk-border-primary bg-tk-background-secondary p-3 text-xs text-tk-text-secondary">
              The lecture is paused. Your exact lesson position and previous exercise work are safe.
            </p>
            {resumableAttempt ? (
              <p className="mb-0 mt-3 text-xs text-tk-text-secondary">You have saved work for this exercise.</p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <InteractiveButton variant="ghost" onClick={model.onSkipPendingExercise} icon="i-ph-skip-forward">
                Skip for Now
              </InteractiveButton>
              {resumableAttempt ? (
                <>
                  <InteractiveButton onClick={() => model.onBeginExercise(true)} icon="i-ph-arrow-counter-clockwise">
                    Start Over
                  </InteractiveButton>
                  <InteractiveButton variant="primary" onClick={() => model.onBeginExercise(false)} icon="i-ph-play">
                    Resume Exercise
                  </InteractiveButton>
                </>
              ) : (
                <InteractiveButton variant="primary" onClick={() => model.onBeginExercise(false)} icon="i-ph-play">
                  Start Exercise
                </InteractiveButton>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
