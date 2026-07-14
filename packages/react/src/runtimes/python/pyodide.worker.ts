/// <reference lib="webworker" />
import { loadPyodide, type PyodideInterface } from 'pyodide';
import { toWorkspacePath } from './filesystem.js';
import type { PythonWorkerMessage, PythonWorkerRequest } from './protocol.js';

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
let pyodide: PyodideInterface | undefined;
let generation = 0;
let activeExecutionId: string | undefined;

function post(message: PythonWorkerMessage): void {
  scope.postMessage(message);
}

function emit(event: Extract<PythonWorkerMessage, { kind: 'event' }>['event']): void {
  post({ kind: 'event', generation, event });
}

function response(request: PythonWorkerRequest, error?: unknown): void {
  post(
    error
      ? {
          kind: 'response',
          id: request.id,
          generation: request.generation,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      : { kind: 'response', id: request.id, generation: request.generation, ok: true },
  );
}

function ensureParent(path: string): void {
  const parent = path.slice(0, path.lastIndexOf('/')) || '/workspace';
  pyodide!.FS.mkdirTree(parent);
}

function removeWorkspace(): void {
  if (!pyodide) {
    return;
  }

  const remove = (path: string): void => {
    for (const name of pyodide!.FS.readdir(path)) {
      if (name === '.' || name === '..') {
        continue;
      }

      const child = `${path}/${name}`;
      const stat = pyodide!.FS.stat(child);

      if (pyodide!.FS.isDir(stat.mode)) {
        remove(child);
        pyodide!.FS.rmdir(child);
      } else {
        pyodide!.FS.unlink(child);
      }
    }
  };
  remove('/workspace');
}

async function initialize(request: Extract<PythonWorkerRequest, { type: 'initialize' }>): Promise<void> {
  generation = request.generation;

  if (!pyodide) {
    const indexURL =
      typeof __PYODIDE_BASE_URL__ === 'string'
        ? new URL(__PYODIDE_BASE_URL__, scope.location.origin).href
        : new URL('./pyodide/', import.meta.url).href;
    pyodide = await loadPyodide({ indexURL });
  }

  pyodide.FS.mkdirTree('/workspace');
  pyodide.FS.chdir('/workspace');

  if (request.interruptBuffer) {
    pyodide.setInterruptBuffer(new Int32Array(request.interruptBuffer));
  }

  pyodide.setStdout({
    batched: (value) => {
      if (activeExecutionId) {
        emit({ type: 'stdout', executionId: activeExecutionId, value: `${value}\n` });
      }
    },
  });
  pyodide.setStderr({
    batched: (value) => {
      if (activeExecutionId) {
        emit({ type: 'stderr', executionId: activeExecutionId, value: `${value}\n` });
      }
    },
  });
  await pyodide.runPythonAsync("import sys\nif '/workspace' not in sys.path: sys.path.insert(0, '/workspace')");

  if (request.config.packages?.length) {
    await pyodide.loadPackage(request.config.packages);
  }

  emit({ type: 'ready' });
}

async function run(request: Extract<PythonWorkerRequest, { type: 'run' }>): Promise<void> {
  if (!pyodide) {
    throw new Error('Python runtime is not initialized.');
  }

  const executionId = `python-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  activeExecutionId = executionId;

  const started = performance.now();
  emit({ type: 'started', executionId, entrypoint: request.entrypoint });

  try {
    const path = toWorkspacePath(request.entrypoint);
    const result: unknown = await pyodide.runPythonAsync(
      `import runpy, sys\nfor _name, _module in list(sys.modules.items()):\n    if str(getattr(_module, '__file__', '')).startswith('/workspace/'):\n        del sys.modules[_name]\nrunpy.run_path(${JSON.stringify(path)}, run_name='__main__')`,
    );

    if (result && typeof result === 'object' && 'destroy' in result && typeof result.destroy === 'function') {
      result.destroy();
    }

    emit({ type: 'finished', executionId, exitCode: 0, durationMs: Math.round(performance.now() - started) });
  } catch (error) {
    const traceback = error instanceof Error ? error.message : String(error);

    if (traceback.includes('KeyboardInterrupt')) {
      emit({ type: 'interrupted', executionId });
    } else {
      emit({ type: 'failed', executionId, traceback, durationMs: Math.round(performance.now() - started) });
    }
  } finally {
    activeExecutionId = undefined;
  }
}

scope.onmessage = (message: MessageEvent<PythonWorkerRequest>) => {
  const request = message.data;

  if (request.generation !== generation && request.type !== 'initialize') {
    return;
  }

  void (async () => {
    try {
      if (request.type === 'initialize') {
        await initialize(request);
      } else if (request.type === 'sync-files') {
        if (!pyodide) {
          throw new Error('Python runtime is not initialized.');
        }

        for (const path of request.removed) {
          const target = toWorkspacePath(path);

          try {
            pyodide.FS.unlink(target);
          } catch {
            /* already absent */
          }
        }

        for (const [path, value] of Object.entries(request.addedOrModified)) {
          const target = toWorkspacePath(path);
          ensureParent(target);
          pyodide.FS.writeFile(target, value);
        }
      } else if (request.type === 'run') {
        await run(request);
      } else if (request.type === 'interrupt') {
        /* Atomics interrupt is signalled by the main thread. */
      } else if (request.type === 'reset') {
        removeWorkspace();
        pyodide?.FS.mkdirTree('/workspace');
      }

      response(request);
    } catch (error) {
      response(request, error);
    }
  })();
};
