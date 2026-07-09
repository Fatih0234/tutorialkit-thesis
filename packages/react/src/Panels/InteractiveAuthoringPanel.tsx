import type { InteractivePocControlsModel } from './useInteractivePoc.js';

export function InteractiveAuthoringPanel({
  isRecording,
  eventCount,
  draftStatus,
  currentDraftId,
  recordingDurationMs,
  canStartRecording,
  canStopRecording,
  canSaveDraft,
  canLoadDraft,
  canPreviewDraft,
  canDiscardDraft,
  onStartRecording,
  onStopRecording,
  onSaveDraft,
  onLoadDraft,
  onPreviewDraft,
  onDiscardDraft,
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
        Start Recording
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
    </div>
  );
}
