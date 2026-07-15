import { LiveRuntimeSession } from './live-runtime-session.js';

export const EDITOR_BATCH_DELAY_MS = 175;

interface DelayedRuntimeRunOptions {
  session: LiveRuntimeSession;
  generation: number;
  isTeacherPlayback: () => boolean;
  onExecution: () => void;
  run: () => Promise<void>;
}

/** Flush the editor batch, then revalidate the live session before execution. */
export async function runAfterEditorBatch({
  session,
  generation,
  isTeacherPlayback,
  onExecution,
  run,
}: DelayedRuntimeRunOptions): Promise<boolean> {
  await new Promise<void>((resolve) => setTimeout(resolve, EDITOR_BATCH_DELAY_MS));

  if (isTeacherPlayback() || !session.isCurrent(generation)) {
    return false;
  }

  onExecution();
  await run();

  return true;
}
