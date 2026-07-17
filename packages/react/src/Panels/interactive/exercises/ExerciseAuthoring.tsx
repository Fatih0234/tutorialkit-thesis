import { useState } from 'react';
import { InteractiveButton, InteractiveStatusBadge } from '../../InteractivePocUi.js';
import type { useExerciseAuthoring } from './useExerciseAuthoring.js';

interface Props {
  authoring: ReturnType<typeof useExerciseAuthoring>;
  selectedFile?: string;
  onDone: (exerciseId: string) => void;
  onCancel: () => void;
}

export function ExerciseAuthoring({ authoring, selectedFile, onDone, onCancel }: Props) {
  const [error, setError] = useState('');
  const draft = authoring.draft;

  async function saveAndFinish() {
    const completeness = authoring.canComplete();
    if (!completeness.complete) {
      setError(completeness.reasons.join(' '));
      return;
    }
    const saved = await authoring.saveDraft();
    if (saved) {onDone(saved.exerciseId);}
  }

  if (!draft) {
    return (
      <section aria-label="Exercise authoring" className="shrink-0 border-b border-amber-500/40 bg-tk-background-primary p-4">
        <p role="status" className="m-0 text-sm text-tk-text-secondary">Preparing exercise authoring workspace…</p>
      </section>
    );
  }

  if (authoring.previewingAsStudent) {
    return (
      <section aria-label="Preview as student" className="shrink-0 border-b border-blue-500/40 bg-blue-950/30 p-4">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <strong className="text-sm text-tk-text-primary">Preview as Student · {draft.content.title}</strong>
              <InteractiveStatusBadge tone="info">Not persisted</InteractiveStatusBadge>
            </div>
            <p className="mb-0 mt-1 whitespace-pre-wrap text-xs text-tk-text-secondary">
              {draft.content.instructions}
            </p>
            {authoring.previewValidation ? (
              <p role="status" className="mb-0 mt-2 text-xs text-tk-text-primary">
                Check result: {authoring.previewValidation.outcome}
              </p>
            ) : null}
          </div>
          <InteractiveButton variant="primary" icon="i-ph-check-circle" onClick={() => void authoring.checkStudentPreview()}>
            Check Solution
          </InteractiveButton>
          <InteractiveButton variant="ghost" icon="i-ph-arrow-left" onClick={authoring.exitStudentPreview}>
            Exit Preview
          </InteractiveButton>
        </div>
      </section>
    );
  }

  const selectedRole = selectedFile ? draft.content.fileRoles[selectedFile] : undefined;

  return (
    <section aria-label="Exercise authoring" className="shrink-0 border-b border-amber-500/40 bg-tk-background-primary p-3">
      <div className="mx-auto grid max-w-screen-2xl gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm text-tk-text-primary">Exercise Authoring</strong>
          <InteractiveStatusBadge tone="warning">Prepared exercise</InteractiveStatusBadge>
          <InteractiveStatusBadge>{authoring.status}</InteractiveStatusBadge>
          <div className="ml-auto flex flex-wrap gap-2">
            <InteractiveButton variant="ghost" onClick={authoring.previewAsStudent} icon="i-ph-eye">
              Preview as Student
            </InteractiveButton>
            <InteractiveButton onClick={() => void authoring.saveDraft()} icon="i-ph-floppy-disk">Save Draft</InteractiveButton>
            <InteractiveButton variant="primary" onClick={() => void saveAndFinish()} icon="i-ph-check">
              Save Exercise
            </InteractiveButton>
            <InteractiveButton variant="ghost" onClick={onCancel} icon="i-ph-x">Cancel</InteractiveButton>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-xs text-tk-text-secondary">
            Title
            <input
              value={draft.content.title}
              onChange={(event) => authoring.updateContent({ title: event.currentTarget.value })}
              className="rounded border border-tk-border-primary bg-tk-background-secondary px-2 py-1.5 text-tk-text-primary"
            />
          </label>
          <label className="grid gap-1 text-xs text-tk-text-secondary md:col-span-2">
            Learner instructions
            <textarea
              value={draft.content.instructions}
              onChange={(event) => authoring.updateContent({ instructions: event.currentTarget.value })}
              className="min-h-16 rounded border border-tk-border-primary bg-tk-background-secondary px-2 py-1.5 text-tk-text-primary"
            />
          </label>
          <label className="grid gap-1 text-xs text-tk-text-secondary md:col-span-2">
            Exercise explanation
            <textarea
              value={draft.content.explanation ?? ''}
              onChange={(event) => authoring.updateContent({ explanation: event.currentTarget.value })}
              placeholder="Explain the concepts, context, or examples learners may need while solving the exercise."
              className="min-h-24 rounded border border-tk-border-primary bg-tk-background-secondary px-2 py-1.5 text-tk-text-primary"
            />
            <span>Shown in the workspace Explanation panel and pinned to the published exercise version.</span>
          </label>
          <label className="grid gap-1 text-xs text-tk-text-secondary">
            Validation entrypoint
            <input
              value={draft.content.validation.entrypoint}
              onChange={(event) => authoring.updateValidationConfig({ entrypoint: event.currentTarget.value })}
              className="rounded border border-tk-border-primary bg-tk-background-secondary px-2 py-1.5 text-tk-text-primary"
            />
          </label>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <label className="grid gap-1 text-xs text-tk-text-secondary">
            Hints — one per line
            <textarea
              value={(draft.content.hints ?? []).join('\n')}
              onChange={(event) => authoring.updateContent({ hints: event.currentTarget.value.split('\n') })}
              className="min-h-14 rounded border border-tk-border-primary bg-tk-background-secondary px-2 py-1.5 text-tk-text-primary"
            />
          </label>
          <label className="grid gap-1 text-xs text-tk-text-secondary">
            Success feedback
            <textarea
              value={draft.content.successFeedback ?? ''}
              onChange={(event) => authoring.updateContent({ successFeedback: event.currentTarget.value })}
              className="min-h-14 rounded border border-tk-border-primary bg-tk-background-secondary px-2 py-1.5 text-tk-text-primary"
            />
          </label>
          <label className="grid gap-1 text-xs text-tk-text-secondary">
            General failure feedback
            <textarea
              value={draft.content.failureFeedback ?? ''}
              onChange={(event) => authoring.updateContent({ failureFeedback: event.currentTarget.value })}
              className="min-h-14 rounded border border-tk-border-primary bg-tk-background-secondary px-2 py-1.5 text-tk-text-primary"
            />
          </label>
        </div>

        <fieldset className="grid gap-2 rounded border border-tk-border-primary p-2">
          <legend className="px-1 text-xs text-tk-text-secondary">Automated checks</legend>
          {draft.content.validation.checks.map((check, index) => (
            <div key={`${check.id}:${index}`} className="grid gap-2 md:grid-cols-[1fr_2fr_2fr_auto]">
              <input
                aria-label={`Check ${index + 1} id`}
                value={check.id}
                onChange={(event) => {
                  const checks = [...draft.content.validation.checks];
                  checks[index] = { ...check, id: event.currentTarget.value };
                  authoring.updateValidationChecks(checks);
                }}
                placeholder="check-id"
                className="rounded border border-tk-border-primary bg-tk-background-secondary px-2 py-1 text-xs"
              />
              <input
                aria-label={`Check ${index + 1} title`}
                value={check.title}
                onChange={(event) => {
                  const checks = [...draft.content.validation.checks];
                  checks[index] = { ...check, title: event.currentTarget.value };
                  authoring.updateValidationChecks(checks);
                }}
                placeholder="Learner-facing check title"
                className="rounded border border-tk-border-primary bg-tk-background-secondary px-2 py-1 text-xs"
              />
              <input
                aria-label={`Check ${index + 1} failure feedback`}
                value={check.failureFeedback ?? ''}
                onChange={(event) => {
                  const checks = [...draft.content.validation.checks];
                  checks[index] = { ...check, failureFeedback: event.currentTarget.value };
                  authoring.updateValidationChecks(checks);
                }}
                placeholder="Safe failure feedback"
                className="rounded border border-tk-border-primary bg-tk-background-secondary px-2 py-1 text-xs"
              />
              <InteractiveButton
                variant="ghost"
                icon="i-ph-trash"
                onClick={() =>
                  authoring.updateValidationChecks(
                    draft.content.validation.checks.filter((_, checkIndex) => checkIndex !== index),
                  )
                }
              >
                Remove
              </InteractiveButton>
            </div>
          ))}
          <InteractiveButton
            variant="ghost"
            icon="i-ph-plus"
            onClick={() =>
              authoring.updateValidationChecks([
                ...draft.content.validation.checks,
                { id: `check-${draft.content.validation.checks.length + 1}`, title: 'New check' },
              ])
            }
          >
            Add Check
          </InteractiveButton>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          {(['starter', 'reference', 'validation'] as const).map((value) => (
            <InteractiveButton
              key={value}
              variant={authoring.workspace === value ? 'primary' : 'ghost'}
              onClick={() => authoring.switchWorkspace(value)}
            >
              {value === 'starter' ? 'Starter Workspace' : value === 'reference' ? 'Reference Solution' : 'Private Validation'}
            </InteractiveButton>
          ))}
          {draft.content.referenceSolutionFiles ? (
            <InteractiveButton variant="ghost" icon="i-ph-trash" onClick={authoring.removeReferenceSolution}>
              Remove Reference
            </InteractiveButton>
          ) : null}
          {authoring.workspace === 'starter' && selectedFile ? (
            <label className="ml-2 flex items-center gap-2 text-xs text-tk-text-secondary">
              Selected file
              <select
                value={selectedRole === 'read-only' ? 'read-only' : 'editable'}
                onChange={(event) => authoring.setSelectedFileRole(event.currentTarget.value as 'editable' | 'read-only')}
                className="rounded border border-tk-border-primary bg-tk-background-secondary px-2 py-1"
              >
                <option value="editable">Editable</option>
                <option value="read-only">Read-only</option>
              </select>
            </label>
          ) : null}
          <div className="ml-auto flex gap-2">
            <InteractiveButton onClick={() => void authoring.runValidation('starter')} icon="i-ph-play">Test Starter</InteractiveButton>
            <InteractiveButton onClick={() => void authoring.runValidation('reference')} icon="i-ph-check-circle">Test Reference</InteractiveButton>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-tk-text-secondary">
          <span>Starter: {authoring.starterValidation?.outcome ?? 'not checked'}</span>
          <span>Reference: {authoring.referenceValidation?.outcome ?? 'not checked'}</span>
          <span>Private validation files are hidden from the normal learner workspace.</span>
          <span>Import learner modules dynamically inside check.run() so learner syntax and export mistakes remain normal failed checks.</span>
        </div>
        {authoring.starterValidation?.diagnostics || authoring.referenceValidation?.diagnostics ? (
          <details className="rounded border border-tk-border-primary bg-tk-background-secondary p-2 text-xs">
            <summary className="cursor-pointer font-600 text-tk-text-primary">Validation diagnostics</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-tk-text-secondary">
              {authoring.starterValidation?.diagnostics || authoring.referenceValidation?.diagnostics}
            </pre>
          </details>
        ) : null}
        {error ? <p role="alert" className="m-0 text-xs text-red-300">{error}</p> : null}
      </div>
    </section>
  );
}
