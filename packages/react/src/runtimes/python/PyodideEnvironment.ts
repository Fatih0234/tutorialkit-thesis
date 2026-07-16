import type {
  ExecutionEnvironment,
  RunRequest,
  RuntimeCapabilities,
  RuntimeEvent,
  RuntimeFileDiff,
} from '@tutorialkit/runtime';
import { resolveRuntimeConfig, type PythonRuntimeConfig, type RuntimeConfig } from '@tutorialkit/types';
import { diffRuntimeFiles } from './filesystem.js';
import type { PythonWorkerEvent, PythonWorkerMessage, PythonWorkerRequest } from './protocol.js';

type WorkerFactory = () => Worker;
interface PendingRequest {
  generation: number;
  resolve: () => void;
  reject: (error: Error) => void;
}
type RequestWithoutEnvelope<T> = T extends unknown ? Omit<T, 'id' | 'generation'> : never;
type PythonWorkerRequestInput = RequestWithoutEnvelope<PythonWorkerRequest>;

function samePythonConfig(left: PythonRuntimeConfig, right: PythonRuntimeConfig): boolean {
  return left.entrypoint === right.entrypoint && left.timeoutMs === right.timeoutMs;
}

export class PyodideEnvironment implements ExecutionEnvironment {
  readonly provider = 'pyodide' as const;
  readonly capabilities: RuntimeCapabilities = {
    execution: true,
    terminal: false,
    stdin: false,
    packages: false,
    webPreview: false,
    testing: false,
    interrupt: true,
  };
  private worker: Worker | undefined;
  private config: PythonRuntimeConfig | undefined;
  private generation = 0;
  private requestSequence = 0;
  private pending = new Map<string, PendingRequest>();
  private listeners = new Set<(event: RuntimeEvent) => void>();
  private lastFiles: Record<string, string> = {};
  private interruptBuffer: SharedArrayBuffer | undefined;
  private activeExecutionId: string | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(
    private readonly createWorker: WorkerFactory = () => {
      const workerUrl =
        typeof __PYODIDE_WORKER_URL__ === 'string' && __PYODIDE_WORKER_URL__
          ? __PYODIDE_WORKER_URL__
          : new URL('./pyodide.worker.js', import.meta.url);
      return new Worker(workerUrl, { type: 'module' });
    },
  ) {}

  async initialize(config: RuntimeConfig): Promise<void> {
    const resolved = resolveRuntimeConfig(config);

    if (resolved.provider !== 'pyodide') {
      throw new Error('PyodideEnvironment requires pyodide config.');
    }

    if (this.worker && this.config && samePythonConfig(this.config, resolved) && !this.disposed) {
      return;
    }

    const replacing = Boolean(this.worker);
    this.config = resolved;
    this.disposed = false;

    if (replacing) {
      await this.replaceWorker(true);
    } else {
      await this.startWorker();
    }
  }

  async synchronizeFiles(diff: RuntimeFileDiff): Promise<void> {
    await this.send({ type: 'sync-files', addedOrModified: diff.addedOrModified, removed: diff.removed });

    for (const path of diff.removed) {
      delete this.lastFiles[path];
    }
    Object.assign(this.lastFiles, diff.addedOrModified);
  }

