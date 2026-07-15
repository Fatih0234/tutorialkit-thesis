import type { RuntimeEvent, TutorialStore } from '@tutorialkit/runtime';
import { resolveRuntimeConfig } from '@tutorialkit/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RuntimeManager, getRuntimeCapabilities } from './RuntimeManager.js';
import { runAfterEditorBatch } from './delayed-runtime-run.js';
import { LiveRuntimeSession } from './live-runtime-session.js';

export type RuntimeStatus = 'unavailable' | 'initializing' | 'ready' | 'running' | 'stopping' | 'resetting' | 'failed';

export function useLessonRuntime(
  tutorialStore: TutorialStore,
  onEvent: (event: RuntimeEvent, provider: 'webcontainer' | 'pyodide') => void,
  playbackMode: 'teacher-playback' | 'learner-editing' | 'idle',
) {
  const config = resolveRuntimeConfig(tutorialStore.lesson?.data.runtime);
  const lessonLoadKey = tutorialStore.ref.get();
  const managerRef = useRef<RuntimeManager>();
  const environmentRef = useRef<Awaited<ReturnType<RuntimeManager['select']>>>();
  const onEventRef = useRef(onEvent);
  const sessionRef = useRef(new LiveRuntimeSession());
  const playbackModeRef = useRef(playbackMode);
  const invalidatedRef = useRef(false);
  const [status, setStatus] = useState<RuntimeStatus>(config.provider === 'pyodide' ? 'initializing' : 'unavailable');
  const [error, setError] = useState('');
  onEventRef.current = onEvent;
  playbackModeRef.current = playbackMode;

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
              return;
            }

            if (!sessionRef.current.accepts(event)) {
              return;
            }

            if (event.type === 'execution.started') {
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
    lessonLoadKey,
    config.provider,
    config.provider === 'pyodide' ? config.entrypoint : '',
    config.provider === 'pyodide' ? config.timeoutMs : undefined,
  ]);

  const run = useCallback(async () => {
    const environment = environmentRef.current;

    if (!environment || config.provider !== 'pyodide' || status === 'running') {
      return;
    }

    if (playbackModeRef.current === 'teacher-playback') {
      return;
    }

    invalidatedRef.current = false;

    const generation = sessionRef.current.begin();

    setError('');

    try {
      await runAfterEditorBatch({
        session: sessionRef.current,
        generation,
        isTeacherPlayback: () => playbackModeRef.current === 'teacher-playback',
        onExecution: () => window.dispatchEvent(new CustomEvent('tutorialkit:python-execution')),
        run: () => environment.run({ entrypoint: config.entrypoint, files: tutorialStore.takeSnapshot().files }),
      });
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

  const invalidate = useCallback(async () => {
    if (invalidatedRef.current) {
      return;
    }

    invalidatedRef.current = true;
    sessionRef.current.invalidate();

    const environment = environmentRef.current;

    if (!environment) {
      return;
    }

    try {
      await environment.reset();
      setStatus('ready');
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

  useEffect(() => {
    if (playbackMode === 'teacher-playback') {
      void invalidate();
    }
  }, [invalidate, playbackMode]);

  return {
    provider: config.provider,
    capabilities: environmentRef.current?.capabilities ?? getRuntimeCapabilities(config),
    status,
    error,
    run,
    stop,
    reset,
    invalidate,
    clear: () => {
      if (playbackModeRef.current !== 'teacher-playback') {
        tutorialStore.clearOutput();
      }
    },
  };
}
