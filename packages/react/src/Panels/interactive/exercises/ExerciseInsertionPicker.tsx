import { useState } from 'react';
import type { ExerciseDraft } from '@tutorialkit/runtime';
import { InteractiveButton, InteractiveStatusBadge } from '../../InteractivePocUi.js';

interface Props {
  exercises: ExerciseDraft[];
  libraryStatus: 'loading' | 'ready' | 'offline';
  onAttach: (exerciseId: string) => boolean;
  onCancel: () => void;
  onRetry: () => void;
}

export function ExerciseInsertionPicker({ exercises, libraryStatus, onAttach, onCancel, onRetry }: Props) {
  const [attachingExerciseId, setAttachingExerciseId] = useState<string>();
  const [error, setError] = useState('');

  function attach(exerciseId: string) {
    if (attachingExerciseId) {
      return;
    }

    setAttachingExerciseId(exerciseId);
    setError('');

    if (!onAttach(exerciseId)) {
      setAttachingExerciseId(undefined);
      setError('Unable to attach the exercise. The recording remains paused.');
    }
  }

  return (
    <section
      aria-label="Exercise insertion"
      className="shrink-0 border-b border-amber-500/40 bg-amber-950/30 p-4"
    >
      <div className="mx-auto grid max-w-screen-2xl gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,2fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="m-0 text-lg font-700 text-tk-text-primary">Choose a prepared exercise</h1>
            <InteractiveStatusBadge tone="warning">Recording paused</InteractiveStatusBadge>
          </div>
          <p className="mb-0 mt-1 text-xs text-tk-text-secondary">
            Select a verified exercise for this lesson. Choosing one adds the timeline point and immediately resumes recording.
          </p>
        </div>

        <div className="grid content-start gap-2 rounded-md border border-tk-border-primary bg-tk-background-secondary p-3">
          {libraryStatus === 'loading' ? (
            <p role="status" className="m-0 text-xs text-tk-text-secondary">Loading prepared exercises…</p>
          ) : exercises.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {exercises.map((exercise) => (
                <InteractiveButton
                  key={exercise.exerciseId}
                  variant="primary"
                  icon={attachingExerciseId === exercise.exerciseId ? 'i-ph-spinner-gap' : 'i-ph-student'}
                  onClick={() => attach(exercise.exerciseId)}
                  disabled={Boolean(attachingExerciseId)}
                  className="justify-start text-left"
                >
                  {exercise.content.title || 'Untitled exercise'}
                </InteractiveButton>
              ))}
            </div>
          ) : (
            <p role="status" className="m-0 rounded border border-dashed border-tk-border-primary p-3 text-xs text-tk-text-secondary">
              No verified exercises are available for this lesson. Cancel this pause and prepare one in the Exercise Library.
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {libraryStatus === 'offline' ? (
              <InteractiveButton variant="ghost" icon="i-ph-arrow-clockwise" onClick={onRetry}>
                Retry
              </InteractiveButton>
            ) : null}
            <InteractiveButton variant="ghost" icon="i-ph-x" onClick={onCancel} disabled={Boolean(attachingExerciseId)}>
              Cancel
            </InteractiveButton>
          </div>
          {libraryStatus === 'offline' ? (
            <p role="alert" className="m-0 text-xs text-amber-200">
              The remote exercise library could not be refreshed. Verified local exercises are still available.
            </p>
          ) : null}
          {error ? <p role="alert" className="m-0 text-xs text-red-300">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
