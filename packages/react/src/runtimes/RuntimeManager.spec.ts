import type { ExecutionEnvironment, RuntimeCapabilities, RuntimeEvent } from '@tutorialkit/runtime';
import { describe, expect, it, vi } from 'vitest';
import { RuntimeManager } from './RuntimeManager.js';

function environment(provider: 'webcontainer' | 'pyodide'): ExecutionEnvironment {
  return {
    provider,
    capabilities: {} as RuntimeCapabilities,
    initialize: vi.fn(async () => undefined),
    synchronizeFiles: vi.fn(async () => undefined),
    run: vi.fn(async () => undefined),
    interrupt: vi.fn(async () => undefined),
    reset: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
    subscribe: (_listener: (event: RuntimeEvent) => void) => () => undefined,
  };
}

describe('RuntimeManager', () => {
  it('selects Pyodide and leaves legacy WebContainer ownership unchanged', async () => {
    const python = environment('pyodide');
    const manager = new RuntimeManager({ pyodide: () => python });
    expect(await manager.select({ provider: 'webcontainer' })).toBeUndefined();
    expect(await manager.select({ provider: 'pyodide', entrypoint: 'main.py' })).toBe(python);
    expect(python.initialize).toHaveBeenCalledWith({ provider: 'pyodide', entrypoint: 'main.py' });

    expect(await manager.select({ provider: 'pyodide', entrypoint: 'main.py' })).toBe(python);
    expect(await manager.select({ provider: 'pyodide', entrypoint: 'other.py' })).toBe(python);
    expect(python.initialize).toHaveBeenNthCalledWith(2, { provider: 'pyodide', entrypoint: 'main.py' });
    expect(python.initialize).toHaveBeenNthCalledWith(3, { provider: 'pyodide', entrypoint: 'other.py' });
  });
});
