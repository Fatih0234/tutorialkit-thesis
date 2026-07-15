import type { PythonRuntimeConfig } from '@tutorialkit/types';

export type PythonWorkerRequest =
  | {
      id: string;
      generation: number;
      type: 'initialize';
      config: PythonRuntimeConfig;
      interruptBuffer?: SharedArrayBuffer;
    }
  | { id: string; generation: number; type: 'sync-files'; addedOrModified: Record<string, string>; removed: string[] }
  | { id: string; generation: number; type: 'run'; entrypoint: string }
  | { id: string; generation: number; type: 'interrupt' }
  | { id: string; generation: number; type: 'reset' };

export type PythonWorkerEvent =
  | { type: 'ready' }
  | { type: 'stdout'; executionId: string; value: string }
  | { type: 'stderr'; executionId: string; value: string }
  | { type: 'started'; executionId: string; entrypoint: string }
  | { type: 'finished'; executionId: string; exitCode: number; durationMs: number }
  | { type: 'failed'; executionId: string; traceback: string; durationMs: number }
  | { type: 'interrupted'; executionId: string };

export type PythonWorkerMessage =
  | { kind: 'response'; id: string; generation: number; ok: true }
  | { kind: 'response'; id: string; generation: number; ok: false; error: string }
  | { kind: 'event'; generation: number; event: PythonWorkerEvent };
