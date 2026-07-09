import type { InteractiveRecordingLibraryItem } from './useInteractivePoc.js';

function formatDuration(durationMs: number) {
  if (!durationMs) {
    return '0.0s';
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatDate(value: string) {
  if (!value) {
    return 'unknown';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

interface InteractiveRecordingLibraryProps {
  title: string;
  description: string;
  emptyText: string;
  selectLabel: string;
  recordings: InteractiveRecordingLibraryItem[];
  selectedRecordingId: string;
  onSelectRecording: (recordingId: string) => void;
}

export function InteractiveRecordingLibrary({
  title,
  description,
  emptyText,
  selectLabel,
  recordings,
  selectedRecordingId,
  onSelectRecording,
}: InteractiveRecordingLibraryProps) {
  const selectedId = selectedRecordingId || recordings[0]?.id || '';
  const headingId = `${selectLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`;

  return (
    <section aria-labelledby={headingId} style={{ display: 'grid', gap: '0.5rem' }}>
      <div>
        <h3 id={headingId} style={{ margin: 0 }}>
          {title}
        </h3>
        <p style={{ margin: 0 }}>{description}</p>
      </div>
      {recordings.length > 0 ? (
        <>
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span>{selectLabel}</span>
            <select value={selectedId} onChange={(event) => onSelectRecording(event.currentTarget.value)}>
              {recordings.map((recording) => (
                <option key={`${recording.source}-${recording.id}`} value={recording.id}>
                  {recording.id} · {recording.lessonId} · {recording.mediaKind}
                </option>
              ))}
            </select>
          </label>
          <ul style={{ display: 'grid', gap: '0.5rem', listStyle: 'none', margin: 0, padding: 0 }}>
            {recordings.map((recording) => (
              <li
                key={`${recording.source}-${recording.id}`}
                aria-current={recording.id === selectedId ? 'true' : undefined}
                style={{
                  border: '1px solid var(--tk-elements-panel-borderColor)',
                  borderRadius: '0.375rem',
                  padding: '0.5rem',
                }}
              >
                <strong>{recording.id}</strong>
                <dl
                  style={{
                    display: 'grid',
                    gap: '0.25rem 0.75rem',
                    gridTemplateColumns: 'max-content minmax(0, 1fr)',
                    margin: '0.5rem 0 0',
                  }}
                >
                  <dt>Lesson</dt>
                  <dd style={{ margin: 0 }}>{recording.lessonId}</dd>
                  <dt>Version</dt>
                  <dd style={{ margin: 0 }}>{recording.version}</dd>
                  <dt>Media</dt>
                  <dd style={{ margin: 0 }}>{recording.mediaKind}</dd>
                  <dt>Duration</dt>
                  <dd style={{ margin: 0 }}>{formatDuration(recording.durationMs)}</dd>
                  <dt>Events</dt>
                  <dd style={{ margin: 0 }}>{recording.eventCount}</dd>
                  <dt>Source</dt>
                  <dd style={{ margin: 0 }}>{recording.source}</dd>
                  <dt>Created</dt>
                  <dd style={{ margin: 0 }}>{formatDate(recording.startedAt)}</dd>
                  {recording.workStatus ? (
                    <>
                      <dt>Work</dt>
                      <dd style={{ margin: 0 }}>{recording.workStatus}</dd>
                    </>
                  ) : null}
                </dl>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>{emptyText}</p>
      )}
    </section>
  );
}