  async run(request: RunRequest): Promise<void> {
    if (!this.config) {
      throw new Error('Python runtime is not initialized.');
    }

    const diff = diffRuntimeFiles(this.lastFiles, request.files);
    await this.synchronizeFiles(diff);

    const entrypoint = request.entrypoint ?? this.config.entrypoint;

    if (!entrypoint) {
      throw new Error('Python entrypoint is required.');
    }

    const runPromise = this.send({ type: 'run', entrypoint });

    if (this.config.timeoutMs) {
      this.timeout = setTimeout(() => void this.interrupt(), this.config.timeoutMs);
    }

    try {
      await runPromise;
    } finally {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }

  async interrupt(): Promise<void> {
    if (!this.activeExecutionId) {
      return;
    }

    if (this.interruptBuffer) {
      Atomics.store(new Int32Array(this.interruptBuffer), 0, 2);
    }

    const executionId = this.activeExecutionId;
    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    if (this.activeExecutionId === executionId) {
      this.emit({ type: 'execution.interrupted', executionId });
      await this.replaceWorker(true);
    }
  }

  async reset(): Promise<void> {
    await this.replaceWorker(true);
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.generation += 1;
    clearTimeout(this.timeout);
    this.worker?.terminate();
    this.worker = undefined;
    this.activeExecutionId = undefined;
    this.rejectPending(new Error('Python runtime was disposed.'));
    this.listeners.clear();
  }

  subscribe(listener: (event: RuntimeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async replaceWorker(rehydrate: boolean): Promise<void> {
    this.generation += 1;
    this.worker?.terminate();
    this.worker = undefined;
    this.activeExecutionId = undefined;
    this.rejectPending(new Error('Python runtime was reset.'));

    const files = { ...this.lastFiles };
    this.lastFiles = {};
    await this.startWorker();

    if (rehydrate && Object.keys(files).length) {
      await this.synchronizeFiles({ addedOrModified: files, removed: [] });
    }
  }

  private async startWorker(): Promise<void> {
    if (!this.config || this.disposed) {
      throw new Error('Python runtime is unavailable.');
    }

    this.worker = this.createWorker();
    this.worker.onmessage = (message: MessageEvent<PythonWorkerMessage>) => this.handleMessage(message.data);
    this.worker.onerror = (event) => this.rejectPending(new Error(event.message || 'Python worker failed.'));
    this.interruptBuffer = typeof SharedArrayBuffer === 'function' ? new SharedArrayBuffer(4) : undefined;
    await this.send({ type: 'initialize', config: this.config, interruptBuffer: this.interruptBuffer });
  }

  private send(request: PythonWorkerRequestInput): Promise<void> {
    if (!this.worker) {
      return Promise.reject(new Error('Python worker is not available.'));
    }

    const id = `request-${++this.requestSequence}`;
    const generation = this.generation;

    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { generation, resolve, reject });
      this.worker!.postMessage({ ...request, id, generation } as PythonWorkerRequest);
    });
  }

  private handleMessage(message: PythonWorkerMessage): void {
    if (message.generation !== this.generation || this.disposed) {
      return;
    }

    if (message.kind === 'response') {
      const pending = this.pending.get(message.id);

      if (!pending || pending.generation !== message.generation) {
        return;
      }

      this.pending.delete(message.id);

      if (message.ok) {
        pending.resolve();
      } else {
        pending.reject(new Error(message.error));
      }

      return;
    }

    this.convertEvent(message.event);
  }

  private convertEvent(event: PythonWorkerEvent): void {
    if (event.type === 'ready') {
      this.emit({ type: 'ready' });
    } else if (event.type === 'started') {
      this.activeExecutionId = event.executionId;
      this.emit({ type: 'execution.started', executionId: event.executionId, entrypoint: event.entrypoint });
    } else if (event.type === 'stdout') {
      this.emit({ type: 'execution.stdout', executionId: event.executionId, value: event.value });
    } else if (event.type === 'stderr') {
      this.emit({ type: 'execution.stderr', executionId: event.executionId, value: event.value });
    } else if (event.type === 'finished') {
      this.activeExecutionId = undefined;
      this.emit({
        type: 'execution.finished',
        executionId: event.executionId,
        exitCode: event.exitCode,
        durationMs: event.durationMs,
      });
    } else if (event.type === 'failed') {
      this.activeExecutionId = undefined;
      this.emit({
        type: 'execution.failed',
        executionId: event.executionId,
        traceback: event.traceback,
        durationMs: event.durationMs,
      });
    } else {
      this.activeExecutionId = undefined;
      this.emit({ type: 'execution.interrupted', executionId: event.executionId });
    }
  }

  private emit(event: RuntimeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}
