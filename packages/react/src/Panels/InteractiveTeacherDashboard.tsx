import { useState } from 'react';
import { InteractiveButton, InteractiveCard, interactiveSelectClassName } from './InteractivePocUi.js';
import { InteractiveRecordingLibrary } from './InteractiveRecordingLibrary.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

export type InteractiveRecordingMode = 'none' | 'audio' | 'webcam';

interface InteractiveTeacherDashboardProps extends InteractivePocControlsModel {
  lessonId: string;
  filePaths: string[];
  initialFile: string;
  recordingMode: InteractiveRecordingMode;
  isStartingRecording: boolean;
  onInitialFileChange: (filePath: string) => void;
  onRecordingModeChange: (mode: InteractiveRecordingMode) => void;
  onPrepareMaterials: () => void;
  onStartConfiguredRecording: () => void;
  onPreviewSelectedDraft: (recordingId: string) => void;
  onPreviewSelectedPublished: (recordingId: string) => void;
  exerciseDrafts: Array<{ exerciseId: string; title: string; complete: boolean; publishable: boolean }>;
  exerciseAuthoringStatus: string;
  onCreatePreparedExercise: () => void;
  onOpenPreparedExercise: (exerciseId: string) => void;
  onPublishPreparedExercise: (exerciseId: string) => void;
}

