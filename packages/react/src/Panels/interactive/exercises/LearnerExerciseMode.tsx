import { InteractiveButton } from '../../InteractivePocUi.js';
import type { InteractivePocControlsModel } from '../../useInteractivePoc.js';

export function LearnerExerciseMode({ model }: { model: InteractivePocControlsModel }) {
  const exercise = model.activeExercise;
  const attempt = model.activeExerciseAttempt;

  if (!model.isExerciseMode || !exercise || !attempt) {
    return null;
  }

  return (
    <section aria-label="Exercise mode" className="shrink-0 border-b border-amber-400/30 bg-amber-950/20 px-4 py-3">
      <div className="mx-auto grid max-w-screen-2xl gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-300">
            Exercise · lecture paused
          </p>
          <h2 className="m-0 mt-1 text-lg font-semibold text-tk-text-primary">{exercise.title}</h2>
          <p className="m-0 mt-1 whitespace-pre-wrap text-sm text-tk-text-secondary">{exercise.instructions}</p>

          {exercise.hints.length > 0 ? (
            <details className="mt-2 text-sm text-tk-text-secondary">
              <summary className="cursor-pointer font-medium text-amber-200">Hints</summary>
              <ul className="mb-0 mt-1 pl-5">
                {exercise.hints.map((hint) => <li key={hint}>{hint}</li>)}
              </ul>
            </details>
          ) : null}

          <ExerciseTestResults model={model} />

          {model.learnerCommits.length > 0 ? (
            <div aria-label="Exercise checkpoints" className="mt-2 flex flex-wrap items-center gap-1 text-xs">
              <span className="mr-1 text-tk-text-secondary">Checkpoints:</span>
              {model.learnerCommits.map((commit) => (
                <button
                  key={commit.id}
                  type="button"
                  onClick={() => model.onSelectLearnerCommit(commit.id)}
                  className="rounded border border-tk-border-primary px-2 py-1 text-tk-text-secondary hover:text-tk-text-primary"
                >
                  {commit.name}
                </button>
              ))}
              <button
                type="button"
                onClick={model.onSelectLearnerHead}
                className="rounded border border-orange-400/40 px-2 py-1 text-orange-200"
              >
                Current draft
              </button>
            </div>
          ) : null}

          <p
            role="status"
            className={`m-0 mt-2 text-xs ${model.exerciseCheckStatus === 'passed' ? 'text-emerald-300' : model.exerciseCheckStatus === 'failed' ? 'text-rose-300' : 'text-tk-text-secondary'}`}
          >
            {model.exerciseStatusMessage}
            {model.exerciseWorkspaceChangedAfterPass
              ? ' The workspace has changed since the successful check; check again to confirm this version.'
              : ''}
          </p>
        </div>

        <div className="flex min-w-56 flex-col items-stretch gap-2">
          {model.exerciseAttempts.length > 1 ? (
            <label className="grid gap-1 text-xs text-tk-text-secondary">
              Attempt
              <select
                aria-label="Exercise attempt"
                value={attempt.id}
                onChange={(event) => model.onSelectExerciseAttempt(event.currentTarget.value)}
                className="rounded border border-tk-border-primary bg-tk-background-primary px-2 py-1 text-tk-text-primary"
              >
                {model.exerciseAttempts.map((item, index) => (
                  <option key={item.id} value={item.id}>
                    Attempt {model.exerciseAttempts.length - index} · {item.status}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <InteractiveButton
            variant="primary"
            icon="i-ph-check-circle"
            onClick={model.onCheckExerciseSolution}
            disabled={model.exerciseCheckStatus === 'checking'}
          >
            {model.exerciseCheckStatus === 'checking' ? 'Checking…' : 'Check Solution'}
          </InteractiveButton>
          <div className="flex flex-wrap justify-end gap-2">
            <InteractiveButton variant="ghost" icon="i-ph-arrow-counter-clockwise" onClick={model.onStartExerciseOver}>
              Start Over
            </InteractiveButton>
            <InteractiveButton variant="ghost" icon="i-ph-clock" onClick={model.onSkipExercise}>
              Skip for Now
            </InteractiveButton>
            <InteractiveButton icon="i-ph-play" onClick={model.onContinueAfterExercise}>
              Continue Lecture
            </InteractiveButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function ExerciseTestResults({ model }: { model: InteractivePocControlsModel }) {
  const exercise = model.activeExercise;
  const result = model.exerciseCheckResult;
  const visible = model.exerciseCheckStatus === 'checking' || Boolean(result) || ['broken', 'error'].includes(model.exerciseCheckStatus);

  if (!exercise || !visible) {
    return null;
  }

  const passedCount = result?.checks.filter((check) => check.passed).length ?? 0;
  const checkCount = exercise.checks.length;

  return (
    <section
      aria-label="Test results"
      className="mt-3 overflow-hidden rounded-md border border-slate-700 bg-slate-950 font-mono text-xs text-slate-200 shadow-inner"
    >
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-3 py-2">
        <strong className="font-semibold text-slate-100">Solution checks</strong>
        <span className="text-slate-400">Node · isolated workspace</span>
      </div>
      <div className="grid gap-2 p-3" role="status" aria-live="polite">
        {model.exerciseCheckStatus === 'checking' ? (
          <p className="m-0 flex items-center gap-2 text-cyan-300">
            <span className="i-ph-spinner-gap animate-spin" aria-hidden="true" /> Running solution checks…
          </p>
        ) : result?.checks.length ? (
          <>
            <ul aria-label="Check results" className="m-0 grid gap-2 pl-0">
              {exercise.checks.map((definition) => {
                const check = result.checks.find((item) => item.id === definition.id);
                if (!check) {return null;}
                return (
                  <li key={definition.id} className="list-none">
                    <div className={check.passed ? 'text-emerald-300' : 'text-rose-300'}>
                      {check.passed ? 'PASS' : 'FAIL'}&nbsp; {definition.title}
                    </div>
                    {!check.passed && check.message ? (
                      <div className="mt-1 pl-6 text-slate-300">{check.message}</div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className={model.exerciseCheckStatus === 'passed' ? 'm-0 border-t border-slate-800 pt-2 text-emerald-300' : 'm-0 border-t border-slate-800 pt-2 text-rose-300'}>
              {passedCount} of {checkCount} checks passed
            </p>
          </>
        ) : (
          <>
            <p className="m-0 text-amber-300">ERROR&nbsp; Solution checks could not run.</p>
            <p className="m-0 text-slate-300">{model.exerciseStatusMessage}</p>
          </>
        )}
      </div>
    </section>
  );
}
