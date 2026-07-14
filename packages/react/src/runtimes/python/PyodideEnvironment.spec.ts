import type { RuntimeEvent } from '@tutorialkit/runtime';
import { describe, expect, it } from 'vitest';
import { PyodideEnvironment } from './PyodideEnvironment.js';
import type { PythonWorkerMessage, PythonWorkerRequest } from './protocol.js';

class FakeWorker {
  onmessage: ((event: MessageEvent<PythonWorkerMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: PythonWorkerRequest[] = [];
  terminated = false;
  autoRespond = true;
  postMessage(request: PythonWorkerRequest) {
    this.requests.push(request);

    if (this.autoRespond) {
      queueMicrotask(() =>
        this.onmessage?.({
          data: { kind: 'response', id: request.id, generation: request.generation, ok: true },
        } as MessageEvent<PythonWorkerMessage>),
      );
    }
  }
  terminate() {
    this.terminated = true;
  }
  emit(message: PythonWorkerMessage) {
    this.onmessage?.({ data: message } as MessageEvent<PythonWorkerMessage>);
  }
}

describe('PyodideEnvironment worker lifecycle', () => {
  it('correlates requests and rejects stale events after reset', async () => {
    const workers: FakeWorker[] = [];
    const runtime = new PyodideEnvironment(() => {
      const worker = new FakeWorker();
      workers.push(worker);

      return worker as unknown as Worker;
    });
    const events: RuntimeEvent[] = [];
    runtime.subscribe((event) => events.push(event));
    await runtime.initialize({ provider: 'pyodide', entrypoint: 'main.py' });
    await runtime.synchronizeFiles({ addedOrModified: { '/main.py': 'print("ok")' }, removed: [] });
    expect(workers[0]!.requests.map((request) => request.type)).toEqual(['initialize', 'sync-files']);

    await runtime.reset();
    expect(workers[0]!.terminated).toBe(true);
    workers[0]!.emit({ kind: 'event', generation: 0, event: { type: 'stdout', executionId: 'stale', value: 'bad' } });
    expect(events).toEqual([]);
    expect(workers[1]!.requests.map((request) => request.type)).toEqual(['initialize', 'sync-files']);
  });

  it('reuses identical config and replaces the sole worker for config changes', async () => {
    const workers: FakeWorker[] = [];
    const runtime = new PyodideEnvironment(() => {
      const worker = new FakeWorker();
      workers.push(worker);

      return worker as unknown as Worker;
    });

    await runtime.initialize({ provider: 'pyodide', entrypoint: 'main.py' });
    await runtime.initialize({ provider: 'pyodide', entrypoint: 'main.py' });
    expect(workers).toHaveLength(1);

    await runtime.initialize({ provider: 'pyodide', entrypoint: 'other.py', timeoutMs: 10 });
    expect(workers).toHaveLength(2);
    expect(workers[0]!.terminated).toBe(true);

    await runtime.reset();
    expect(workers).toHaveLength(3);
    expect(workers[1]!.terminated).toBe(true);

    await runtime.dispose();
    await runtime.dispose();
    expect(workers[2]!.terminated).toBe(true);
  });

  it('rejects pending requests when initialization replaces a worker', async () => {
    const workers: FakeWorker[] = [];
    const runtime = new PyodideEnvironment(() => {
      const worker = new FakeWorker();
      workers.push(worker);

      return worker as unknown as Worker;
    });

    await runtime.initialize({ provider: 'pyodide', entrypoint: 'main.py' });
    workers[0]!.autoRespond = false;

    const pending = runtime.synchronizeFiles({ addedOrModified: { '/pending.py': '' }, removed: [] });
    const replacement = runtime.initialize({ provider: 'pyodide', entrypoint: 'other.py' });

    await expect(pending).rejects.toThrow('reset');
    await replacement;
    expect(workers.filter((worker) => !worker.terminated)).toHaveLength(1);
  });
});
