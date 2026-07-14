import type { RuntimeEvent } from '@tutorialkit/runtime';
import { describe, expect, it } from 'vitest';
import { PyodideEnvironment } from './PyodideEnvironment.js';
import type { PythonWorkerMessage, PythonWorkerRequest } from './protocol.js';

class FakeWorker {
  onmessage: ((event: MessageEvent<PythonWorkerMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: PythonWorkerRequest[] = [];
  terminated = false;
  postMessage(request: PythonWorkerRequest) {
    this.requests.push(request);
    queueMicrotask(() =>
      this.onmessage?.({
        data: { kind: 'response', id: request.id, generation: request.generation, ok: true },
      } as MessageEvent<PythonWorkerMessage>),
    );
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
});