export function InteractiveTeacherDashboard(props: InteractiveTeacherDashboardProps) {
  const [deletingDraftId, setDeletingDraftId] = useState('');
  const [deletingPublishedId, setDeletingPublishedId] = useState('');
  const canStartConfiguredRecording =
    props.recordingMode === 'none' ? props.canStartRecording : props.canStartMediaRecording;

  function deleteDraft(recordingId: string) {
    if (deletingDraftId !== recordingId) {
      props.onSelectDraftRecording(recordingId);
      setDeletingDraftId(recordingId);

      return;
    }

    setDeletingDraftId('');
    void props.onDeleteSelectedDraft();
  }

  function deletePublished(recordingId: string) {
    if (deletingPublishedId !== recordingId) {
      setDeletingPublishedId(recordingId);
      return;
    }

    setDeletingPublishedId('');
    props.onDeletePublishedRecording(recordingId);
  }

  return (
    <section aria-labelledby="interactive-teacher-heading" className="grid gap-5">
      <header>
        <h2 id="interactive-teacher-heading" className="m-0 text-xl font-700 text-tk-text-primary">
          Teacher Studio
        </h2>
        <p className="mb-0 mt-1 text-sm text-tk-text-secondary">
          Prepare a lecture or continue working with an existing recording.
        </p>
      </header>

      <InteractiveCard role="region" aria-label="Lecture setup" className="grid gap-4 p-4">
        <div>
          <h3 className="m-0 flex items-center gap-2 text-sm font-600 text-tk-text-primary">
            <span aria-hidden="true" className="i-ph-presentation-chart-duotone text-lg text-tk-text-accent" />
            Lecture Setup
          </h3>
          <p className="mb-0 mt-1 text-xs text-tk-text-secondary">
            Choose how to capture this lecture, then edit the material or begin recording.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-500 text-tk-text-secondary">
            Initial file
            <select
              aria-label="Initial file"
              value={props.initialFile}
              onChange={(event) => props.onInitialFileChange(event.currentTarget.value)}
              className={interactiveSelectClassName}
            >
              {props.filePaths.map((filePath) => (
                <option key={filePath} value={filePath}>
                  {filePath}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="grid gap-1.5 rounded-md border border-tk-border-primary p-2">
            <legend className="px-1 text-xs font-500 text-tk-text-secondary">Recording mode</legend>
            {(
              [
                ['none', 'Editor only'],
                ['audio', 'Editor + microphone'],
                ['webcam', 'Editor + camera + microphone'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="inline-flex items-center gap-2 text-xs text-tk-text-primary">
                <input
                  type="radio"
                  name="interactive-recording-mode"
                  value={value}
                  checked={props.recordingMode === value}
                  onChange={() => props.onRecordingModeChange(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        </div>

        {props.mediaStatus === 'error' || props.mediaStatus === 'unavailable' ? (
          <p
            role="alert"
            className="m-0 rounded-md border border-red-500/50 bg-red-950/30 px-3 py-2 text-xs text-red-200"
          >
            Microphone/camera could not start: {props.mediaError}. Check browser site permissions and the selected input
            device.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <InteractiveButton icon="i-ph-pencil-line" onClick={props.onPrepareMaterials}>
            Edit Materials
          </InteractiveButton>
          <InteractiveButton
            variant="primary"
            icon={props.isStartingRecording ? 'i-ph-spinner-gap' : 'i-ph-record-fill'}
            onClick={props.onStartConfiguredRecording}
            disabled={!canStartConfiguredRecording || props.isStartingRecording}
          >
            {props.isStartingRecording ? 'Preparing Recording Studio' : 'Start Recording'}
          </InteractiveButton>
        </div>
      </InteractiveCard>

      <InteractiveCard className="grid gap-3 p-4" aria-label="Exercise library">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-sm font-600 text-tk-text-primary">Exercise Library</h3>
            <p className="mb-0 mt-1 text-xs text-tk-text-secondary">
              Prepare reusable exercises before recording or finish captured drafts.
            </p>
          </div>
          <InteractiveButton icon="i-ph-plus" onClick={props.onCreatePreparedExercise}>
            New Prepared Exercise
          </InteractiveButton>
        </div>
        {props.exerciseDrafts.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {props.exerciseDrafts.map((exercise) => (
              <div
                key={exercise.exerciseId}
                className="grid gap-2 rounded-md border border-tk-border-primary bg-tk-background-secondary p-3"
              >
                <button
                  type="button"
                  onClick={() => props.onOpenPreparedExercise(exercise.exerciseId)}
                  className="text-left hover:text-tk-text-primary"
                >
                  <strong className="block text-sm text-tk-text-primary">{exercise.title || 'Untitled exercise'}</strong>
                  <span className="text-xs text-tk-text-secondary">
                    {exercise.publishable ? 'Verified and ready to publish' : exercise.complete ? 'Content complete; verification required' : 'Draft needs work'}
                  </span>
                </button>
                {exercise.publishable ? (
                  <InteractiveButton
                    icon="i-ph-upload-simple"
                    onClick={() => props.onPublishPreparedExercise(exercise.exerciseId)}
                  >
                    Publish Exercise Update
                  </InteractiveButton>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="m-0 rounded border border-dashed border-tk-border-primary p-3 text-xs text-tk-text-secondary">
            No prepared exercises yet.
          </p>
        )}
        {props.exerciseAuthoringStatus !== 'idle' ? (
          <p role="status" className="m-0 text-xs text-tk-text-secondary">{props.exerciseAuthoringStatus}</p>
        ) : null}
      </InteractiveCard>

      <InteractiveCard className="grid gap-5 p-4" aria-label="Your recordings">
        <InteractiveRecordingLibrary
          title="Drafts"
          description="Recordings that are ready to review or publish."
          emptyText="No drafts yet. Complete a recording to create one."
          recordings={props.draftRecordings}
          actionLabel="Open Review"
          actionIcon="i-ph-play-circle"
          onOpenRecording={props.onPreviewSelectedDraft}
          onDeleteRecording={deleteDraft}
          deletingRecordingId={deletingDraftId}
        />
        <div className="border-t border-tk-border-primary" />
        <InteractiveRecordingLibrary
          title="Published Lessons"
          description="Lectures currently available to learners."
          emptyText="No published lessons yet. Publish a recording from its review page."
          recordings={props.publishedRecordings}
          actionLabel="View Lesson"
          actionIcon="i-ph-play-circle"
          onOpenRecording={props.onPreviewSelectedPublished}
          onDeleteRecording={deletePublished}
          canDeleteRecording={(recording) =>
            props.canDeletePublishedRecording && recording.ownerUserId === props.currentUser?.id
          }
          deletingRecordingId={deletingPublishedId}
          deleteLabel="Lesson"
          deleteConfirmationText="This removes the lesson, its media, and linked learner experiments."
        />
        {props.publishedDeleteStatus === 'deleted' ? (
          <p role="status" className="m-0 text-xs text-green-300">
            Published lesson deleted.
          </p>
        ) : null}
        {props.publishedDeleteError !== 'none' ? (
          <p role="alert" className="m-0 text-xs text-red-300">
            {props.publishedDeleteError}
          </p>
        ) : null}
      </InteractiveCard>
    </section>
  );
}
