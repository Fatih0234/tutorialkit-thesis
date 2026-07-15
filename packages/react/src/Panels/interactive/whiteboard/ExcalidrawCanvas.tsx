import { memo, useCallback, useEffect, useRef } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { WhiteboardScene } from '@tutorialkit/runtime';
import { fromExcalidrawScene, toExcalidrawInitialData } from './excalidraw-adapter.js';

const COMMIT_DEBOUNCE_MS = 450;

interface Props {
  scene: WhiteboardScene;
  readOnly: boolean;
  error?: string;
  onSceneCommit: (scene: WhiteboardScene) => void;
}

export const ExcalidrawCanvas = memo(function ExcalidrawCanvas({ scene, readOnly, error, onSceneCommit }: Props) {
  const apiRef = useRef<{ updateScene: (scene: ReturnType<typeof toExcalidrawInitialData>) => void } | null>(null);
  const programmaticRef = useRef(false);
  const commitTimerRef = useRef<number>();
  const sceneRef = useRef(scene);

  useEffect(() => {
    sceneRef.current = scene;
    const api = apiRef.current;
    if (!api) return;
    programmaticRef.current = true;
    api.updateScene(toExcalidrawInitialData(scene));
    queueMicrotask(() => { programmaticRef.current = false; });
  }, [scene]);

  useEffect(() => () => window.clearTimeout(commitTimerRef.current), []);

  const onChange = useCallback((elements: readonly unknown[], appState: unknown) => {
    if (readOnly || programmaticRef.current) return;
    window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = window.setTimeout(() => {
      try {
        onSceneCommit(fromExcalidrawScene(elements, appState));
      } catch {
        // The controller surfaces size/shape errors while retaining the last valid scene.
      }
    }, COMMIT_DEBOUNCE_MS);
  }, [onSceneCommit, readOnly]);

  return <div data-testid="interactive-whiteboard" data-whiteboard-readonly={readOnly} data-whiteboard-element-count={scene.elements.filter((element) => !element.isDeleted).length} className="relative h-full min-h-0 w-full bg-white" onKeyDown={(event) => event.stopPropagation()}>
    <Excalidraw
      initialData={toExcalidrawInitialData(sceneRef.current)}
      excalidrawAPI={(api: any) => { apiRef.current = api; }}
      onChange={onChange as any}
      viewModeEnabled={readOnly}
      isCollaborating={false}
      handleKeyboardGlobally={false}
      autoFocus={false}
      UIOptions={{ tools: { image: false }, canvasActions: { export: false, loadScene: false, saveToActiveFile: false, saveAsImage: false, toggleTheme: false } }}
    />
    <span className="sr-only" aria-live="polite">Whiteboard scene contains {scene.elements.filter((element) => !element.isDeleted).length} elements.</span>
    {error ? <div role="alert" className="absolute bottom-2 left-2 right-2 rounded bg-red-950/90 px-3 py-2 text-xs text-white">{error}</div> : null}
  </div>;
});
