import { classNames } from '../utils/classnames.js';
import {
  InteractiveStatusBadge,
  interactiveDetailsClassName,
  interactiveSelectClassName,
  interactiveSummaryClassName,
} from './InteractivePocUi.js';
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
  compact?: boolean;
}

export function InteractiveRecordingLibrary({
  title,
  description,
  emptyText,
  selectLabel,
  recordings,
  selectedRecordingId,
  onSelectRecording,
  compact = false,
}: InteractiveRecordingLibraryProps) {
  const selectedId = selectedRecordingId || recordings[0]?.id || '';
  const headingId = `${selectLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`;

  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      <div>
        <h3 id={headingId} className="m-0 flex items-center gap-1.5 text-sm font-600 text-tk-text-primary">
          <span
            aria-hidden="true"
            className={classNames(compact ? 'i-ph-books-duotone' : 'i-ph-folder-open-duotone', 'text-base text-tk-text-accent')}
          />
          {title}
        </h3>
        <p className="m-0 text-xs text-tk-text-secondary">{description}</p>
      </div>
      {recordings.length > 0 ? (
        <>
          <label className="grid gap-1 text-xs font-500 text-tk-text-secondary">
            <span>{selectLabel}</span>
            <select
              className={interactiveSelectClassName}
              value={selectedId}
              onChange={(event) => onSelectRecording(event.currentTarget.value)}
            >
              {recordings.map((recording) => (
                <option key={`${recording.source}-${recording.id}`} value={recording.id}>
                  {recording.id} · {recording.lessonId} · {recording.mediaKind}
                </option>
              ))}
            </select>
          </label>
          {!compact ? (
            <ul className="m-0 grid max-h-64 list-none gap-2 overflow-y-auto p-0 pr-1">
              {recordings.map((recording) => {
                const isSelected = recording.id === selectedId;

                return (
                  <li
                    key={`${recording.source}-${recording.id}`}
                    aria-current={isSelected ? 'true' : undefined}
                    className={classNames(
                      'rounded-md border p-2 transition-colors',
                      isSelected
                        ? 'border-tk-border-accent bg-tk-background-active'
                        : 'border-tk-border-primary bg-tk-background-primary',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <strong className="min-w-0 break-all text-xs text-tk-text-primary">{recording.id}</strong>
                      <div className="flex flex-wrap gap-1">
                        <InteractiveStatusBadge icon="i-ph-clock">
                          {formatDuration(recording.durationMs)}
                        </InteractiveStatusBadge>
                        <InteractiveStatusBadge icon="i-ph-list-bullets">
                          {recording.eventCount} events
                        </InteractiveStatusBadge>
                        <InteractiveStatusBadge icon={recording.mediaKind === 'none' ? 'i-ph-waveform-slash' : 'i-ph-waveform'}>
                          {recording.mediaKind}
                        </InteractiveStatusBadge>
                      </div>
                    </div>
                    <p className="mb-0 mt-1 text-xs text-tk-text-secondary">
                      {recording.source === 'draft' ? 'Local draft' : 'Published Lesson'} · {recording.lessonId} · version{' '}
                      {recording.version}
                    </p>
                    {recording.workStatus ? (
                      <p className="mb-0 mt-1 text-xs text-tk-text-secondary">Work: {recording.workStatus}</p>
                    ) : null}
                    <details className={classNames(interactiveDetailsClassName, 'mt-2 border-0 bg-transparent p-0 shadow-none')}>
                      <summary className={classNames(interactiveSummaryClassName, 'text-xs text-tk-text-secondary')}>
                        Debug details
                        <span aria-hidden="true" className="i-ph-caret-down-bold transition-transform group-open:rotate-180" />
                      </summary>
                      <dl className="mb-0 mt-2 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs text-tk-text-secondary">
                        <dt>Created</dt>
                        <dd className="m-0">{formatDate(recording.startedAt)}</dd>
                        <dt>Published</dt>
                        <dd className="m-0">{recording.publishedAt ? formatDate(recording.publishedAt) : 'none'}</dd>
                        <dt>Owner</dt>
                        <dd className="m-0 break-all">{recording.ownerUserId ?? 'unknown'}</dd>
                        <dt>Created by</dt>
                        <dd className="m-0 break-all">{recording.createdByUserId ?? 'unknown'}</dd>
                        <dt>Published by</dt>
                        <dd className="m-0 break-all">{recording.publishedByUserId ?? 'none'}</dd>
                      </dl>
                    </details>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      ) : (
        <div className="rounded-md border border-dashed border-tk-border-primary bg-tk-background-primary p-3 text-center text-xs text-tk-text-secondary">
          {emptyText}
        </div>
      )}
    </section>
  );
}
