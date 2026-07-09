import type { InteractivePocControlsModel } from './useInteractivePoc.js';

export function InteractiveAuthoringPanel({
  isRecording,
  eventCount,
  draftStatus,
  currentDraftId,
  recordingDurationMs,
  mediaStatus,
  mediaKind,
  mediaDurationMs,
  mediaError,
  mediaPreviewUrl,
  mediaMimeType,
  canStartRecording,
  canStartMediaRecording,
  canStopRecording,
  canSaveDraft,
  canLoadDraft,
  canPreviewDraft,
  canDiscardDraft,
  onStartRecording,
  onStartMicRecording,
  onStartCameraRecording,
  onStopRecording,
  onSaveDraft,
  onLoadDraft,
  onPreviewDraft,
  onDiscardDraft,
  onMediaElementRef,
}: InteractivePocControlsModel) {
  return (
    <div
      aria-label="Interactive local authoring controls"
      style={{
        alignItems: 'center',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
      }}
    >
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
      <button type="button" onClick={onLoadDraft} disabled={!canLoadDraft}>
        Load Draft
      </button>
      <button type="button" onClick={onPreviewDraft} disabled={!canPreviewDraft}>
        Preview Draft
      </button>
      <button type="button" onClick={onDiscardDraft} disabled={!canDiscardDraft}>
        Discard Draft
      </button>
      <span>Draft status: {draftStatus}</span>
      <span>Current draft id: {currentDraftId}</span>
      <span>Recording duration ms: {recordingDurationMs}</span>
      <span>Recording status: {isRecording ? 'active' : 'inactive'}</span>
      <span>Event count: {eventCount}</span>
      <span>Media status: {mediaStatus}</span>
      <span>Media kind: {mediaKind}</span>
      <span>Media duration ms: {mediaDurationMs}</span>
      <span>Media mime type: {mediaMimeType || 'none'}</span>
      <span>Media error: {mediaError}</span>
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
          style={{ maxHeight: '6rem', maxWidth: '10rem' }}
        />
      ) : null}
    </div>
  );
}
