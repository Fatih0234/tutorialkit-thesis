import type { RuntimeEvent, TutorialStore } from '@tutorialkit/runtime';
import { resolveRuntimeConfig } from '@tutorialkit/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RuntimeManager } from './RuntimeManager.js';

export type RuntimeStatus = 'unavailable' | 'initializing' | 'ready' | 'running' | 'stopping' | 'resetting' | 'failed';

export function useLessonRuntime(
  tutorialStore: TutorialStore,
  onEvent: (event: RuntimeEvent, provider: 'webcontainer' | 'pyodide') => void,
) {
  const config = resolveRuntimeConfig(tutorialStore.lesson?.data.runtime);
  const managerRef = useRef<RuntimeManager>();
  const environmentRef = useRef<Awaited<ReturnType<RuntimeManager['select']>>>();
  const onEventRef = useRef(onEvent);
  const [status, setStatus] = useState<RuntimeStatus>(config.provider === 'pyodide' ? 'initializing' : 'unavailable');
  const [error, setError] = useState('');
  onEventRef.current = onEvent;

  useEffect(() => {
    const manager = new RuntimeManager();
    managerRef.current = manager;

    let active = true;
    let unsubscribe: (() => void) | undefined;

    if (config.provider === 'pyodide') {
      setStatus('initializing');
      void manager
        .select(config)
        .then((environment) => {
          if (!active || !environment) {
            return;
          }

          environmentRef.current = environment;
          unsubscribe = environment.subscribe((event) => {
            if (!active) {
              return;
            }

            if (event.type === 'ready') {
              setStatus('ready');
            } else if (event.type === 'execution.started') {
              tutorialStore.clearOutput();
              setStatus('running');
            } else if (event.type === 'execution.stdout') {
              tutorialStore.writeOutput(event.value);
            } else if (event.type === 'execution.stderr') {
              tutorialStore.writeOutput(`\x1b[31m${event.value}\x1b[0m`);
            } else if (event.type === 'execution.failed') {
              tutorialStore.writeOutput(`\x1b[31m${event.traceback}\n\x1b[0m`);
              setStatus('ready');
            } else if (event.type === 'execution.finished' || event.type === 'execution.interrupted') {
              setStatus('ready');
            }

            onEventRef.current(event, config.provider);
          });
          setStatus('ready');
        })
        .catch((cause: unknown) => {
          if (!active) {
            return;
          }

          setError(cause instanceof Error ? cause.message : String(cause));
          setStatus('failed');
        });
    }

    return () => {
      active = false;
      unsubscribe?.();
      environmentRef.current = undefined;
      void manager.dispose();
    };
  }, [
    tutorialStore,
    tutorialStore.lesson?.id,
    config.provider,
    config.provider === 'pyodide' ? config.entrypoint : '',
  ]);

  const run = useCallback(async () => {
    const environment = environmentRef.current;

    if (!environment || config.provider !== 'pyodide' || status === 'running') {
      return;
    }

    setError('');

    try {
      // editor batches updates; running is an explicit synchronization boundary
      await new Promise<void>((resolve) => setTimeout(resolve, 175));
      await environment.run({ entrypoint: config.entrypoint, files: tutorialStore.takeSnapshot().files });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setStatus('failed');
    }
  }, [config, status, tutorialStore]);
  const stop = useCallback(async () => {
    const environment = environmentRef.current;

    if (!environment) {
      return;
    }

    setStatus('stopping');

    try {
      await environment.interrupt();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setStatus('failed');
    }
  }, []);
  const reset = useCallback(async () => {
    const environment = environmentRef.current;

    if (!environment) {
      return;
    }

    setStatus('resetting');

    try {
      await environment.reset();
      setStatus('ready');
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setStatus('failed');
    }
  }, []);

  return {
    provider: config.provider,
    capabilities: environmentRef.current?.capabilities,
    status,
    error,
    run,
    stop,
    reset,
    clear: () => tutorialStore.clearOutput(),
  };
}
