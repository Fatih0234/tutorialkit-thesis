import { useState, type ReactNode } from 'react';
import { InteractiveEditorPlayer } from './InteractiveEditorPlayer.js';
import { InteractiveRecordingLibrary } from './InteractiveRecordingLibrary.js';
import {
  InteractiveButton,
  InteractiveCard,
  InteractiveStatusBadge,
  interactiveDetailsClassName,
  interactiveSelectClassName,
  interactiveSummaryClassName,
} from './InteractivePocUi.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

type DestructiveActionId = 'discard-draft' | 'delete-draft' | 'delete-selected-draft' | 'reset-demo-data';

interface ConfirmActionButtonProps {
  id: DestructiveActionId;
  pendingId: DestructiveActionId | null;
  setPendingId: (id: DestructiveActionId | null) => void;
  disabled?: boolean;
  children: ReactNode;
  confirmLabel: string;
  confirmationText: string;
  onConfirm: () => void | Promise<void>;
}

function ConfirmActionButton({
  id,
  pendingId,
  setPendingId,
  disabled,
  children,
  confirmLabel,
  confirmationText,
  onConfirm,
}: ConfirmActionButtonProps) {
  const isPending = pendingId === id;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <InteractiveButton
        variant={isPending ? 'danger' : 'ghost'}
        icon={isPending ? 'i-ph-warning' : 'i-ph-trash'}
        onClick={() => {
          if (!isPending) {
            setPendingId(id);
            return;
          }

          setPendingId(null);
          void Promise.resolve(onConfirm()).finally(() => setPendingId(null));
        }}
        disabled={disabled}
      >
        {isPending ? confirmLabel : children}
      </InteractiveButton>
      {isPending ? (
        <span role="status" aria-live="polite" className="text-xs text-amber-200">
          {confirmationText}
        </span>
      ) : null}
    </span>
  );
}

export type InteractiveRecordingMode = 'none' | 'audio' | 'webcam';

interface InteractiveTeacherDashboardProps extends InteractivePocControlsModel {
  view: 'setup' | 'review';
  lessonId: string;
  filePaths: string[];
  initialFile: string;
  recordingMode: InteractiveRecordingMode;
  isStartingRecording: boolean;
  onInitialFileChange: (filePath: string) => void;
  onRecordingModeChange: (mode: InteractiveRecordingMode) => void;
  onPrepareMaterials: () => void;
  onStartConfiguredRecording: () => void;
  onReturnToSetup: () => void;
  onPreviewCurrentDraft: () => void;
  onPreviewSelectedDraft: (recordingId: string) => void;
  onPreviewSelectedPublished: (recordingId: string) => void;
}

