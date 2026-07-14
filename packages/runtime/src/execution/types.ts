import type { RuntimeConfig } from '@tutorialkit/types';

export type RuntimeProvider = RuntimeConfig['provider'];

export interface RuntimeCapabilities {
  terminal: boolean;
  stdin: boolean;
  packages: boolean;
  webPreview: boolean;
  testing: boolean;
  interrupt: boolean;
}

export interface RuntimeFileDiff {
  addedOrModified: Record<string, string>;
  removed: string[];
}

export interface RunRequest {
  entrypoint?: string;
  files: Record<string, string>;
}

export type RuntimeEvent =
  | { type: 'ready' }
  | { type: 'execution.started'; executionId: string; entrypoint?: string }
  | { type: 'execution.stdout'; executionId: string; value: string }
  | { type: 'execution.stderr'; executionId: string; value: string }
  | { type: 'execution.finished'; executionId: string; exitCode: number; durationMs: number }
  | { type: 'execution.failed'; executionId: string; traceback: string; durationMs: number }
  | { type: 'execution.interrupted'; executionId: string };

export interface ExecutionEnvironment {
  readonly provider: RuntimeProvider;
  readonly capabilities: RuntimeCapabilities;
  initialize(config: RuntimeConfig): Promise<void>;
  synchronizeFiles(diff: RuntimeFileDiff): Promise<void>;
  run(request: RunRequest): Promise<void>;
  interrupt(): Promise<void>;
  reset(): Promise<void>;
  dispose(): Promise<void>;
  subscribe(listener: (event: RuntimeEvent) => void): () => void;
}
