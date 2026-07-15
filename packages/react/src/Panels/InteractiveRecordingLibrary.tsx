import { classNames } from '../utils/classnames.js';
import { InteractiveButton, InteractiveStatusBadge } from './InteractivePocUi.js';
import type { InteractiveRecordingLibraryItem } from './useInteractivePoc.js';

function formatDuration(durationMs: number) {
  if (!durationMs) return 'Under a minute';
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}s`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function lessonTitle(lessonId: string) {
  const segment = lessonId.split('/').filter(Boolean).at(-1) ?? lessonId;
  return segment.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

interface InteractiveRecordingLibraryProps {
  title: string;
  description: string;
  emptyText: string;
  recordings: InteractiveRecordingLibraryItem[];
  actionLabel: string;
  actionIcon?: string;
  onOpenRecording: (recordingId: string) => void;
  onDeleteRecording?: (recordingId: string) => void;
  canDeleteRecording?: (recording: InteractiveRecordingLibraryItem) => boolean;
  deletingRecordingId?: string;
  deleteLabel?: string;
  deleteConfirmationText?: string;
}

export function InteractiveRecordingLibrary({
  title,
  description,
  emptyText,
  recordings,
  actionLabel,
  actionIcon = 'i-ph-arrow-right',
  onOpenRecording,
  onDeleteRecording,
  canDeleteRecording,
  deletingRecordingId,
  deleteLabel = 'Draft',
  deleteConfirmationText,
}: InteractiveRecordingLibraryProps) {
  const headingId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`;

  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <div>
        <h3 id={headingId} className="m-0 text-sm font-600 text-tk-text-primary">{title}</h3>
        <p className="mb-0 mt-1 text-xs text-tk-text-secondary">{description}</p>
      </div>
      {recordings.length ? (
        <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
          {recordings.map((recording) => {
            const date = formatDate(recording.publishedAt || recording.startedAt);
            const isConfirmingDelete = deletingRecordingId === recording.id;
            return (
              <li key={`${recording.source}-${recording.id}`} className="grid gap-3 rounded-lg border border-tk-border-primary bg-tk-background-primary p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm text-tk-text-primary">{lessonTitle(recording.lessonId)}</strong>
                    <p className="mb-0 mt-1 text-xs text-tk-text-secondary">
                      {recording.source === 'draft' ? 'Draft' : 'Published'}{date ? ` · ${date}` : ''}
                    </p>
                    {recording.workStatus ? <p className="mb-0 mt-1 text-xs text-tk-text-secondary">{recording.workStatus}</p> : null}
                  </div>
                  <InteractiveStatusBadge icon="i-ph-clock">{formatDuration(recording.durationMs)}</InteractiveStatusBadge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <InteractiveButton variant="primary" icon={actionIcon} onClick={() => onOpenRecording(recording.id)}>
                    {actionLabel}
                  </InteractiveButton>
                  {onDeleteRecording && (canDeleteRecording?.(recording) ?? true) ? (
                    <InteractiveButton
                      variant={isConfirmingDelete ? 'danger' : 'ghost'}
                      icon={isConfirmingDelete ? 'i-ph-warning' : 'i-ph-trash'}
                      aria-label={isConfirmingDelete ? `Confirm delete ${lessonTitle(recording.lessonId)} ${deleteLabel}` : `Delete ${lessonTitle(recording.lessonId)} ${deleteLabel}`}
                      onClick={() => onDeleteRecording(recording.id)}
                      className={classNames(isConfirmingDelete && 'font-600')}
                    >
                      {isConfirmingDelete ? 'Confirm Delete' : 'Delete'}
                    </InteractiveButton>
                  ) : null}
                  {isConfirmingDelete && deleteConfirmationText ? <span role="status" className="text-xs text-amber-200">{deleteConfirmationText}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-tk-border-primary bg-tk-background-primary p-4 text-center text-xs text-tk-text-secondary">
          {emptyText}
        </div>
      )}
    </section>
  );
}
