import type { RuntimeCapabilities } from '@tutorialkit/runtime';
import type { RuntimeStatus } from './useLessonRuntime.js';

interface Props {
  capabilities?: RuntimeCapabilities;
  status: RuntimeStatus;
  error: string;
  disabled?: boolean;
  onRun: () => void;
  onStop: () => void;
  onReset: () => void;
  onClear: () => void;
}

export function RuntimeControls({ capabilities, status, error, disabled, onRun, onStop, onReset, onClear }: Props) {
  const busy = status === 'initializing' || status === 'resetting' || status === 'stopping';
  return (
    <div
      className="flex items-center gap-2 border-b border-tk-elements-app-borderColor px-3 py-2"
      aria-label="Python execution controls"
    >
      <button
        type="button"
        className="rounded bg-green-700 px-3 py-1 text-sm text-white disabled:opacity-50"
        disabled={disabled || busy || status === 'running' || status === 'failed'}
        onClick={onRun}
      >
        Run
      </button>
      {capabilities?.interrupt ? (
        <button
          type="button"
          className="rounded bg-red-700 px-3 py-1 text-sm text-white disabled:opacity-50"
          disabled={disabled || status !== 'running'}
          onClick={onStop}
        >
          Stop
        </button>
      ) : null}
      <button
        type="button"
        className="rounded border px-3 py-1 text-sm disabled:opacity-50"
        disabled={disabled || busy}
        onClick={onReset}
      >
        Reset runtime
      </button>
      <button type="button" className="rounded border px-3 py-1 text-sm" onClick={onClear}>
        Clear console
      </button>
      <span className="text-xs" role="status">
        {status === 'initializing'
          ? 'Initializing Python'
          : status === 'failed'
            ? `Failed to initialize: ${error}`
            : status}
      </span>
    </div>
  );
}