export function InteractiveTeacherDashboard(props: InteractiveTeacherDashboardProps) {
  const [pendingConfirmation, setPendingConfirmation] = useState<DestructiveActionId | null>(null);
  const {
    view,
    lessonId,
    filePaths,
    initialFile,
    recordingMode,
    isStartingRecording,
    onInitialFileChange,
    onRecordingModeChange,
    onPrepareMaterials,
    onStartConfiguredRecording,
    onReturnToSetup,
    onPreviewCurrentDraft,
    onPreviewSelectedDraft,
    onPreviewSelectedPublished,
    eventCount,
    draftStatus,
    currentDraftId,
    publishedStatus,
    publishedRecordingId,
    publishedError,
    recordingStorageSource,
    recordingDurationMs,
    playbackStatus,
    playheadMs,
    mediaStatus,
    mediaKind,
    mediaDurationMs,
    mediaError,
    mediaPreviewUrl,
    mediaMimeType,
    currentUser,
    canPublishAsTeacher,
    draftRecordings,
    publishedRecordings,
    selectedDraftId,
    selectedPublishedRecordingId,
    recordingLibraryStatus,
    exportStatus,
    importStatus,
    demoDataStatus,
    importPackageFileName,
    includeLearnerDeltasInExport,
    canStartRecording,
    canStartMediaRecording,
    canSaveDraft,
    canLoadDraft,
    canPreviewDraft,
    canDiscardDraft,
    canPublishRecording,
    canLoadPublishedRecording,
    canPreviewPublishedRecording,
    canDeleteSelectedDraft,
    canExportRecording,
    canImportRecordingPackage,
    canImportPublishedPackage,
    canSeedDemoData,
    canResetDemoData,
    onRefreshRecordingLibrary,
    onSelectDraftRecording,
    onSelectPublishedRecording,
    onSaveDraft,
    onLoadDraft,
    onDiscardDraft,
    onDeleteSelectedDraft,
    onPublishRecording,
    onLoadPublishedRecording,
    onToggleIncludeLearnerDeltasInExport,
    onSelectImportPackageFile,
    onExportRecording,
    onImportPackageAsDraft,
    onImportPackageAsPublished,
    onDemoSeed,
    onResetDemoData,
    onMediaElementRef,
  } = props;

  const canStartConfiguredRecording = recordingMode === 'none' ? canStartRecording : canStartMediaRecording;

  return (
    <section aria-labelledby="interactive-teacher-heading" className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="interactive-teacher-heading" className="m-0 text-base font-600 text-tk-text-primary">
            Teacher Studio
          </h2>
          <p className="m-0 text-xs text-tk-text-secondary">
            {view === 'review'
              ? 'Review the interactive editor timeline before saving or publishing.'
              : 'Prepare the lecture first, then enter a focused recording studio.'}
          </p>
        </div>
        <InteractiveStatusBadge
          tone={canPublishAsTeacher ? 'positive' : 'warning'}
          icon={canPublishAsTeacher ? 'i-ph-shield-check' : 'i-ph-warning'}
        >
          Publish identity: {canPublishAsTeacher ? 'teacher allowed' : 'teacher sign-in required'}
        </InteractiveStatusBadge>
      </div>

      {view === 'setup' ? (
        <InteractiveCard role="region" aria-label="Lecture setup" className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="m-0 flex items-center gap-2 text-sm font-600 text-tk-text-primary">
                <span aria-hidden="true" className="i-ph-presentation-chart-duotone text-lg text-tk-text-accent" />
                Lecture Setup
              </h3>
              <p className="mb-0 mt-1 text-xs text-tk-text-secondary">
                Current lesson: <strong className="text-tk-text-primary">{lessonId}</strong> · {filePaths.length} files
              </p>
            </div>
            <InteractiveStatusBadge>Recording status: inactive</InteractiveStatusBadge>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-500 text-tk-text-secondary">
              Initial file
              <select
                aria-label="Initial file"
                value={initialFile}
                onChange={(event) => onInitialFileChange(event.currentTarget.value)}
                className={interactiveSelectClassName}
              >
                {filePaths.map((filePath) => (
                  <option key={filePath} value={filePath}>
                    {filePath}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="grid gap-1.5 rounded-md border border-tk-border-primary p-2">
              <legend className="px-1 text-xs font-500 text-tk-text-secondary">Recording mode</legend>
              {([
                ['none', 'Editor only'],
                ['audio', 'Editor + microphone'],
                ['webcam', 'Editor + camera + microphone'],
              ] as const).map(([value, label]) => (
                <label key={value} className="inline-flex items-center gap-2 text-xs text-tk-text-primary">
                  <input
                    type="radio"
                    name="interactive-recording-mode"
                    value={value}
                    checked={recordingMode === value}
                    onChange={() => onRecordingModeChange(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          </div>

          <div className="rounded-md border border-dashed border-tk-border-primary bg-tk-background-primary p-2 text-xs text-tk-text-secondary">
            <strong className="text-tk-text-primary">Starting workspace</strong>
            <p className="mb-0 mt-1 line-clamp-2">{filePaths.join(', ') || 'No files available'}</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <InteractiveButton icon="i-ph-pencil-line" onClick={onPrepareMaterials}>
              Edit Materials
            </InteractiveButton>
            <InteractiveButton
              variant="primary"
              icon={isStartingRecording ? 'i-ph-spinner-gap' : 'i-ph-record-fill'}
              onClick={onStartConfiguredRecording}
              disabled={!canStartConfiguredRecording || isStartingRecording}
            >
              {isStartingRecording ? 'Preparing Recording Studio' : 'Start Recording'}
            </InteractiveButton>
            <InteractiveButton icon="i-ph-file-plus" variant="ghost" onClick={onDiscardDraft}>
              New Recording
            </InteractiveButton>
          </div>
        </InteractiveCard>
      ) : (
        <>
          <InteractiveCard aria-label="Recording complete" className="flex flex-wrap items-center justify-between gap-3 border-green-600/50 bg-green-950/15">
            <div>
              <h3 className="m-0 flex items-center gap-2 text-sm font-600 text-tk-text-primary">
                <span aria-hidden="true" className="i-ph-check-circle-fill text-lg text-green-400" />
                Recording complete
              </h3>
              <p className="mb-0 mt-1 text-xs text-tk-text-secondary">
                Duration: {recordingDurationMs} ms · Event count: {eventCount} · Media: {mediaKind}
              </p>
            </div>
            <InteractiveButton variant="ghost" icon="i-ph-arrow-left" onClick={onReturnToSetup}>
              Back to Lecture Setup
            </InteractiveButton>
          </InteractiveCard>

          <InteractiveEditorPlayer
            audience="teacher"
            title="Recording Review"
            description="The real editor replays the timestamped lecture events; it is not a screen video."
            model={props}
            onPlay={playbackStatus === 'paused' ? props.onContinuePlayback : onPreviewCurrentDraft}
            onPause={props.onPausePreviewPlayback}
          />
        </>
      )}

      <div aria-label="Teacher recording toolbar" className="flex flex-wrap items-center gap-1.5">
        <InteractiveButton icon="i-ph-floppy-disk" onClick={onSaveDraft} disabled={!canSaveDraft}>
          Save Draft
        </InteractiveButton>
        <InteractiveButton icon="i-ph-download-simple" onClick={() => onLoadDraft()} disabled={!canLoadDraft}>
          Load Draft
        </InteractiveButton>
        <InteractiveButton icon="i-ph-play" onClick={onPreviewCurrentDraft} disabled={!canPreviewDraft}>
          Preview Draft
        </InteractiveButton>
        <InteractiveButton icon="i-ph-upload-simple" onClick={onPublishRecording} disabled={!canPublishRecording}>
          Publish Recording
        </InteractiveButton>
        <InteractiveButton icon="i-ph-cloud-arrow-down" onClick={() => onLoadPublishedRecording()} disabled={!canLoadPublishedRecording}>
          Load Published Lesson
        </InteractiveButton>
        <InteractiveButton
          icon="i-ph-play-circle"
          onClick={() => onPreviewSelectedPublished(selectedPublishedRecordingId)}
          disabled={!canPreviewPublishedRecording}
        >
          Preview Published Lesson
        </InteractiveButton>
      </div>

      <div aria-live="polite" role="status" className="grid gap-2 rounded-md border border-tk-border-primary bg-tk-background-secondary p-2 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <strong className="text-tk-text-primary">Current draft</strong>
          <p className="m-0">Draft status: {draftStatus}</p>
          <p className="m-0 truncate text-tk-text-secondary" title={currentDraftId}>Current draft id: {currentDraftId}</p>
        </div>
        <div className="min-w-0">
          <strong className="text-tk-text-primary">Published lesson</strong>
          <p className="m-0 text-tk-text-secondary">Published status: {publishedStatus}</p>
          <p className="m-0 truncate text-tk-text-secondary" title={publishedRecordingId}>Published recording id: {publishedRecordingId}</p>
        </div>
        <div className="flex flex-wrap gap-x-3 text-tk-text-secondary sm:col-span-2">
          {view === 'setup' ? <span>Playback status: {playbackStatus}</span> : null}
          {view === 'setup' ? <span>Playhead ms: {playheadMs}</span> : null}
          <span>Media status: {mediaStatus}</span>
          <span>Media kind: {mediaKind}</span>
          <span>Media duration ms: {mediaDurationMs}</span>
          {publishedError !== 'none' ? <span className="text-red-300">Published error: {publishedError}</span> : null}
          {mediaError !== 'none' ? <span className="text-red-300">Media error: {mediaError}</span> : null}
        </div>
      </div>

      {view === 'setup' && mediaPreviewUrl && mediaKind === 'audio' ? (
        <audio
          className="h-9 max-w-full"
          aria-label="Recorded audio preview"
          controls
          preload="auto"
          src={mediaPreviewUrl}
          ref={onMediaElementRef}
        />
      ) : null}
      {view === 'setup' && mediaPreviewUrl && mediaKind === 'webcam' ? (
        <video
          className="pointer-events-none max-h-36 max-w-56 rounded-md border border-tk-border-primary"
          aria-label="Recorded webcam preview"
          playsInline
          preload="auto"
          src={mediaPreviewUrl}
          ref={onMediaElementRef}
        />
      ) : null}

      <details className={interactiveDetailsClassName}>
        <summary className={interactiveSummaryClassName}>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="i-ph-books-duotone text-base text-tk-text-accent" />
            Recording Library
            <InteractiveStatusBadge>{draftRecordings.length + publishedRecordings.length} recordings</InteractiveStatusBadge>
          </span>
          <span aria-hidden="true" className="i-ph-caret-down-bold transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid gap-3 border-t border-tk-border-primary pt-3 lg:grid-cols-2">
          <InteractiveCard className="grid gap-2 p-2">
            <InteractiveRecordingLibrary
              title="Local drafts"
              description="Stored in this browser with IndexedDB."
              emptyText="No local drafts saved yet."
              selectLabel="Select local draft"
              recordings={draftRecordings}
              selectedRecordingId={selectedDraftId}
              onSelectRecording={onSelectDraftRecording}
            />
            <div className="flex flex-wrap gap-1.5">
              <InteractiveButton icon="i-ph-download-simple" onClick={() => onLoadDraft(selectedDraftId)} disabled={!canLoadDraft}>
                Load Selected Draft
              </InteractiveButton>
              <InteractiveButton icon="i-ph-play" onClick={() => onPreviewSelectedDraft(selectedDraftId)} disabled={!canPreviewDraft}>
                Preview Selected Draft
              </InteractiveButton>
              <ConfirmActionButton
                id="delete-selected-draft"
                pendingId={pendingConfirmation}
                setPendingId={setPendingConfirmation}
                disabled={!canDeleteSelectedDraft}
                confirmLabel="Confirm Delete Selected Draft"
                confirmationText="Are you sure? This deletes the selected local draft from this browser."
                onConfirm={onDeleteSelectedDraft}
              >
                Delete Selected Draft
              </ConfirmActionButton>
            </div>
          </InteractiveCard>

          <InteractiveCard className="grid gap-2 p-2">
            <InteractiveRecordingLibrary
              title="Published Lessons"
              description="Loaded from the local demo backend."
              emptyText="No published lessons available yet."
              selectLabel="Select Published Lesson"
              recordings={publishedRecordings}
              selectedRecordingId={selectedPublishedRecordingId}
              onSelectRecording={onSelectPublishedRecording}
            />
            <div className="flex flex-wrap gap-1.5">
              <InteractiveButton
                icon="i-ph-download-simple"
                onClick={() => onLoadPublishedRecording(selectedPublishedRecordingId)}
                disabled={!canLoadPublishedRecording}
              >
                Load Selected Published Lesson
              </InteractiveButton>
              <InteractiveButton
                icon="i-ph-play"
                onClick={() => onPreviewSelectedPublished(selectedPublishedRecordingId)}
                disabled={!canPreviewPublishedRecording}
              >
                Preview Selected Published Lesson
              </InteractiveButton>
            </div>
          </InteractiveCard>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <InteractiveButton icon="i-ph-arrows-clockwise" variant="ghost" onClick={onRefreshRecordingLibrary}>
            Refresh Recordings
          </InteractiveButton>
          <ConfirmActionButton
            id="discard-draft"
            pendingId={pendingConfirmation}
            setPendingId={setPendingConfirmation}
            disabled={!canDiscardDraft}
            confirmLabel="Confirm Discard Draft"
            confirmationText="Are you sure? This clears the current draft from the workspace."
            onConfirm={onDiscardDraft}
          >
            Discard Draft
          </ConfirmActionButton>
          <ConfirmActionButton
            id="delete-draft"
            pendingId={pendingConfirmation}
            setPendingId={setPendingConfirmation}
            disabled={!canDeleteSelectedDraft}
            confirmLabel="Confirm Delete Draft"
            confirmationText="Are you sure? This deletes the selected local draft from this browser."
            onConfirm={onDeleteSelectedDraft}
          >
            Delete Draft
          </ConfirmActionButton>
        </div>
      </details>

      <details className={interactiveDetailsClassName}>
        <summary className={interactiveSummaryClassName}>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="i-ph-package-duotone text-base text-tk-text-accent" />
            Import, Export, and Demo Tools
          </span>
          <span aria-hidden="true" className="i-ph-caret-down-bold transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid gap-3 border-t border-tk-border-primary pt-3 lg:grid-cols-2">
          <InteractiveCard className="grid gap-2 p-2" aria-label="Recording package controls">
            <h3 className="m-0 text-sm font-600 text-tk-text-primary">Recording package</h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <InteractiveButton icon="i-ph-export" onClick={onExportRecording} disabled={!canExportRecording}>
                Export Package
              </InteractiveButton>
              <label className="inline-flex items-center gap-1.5 text-xs text-tk-text-secondary">
                <input
                  type="checkbox"
                  checked={includeLearnerDeltasInExport}
                  onChange={(event) => onToggleIncludeLearnerDeltasInExport(event.currentTarget.checked)}
                />
                Include My Learner Work
              </label>
            </div>
            <label
              htmlFor="interactive-recording-package-input"
              className="inline-flex min-h-8 w-fit cursor-pointer items-center gap-1.5 rounded-md border border-tk-border-brighter bg-tk-elements-secondaryButton-backgroundColor px-3 py-1.5 text-xs font-500 text-tk-elements-secondaryButton-textColor transition-colors hover:bg-tk-elements-secondaryButton-backgroundColorHover"
            >
              <span aria-hidden="true" className="i-ph-file-arrow-up text-base" />
              Import Package
              <input
                id="interactive-recording-package-input"
                aria-label="Import Package"
                role="button"
                type="file"
                accept="application/json,.json"
                onChange={(event) => onSelectImportPackageFile(event.currentTarget.files?.[0] ?? null)}
                className="sr-only"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              <InteractiveButton icon="i-ph-download" onClick={onImportPackageAsDraft} disabled={!canImportRecordingPackage}>
                Import as Draft
              </InteractiveButton>
              <InteractiveButton icon="i-ph-cloud-arrow-up" onClick={onImportPackageAsPublished} disabled={!canImportPublishedPackage}>
                Import as Published
              </InteractiveButton>
            </div>
            <div aria-live="polite" role="status" className="text-xs text-tk-text-secondary">
              <p className="m-0">Export Package status: {exportStatus}</p>
              <p className="m-0">Import Package status: {importStatus}</p>
              <p className="m-0">Import package file: {importPackageFileName}</p>
            </div>
          </InteractiveCard>

          <InteractiveCard className="grid content-start gap-2 p-2" aria-label="Demo data controls">
            <h3 className="m-0 text-sm font-600 text-tk-text-primary">Demo data</h3>
            <p className="m-0 text-xs text-tk-text-secondary">Create or remove only deterministic demo-prefixed records.</p>
            <div className="flex flex-wrap gap-1.5">
              <InteractiveButton icon="i-ph-sparkle" onClick={onDemoSeed} disabled={!canSeedDemoData}>
                Demo Seed
              </InteractiveButton>
              <ConfirmActionButton
                id="reset-demo-data"
                pendingId={pendingConfirmation}
                setPendingId={setPendingConfirmation}
                disabled={!canResetDemoData}
                confirmLabel="Confirm Reset Demo Data"
                confirmationText="Are you sure? This removes only demo-prefixed records."
                onConfirm={onResetDemoData}
              >
                Reset Demo Data
              </ConfirmActionButton>
            </div>
            <p aria-live="polite" role="status" className="m-0 text-xs text-tk-text-secondary">
              Demo data status: {demoDataStatus}
            </p>
          </InteractiveCard>
        </div>
      </details>

      <details className={interactiveDetailsClassName}>
        <summary className={interactiveSummaryClassName}>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="i-ph-code-duotone text-base" />
            Technical status
          </span>
          <span aria-hidden="true" className="i-ph-caret-down-bold transition-transform group-open:rotate-180" />
        </summary>
        <dl className="mb-0 mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-tk-border-primary pt-3 text-xs text-tk-text-secondary">
          <dt>Signed-in teacher</dt>
          <dd className="m-0">{currentUser ? `${currentUser.displayName} (${currentUser.role})` : 'signed out'}</dd>
          <dt>Recording library status</dt>
          <dd className="m-0">{recordingLibraryStatus}</dd>
          <dt>Recording storage source</dt>
          <dd className="m-0">{recordingStorageSource}</dd>
          <dt>Recording duration ms</dt>
          <dd className="m-0">{recordingDurationMs}</dd>
          <dt>Media MIME type</dt>
          <dd className="m-0">{mediaMimeType || 'none'}</dd>
          <dt>Media error</dt>
          <dd className="m-0">{mediaError}</dd>
        </dl>
      </details>
    </section>
  );
}
