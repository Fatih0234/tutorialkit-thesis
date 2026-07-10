import { InteractiveButton, InteractiveStatusBadge } from './InteractivePocUi.js';

interface InteractiveMaterialPreparationProps {
  lessonId: string;
  fileCount: number;
  selectedFile: string;
  onDone: () => void;
  onStartRecording?: () => void;
  isStartingRecording?: boolean;
}

export function InteractiveMaterialPreparation({
  lessonId,
  fileCount,
  selectedFile,
  onDone,
  onStartRecording,
  isStartingRecording = false,
}: InteractiveMaterialPreparationProps) {
  return (
    <header
      aria-label="Material preparation controls"
      className="shrink-0 border-b border-tk-elements-app-borderColor bg-tk-background-primary px-3 py-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="m-0 flex items-center gap-2 text-sm font-600 text-tk-text-primary">
            <span aria-hidden="true" className="i-ph-pencil-line-duotone text-lg text-tk-text-accent" />
            Preparing Lecture Materials
          </h1>
          <p className="m-0 truncate text-xs text-tk-text-secondary">
            {lessonId} · {fileCount} files · Selected: {selectedFile || 'automatic'} · Recording is off
          </p>
        </div>
        <div className="flex items-center gap-2">
          <InteractiveStatusBadge tone="positive">No recording in progress</InteractiveStatusBadge>
          <InteractiveButton variant="ghost" icon="i-ph-arrow-left" onClick={onDone}>
            Exit Preparation
          </InteractiveButton>
          {onStartRecording ? (
            <InteractiveButton variant="primary" icon={isStartingRecording ? 'i-ph-spinner-gap' : 'i-ph-record-fill'} onClick={onStartRecording} disabled={isStartingRecording}>
              {isStartingRecording ? 'Opening Studio' : 'Start Recording'}
            </InteractiveButton>
          ) : null}
        </div>
      </div>
    </header>
  );
}
