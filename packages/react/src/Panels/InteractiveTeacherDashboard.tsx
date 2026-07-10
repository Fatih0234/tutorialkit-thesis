import { useEffect, useRef, useState, type ReactNode } from 'react';
import { classNames } from '../utils/classnames.js';
import { InteractiveRecordingLibrary } from './InteractiveRecordingLibrary.js';
import {
  InteractiveButton,
  InteractiveCard,
  InteractiveStatusBadge,
  formatInteractiveTime,
  interactiveDetailsClassName,
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

function useRecordingElapsedTime(isRecording: boolean) {
  const startedAtRef = useRef(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      startedAtRef.current = 0;
      setElapsedMs(0);
      return undefined;
    }

    startedAtRef.current = Date.now();
    const updateElapsedTime = () => setElapsedMs(Date.now() - startedAtRef.current);
    updateElapsedTime();
    const intervalId = window.setInterval(updateElapsedTime, 250);

    return () => window.clearInterval(intervalId);
  }, [isRecording]);

  return elapsedMs;
}

export function InteractiveTeacherDashboard(props: InteractivePocControlsModel) {
  const [pendingConfirmation, setPendingConfirmation] = useState<DestructiveActionId | null>(null);
  const recordingElapsedMs = useRecordingElapsedTime(props.isRecording);
  const {
    isRecording,
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
    canStopRecording,
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
    onStartRecording,
    onStartMicRecording,
    onStartCameraRecording,
    onStopRecording,
    onSaveDraft,
    onLoadDraft,
    onPreviewDraft,
    onDiscardDraft,
    onDeleteSelectedDraft,
    onPublishRecording,
    onLoadPublishedRecording,
    onPreviewPublishedRecording,
    onToggleIncludeLearnerDeltasInExport,
    onSelectImportPackageFile,
    onExportRecording,
    onImportPackageAsDraft,
    onImportPackageAsPublished,
    onDemoSeed,
    onResetDemoData,
    onMediaElementRef,
  } = props;

  const recordingStateLabel = isRecording
    ? 'Recording in progress'
    : playbackStatus === 'playing'
      ? 'Preview playing'
      : draftStatus === 'unsaved'
        ? 'Recording ready'
        : draftStatus === 'saved'
          ? 'Draft saved'
          : 'Ready to record';
  const recordingStateTone = isRecording ? 'negative' : draftStatus === 'saved' ? 'positive' : 'neutral';

  return (
    <section aria-labelledby="interactive-teacher-heading" className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="interactive-teacher-heading" className="m-0 text-base font-600 text-tk-text-primary">
            Teacher Studio
          </h2>
          <p className="m-0 text-xs text-tk-text-secondary">Capture editor actions, then save, preview, and publish.</p>
        </div>
        <InteractiveStatusBadge
          tone={canPublishAsTeacher ? 'positive' : 'warning'}
          icon={canPublishAsTeacher ? 'i-ph-shield-check' : 'i-ph-warning'}
        >
          Publish identity: {canPublishAsTeacher ? 'teacher allowed' : 'teacher sign-in required'}
        </InteractiveStatusBadge>
      </div>

      <InteractiveCard
        aria-label="Recording session"
        className={classNames(
          'relative overflow-hidden p-0',
          isRecording ? 'border-red-500 bg-red-950/20' : 'border-tk-border-primary',
        )}
      >
        {isRecording ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-red-500" /> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className={classNames(
                'grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg',
                isRecording ? 'animate-pulse bg-red-600 text-white' : 'bg-tk-background-active text-tk-text-secondary',
              )}
            >
              <span className={isRecording ? 'i-ph-record-fill' : 'i-ph-record-duotone'} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong className={classNames('text-sm', isRecording ? 'text-red-200' : 'text-tk-text-primary')}>
                  {recordingStateLabel}
                </strong>
                <InteractiveStatusBadge tone={recordingStateTone}>
                  Recording status: {isRecording ? 'active' : 'inactive'}
                </InteractiveStatusBadge>
              </div>
              <div aria-live="polite" role="status" className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-tk-text-secondary">
                <span>Elapsed: {formatInteractiveTime(isRecording ? recordingElapsedMs : recordingDurationMs)}</span>
                <span>Event count: {eventCount}</span>
                <span>Draft status: {draftStatus}</span>
                <span>Media status: {mediaStatus}</span>
                <span>Media kind: {mediaKind}</span>
                <span>Media duration ms: {mediaDurationMs}</span>
              </div>
            </div>
          </div>

          {isRecording ? (
            <InteractiveButton variant="danger" icon="i-ph-stop-fill" onClick={onStopRecording} disabled={!canStopRecording}>
              Stop Recording
            </InteractiveButton>
          ) : null}
        </div>
      </InteractiveCard>

      <div aria-label="Teacher recording toolbar" className="flex flex-wrap items-center gap-1.5">
        <InteractiveButton icon="i-ph-file-plus" variant="ghost" onClick={onDiscardDraft} disabled={isRecording}>
          New Recording
        </InteractiveButton>
        <InteractiveButton icon="i-ph-record" variant="primary" onClick={onStartRecording} disabled={!canStartRecording}>
          Record Timeline Only
        </InteractiveButton>
        <InteractiveButton icon="i-ph-microphone" onClick={onStartMicRecording} disabled={!canStartMediaRecording}>
          Record With Mic
        </InteractiveButton>
        <InteractiveButton icon="i-ph-video-camera" onClick={onStartCameraRecording} disabled={!canStartMediaRecording}>
          Record With Camera
        </InteractiveButton>
        {!isRecording ? (
          <InteractiveButton variant="danger" icon="i-ph-stop" onClick={onStopRecording} disabled={!canStopRecording}>
            Stop Recording
          </InteractiveButton>
        ) : null}
        <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-tk-border-primary" />
        <InteractiveButton icon="i-ph-floppy-disk" onClick={onSaveDraft} disabled={!canSaveDraft}>
          Save Draft
        </InteractiveButton>
        <InteractiveButton icon="i-ph-download-simple" onClick={() => onLoadDraft()} disabled={!canLoadDraft}>
          Load Draft
        </InteractiveButton>
        <InteractiveButton icon="i-ph-play" onClick={() => onPreviewDraft()} disabled={!canPreviewDraft}>
          Preview Draft
        </InteractiveButton>
        <InteractiveButton icon="i-ph-upload-simple" onClick={onPublishRecording} disabled={!canPublishRecording}>
          Publish Recording
        </InteractiveButton>
        <InteractiveButton icon="i-ph-cloud-arrow-down" onClick={() => onLoadPublishedRecording()} disabled={!canLoadPublishedRecording}>
          Load Published Lesson
        </InteractiveButton>
        <InteractiveButton icon="i-ph-play-circle" onClick={() => onPreviewPublishedRecording()} disabled={!canPreviewPublishedRecording}>
          Preview Published Lesson
        </InteractiveButton>
      </div>

      <div aria-live="polite" role="status" className="grid gap-2 rounded-md border border-tk-border-primary bg-tk-background-secondary p-2 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <strong className="text-tk-text-primary">Current draft</strong>
          <p className="m-0 truncate text-tk-text-secondary" title={currentDraftId}>
            Current draft id: {currentDraftId}
          </p>
        </div>
        <div className="min-w-0">
          <strong className="text-tk-text-primary">Published lesson</strong>
          <p className="m-0 text-tk-text-secondary">Published status: {publishedStatus}</p>
          <p className="m-0 truncate text-tk-text-secondary" title={publishedRecordingId}>
            Published recording id: {publishedRecordingId}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 text-tk-text-secondary sm:col-span-2">
          <span>Playback status: {playbackStatus}</span>
          <span>Playhead ms: {playheadMs}</span>
          {publishedError !== 'none' ? <span className="text-red-300">Published error: {publishedError}</span> : null}
          {mediaError !== 'none' ? <span className="text-red-300">Media error: {mediaError}</span> : null}
        </div>
      </div>

      {mediaPreviewUrl && mediaKind === 'audio' ? (
        <audio className="h-9 max-w-full" aria-label="Recorded audio preview" controls preload="auto" src={mediaPreviewUrl} ref={onMediaElementRef} />
      ) : null}
      {mediaPreviewUrl && mediaKind === 'webcam' ? (
        <video
          className="max-h-40 max-w-64 rounded-md border border-tk-border-primary"
          aria-label="Recorded webcam preview"
          controls
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
              <InteractiveButton icon="i-ph-play" onClick={() => onPreviewDraft(selectedDraftId)} disabled={!canPreviewDraft}>
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
                onClick={() => onPreviewPublishedRecording(selectedPublishedRecordingId)}
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
