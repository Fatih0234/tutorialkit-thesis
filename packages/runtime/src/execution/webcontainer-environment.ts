import type { RuntimeConfig } from '@tutorialkit/types';
import type { ExecutionEnvironment, RunRequest, RuntimeCapabilities, RuntimeEvent, RuntimeFileDiff } from './types.js';

/** Compatibility seam over TutorialRunner-style operations. Existing consumers need not migrate yet. */
export interface WebContainerExecutionDelegate {
  synchronizeFiles?(diff: RuntimeFileDiff): Promise<void> | void;
  run(request: RunRequest): Promise<void> | void;
  interrupt?(): Promise<void> | void;
  reset?(): Promise<void> | void;
  dispose?(): Promise<void> | void;
}

export class WebContainerEnvironment implements ExecutionEnvironment {
  readonly provider = 'webcontainer' as const;
  readonly capabilities: RuntimeCapabilities = {
    execution: true,
    terminal: true,
    stdin: true,
    packages: true,
    webPreview: true,
    testing: true,
    interrupt: true,
  };
  private listeners = new Set<(event: RuntimeEvent) => void>();

  constructor(private readonly delegate: WebContainerExecutionDelegate) {}

  async initialize(config: RuntimeConfig): Promise<void> {
    if (config.provider !== this.provider) {
      throw new Error('WebContainerEnvironment requires webcontainer config.');
    }

    this.emit({ type: 'ready' });
  }

  async synchronizeFiles(diff: RuntimeFileDiff): Promise<void> {
    await this.delegate.synchronizeFiles?.(diff);
  }
  async run(request: RunRequest): Promise<void> {
    await this.delegate.run(request);
  }
  async interrupt(): Promise<void> {
    await this.delegate.interrupt?.();
  }
  async reset(): Promise<void> {
    await this.delegate.reset?.();
  }
  async dispose(): Promise<void> {
    this.listeners.clear();
    await this.delegate.dispose?.();
  }
  subscribe(listener: (event: RuntimeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(event: RuntimeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
