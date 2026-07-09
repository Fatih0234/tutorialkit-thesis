import { useState, type ReactNode } from 'react';
import { InteractiveRecordingLibrary } from './InteractiveRecordingLibrary.js';
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
      <button
        type="button"
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
      </button>
      {isPending ? (
        <span role="status" aria-live="polite">
          {confirmationText}
        </span>
      ) : null}
    </span>
  );
}

export function InteractiveTeacherDashboard(props: InteractivePocControlsModel) {
  const [pendingConfirmation, setPendingConfirmation] = useState<DestructiveActionId | null>(null);
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

  return (
    <section aria-labelledby="interactive-teacher-heading" style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h2 id="interactive-teacher-heading" style={{ margin: 0 }}>
          Teacher Studio
        </h2>
        <p style={{ margin: 0 }}>Record, save, preview, publish, export, and import interactive lesson recordings.</p>
        <p style={{ margin: 0 }}>
          Signed-in teacher: {currentUser ? `${currentUser.displayName} (${currentUser.role})` : 'signed out'}
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button type="button" onClick={onDiscardDraft} disabled={isRecording}>
          New Recording
        </button>
        <button type="button" onClick={onStartRecording} disabled={!canStartRecording}>
          Record Timeline Only
        </button>
        <button type="button" onClick={onStartMicRecording} disabled={!canStartMediaRecording}>
          Record With Mic
        </button>
        <button type="button" onClick={onStartCameraRecording} disabled={!canStartMediaRecording}>
          Record With Camera
        </button>
        <button type="button" onClick={onStopRecording} disabled={!canStopRecording}>
          Stop Recording
        </button>
        <button type="button" onClick={onSaveDraft} disabled={!canSaveDraft}>
          Save Draft
        </button>
        <button type="button" onClick={() => onLoadDraft()} disabled={!canLoadDraft}>
          Load Draft
        </button>
        <button type="button" onClick={() => onPreviewDraft()} disabled={!canPreviewDraft}>
          Preview Draft
        </button>
        <button type="button" onClick={onPublishRecording} disabled={!canPublishRecording}>
          Publish Recording
        </button>
        <button type="button" onClick={() => onLoadPublishedRecording()} disabled={!canLoadPublishedRecording}>
          Load Published Lesson
        </button>
        <button type="button" onClick={() => onPreviewPublishedRecording()} disabled={!canPreviewPublishedRecording}>
          Preview Published Lesson
        </button>
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
        <button type="button" onClick={onRefreshRecordingLibrary}>
          Refresh Recordings
        </button>
      </div>

      <div aria-label="Recording package and demo controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button type="button" onClick={onExportRecording} disabled={!canExportRecording}>
          Export Package
        </button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <input
            type="checkbox"
            checked={includeLearnerDeltasInExport}
            onChange={(event) => onToggleIncludeLearnerDeltasInExport(event.currentTarget.checked)}
          />
          Include My Learner Work
        </label>
        <label htmlFor="interactive-recording-package-input" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          Import Package
        </label>
        <input
          id="interactive-recording-package-input"
          aria-label="Import Package"
          type="file"
          accept="application/json,.json"
          onChange={(event) => onSelectImportPackageFile(event.currentTarget.files?.[0] ?? null)}
          style={{ display: 'none' }}
        />
        <button type="button" onClick={onImportPackageAsDraft} disabled={!canImportRecordingPackage}>
          Import as Draft
        </button>
        <button type="button" onClick={onImportPackageAsPublished} disabled={!canImportPublishedPackage}>
          Import as Published
        </button>
        <button type="button" onClick={onDemoSeed} disabled={!canSeedDemoData}>
          Demo Seed
        </button>
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

      <div aria-live="polite" role="status" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <span>Draft status: {draftStatus}</span>
        <span>Current draft id: {currentDraftId}</span>
        <span>Published status: {publishedStatus}</span>
        <span>Published recording id: {publishedRecordingId}</span>
        <span>Published error: {publishedError}</span>
        <span>Recording library status: {recordingLibraryStatus}</span>
        <span>Export Package status: {exportStatus}</span>
        <span>Import Package status: {importStatus}</span>
        <span>Import package file: {importPackageFileName}</span>
        <span>Demo data status: {demoDataStatus}</span>
        <span>Recording storage source: {recordingStorageSource}</span>
        <span>Recording duration ms: {recordingDurationMs}</span>
        <span>Recording status: {isRecording ? 'active' : 'inactive'}</span>
        <span>Playback status: {playbackStatus}</span>
        <span>Playhead ms: {playheadMs}</span>
        <span>Event count: {eventCount}</span>
        <span>Media status: {mediaStatus}</span>
        <span>Media kind: {mediaKind}</span>
        <span>Media duration ms: {mediaDurationMs}</span>
        <span>Media mime type: {mediaMimeType || 'none'}</span>
        <span>Media error: {mediaError}</span>
        <span>Publish identity: {canPublishAsTeacher ? 'teacher allowed' : 'teacher sign-in required'}</span>
      </div>

      {mediaPreviewUrl && mediaKind === 'audio' ? (
        <audio aria-label="Recorded audio preview" controls preload="auto" src={mediaPreviewUrl} ref={onMediaElementRef} />
      ) : null}
      {mediaPreviewUrl && mediaKind === 'webcam' ? (
        <video
          aria-label="Recorded webcam preview"
          controls
          playsInline
          preload="auto"
          src={mediaPreviewUrl}
          ref={onMediaElementRef}
          style={{ maxHeight: '8rem', maxWidth: '14rem' }}
        />
      ) : null}

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))' }}>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <InteractiveRecordingLibrary
            title="Local drafts"
            description="Drafts are stored in this browser with IndexedDB."
            emptyText="No local drafts saved yet."
            selectLabel="Select local draft"
            recordings={draftRecordings}
            selectedRecordingId={selectedDraftId}
            onSelectRecording={onSelectDraftRecording}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" onClick={() => onLoadDraft(selectedDraftId)} disabled={!canLoadDraft}>
              Load Selected Draft
            </button>
            <button type="button" onClick={() => onPreviewDraft(selectedDraftId)} disabled={!canPreviewDraft}>
              Preview Selected Draft
            </button>
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
        </div>

        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <InteractiveRecordingLibrary
            title="Published Lessons"
            description="Published lessons are loaded from the local demo backend."
            emptyText="No published lessons available yet."
            selectLabel="Select Published Lesson"
            recordings={publishedRecordings}
            selectedRecordingId={selectedPublishedRecordingId}
            onSelectRecording={onSelectPublishedRecording}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => onLoadPublishedRecording(selectedPublishedRecordingId)}
              disabled={!canLoadPublishedRecording}
            >
              Load Selected Published Lesson
            </button>
            <button
              type="button"
              onClick={() => onPreviewPublishedRecording(selectedPublishedRecordingId)}
              disabled={!canPreviewPublishedRecording}
            >
              Preview Selected Published Lesson
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
