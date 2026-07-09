import { InteractiveRecordingLibrary } from './InteractiveRecordingLibrary.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

export function InteractiveTeacherDashboard(props: InteractivePocControlsModel) {
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
    draftRecordings,
    publishedRecordings,
    selectedDraftId,
    selectedPublishedRecordingId,
    recordingLibraryStatus,
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
    onMediaElementRef,
  } = props;

  return (
    <section aria-labelledby="interactive-teacher-heading" style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h2 id="interactive-teacher-heading" style={{ margin: 0 }}>
          Teacher dashboard
        </h2>
        <p style={{ margin: 0 }}>Record, save, preview, and publish an interactive lesson timeline.</p>
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
          Load Published Recording
        </button>
        <button type="button" onClick={() => onPreviewPublishedRecording()} disabled={!canPreviewPublishedRecording}>
          Preview Published Recording
        </button>
        <button type="button" onClick={onDiscardDraft} disabled={!canDiscardDraft}>
          Discard Draft
        </button>
        <button type="button" onClick={onDeleteSelectedDraft} disabled={!canDeleteSelectedDraft}>
          Delete Draft
        </button>
        <button type="button" onClick={onRefreshRecordingLibrary}>
          Refresh Recordings
        </button>
      </div>

      <div aria-live="polite" role="status" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <span>Draft status: {draftStatus}</span>
        <span>Current draft id: {currentDraftId}</span>
        <span>Published status: {publishedStatus}</span>
        <span>Published recording id: {publishedRecordingId}</span>
        <span>Published error: {publishedError}</span>
        <span>Recording library status: {recordingLibraryStatus}</span>
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
            <button type="button" onClick={onDeleteSelectedDraft} disabled={!canDeleteSelectedDraft}>
              Delete Selected Draft
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <InteractiveRecordingLibrary
            title="Published recordings"
            description="Published recordings are loaded from the local dev backend."
            emptyText="No published recordings available yet."
            selectLabel="Select published recording"
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
              Load Selected Published
            </button>
            <button
              type="button"
              onClick={() => onPreviewPublishedRecording(selectedPublishedRecordingId)}
              disabled={!canPreviewPublishedRecording}
            >
              Preview Selected Published
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
