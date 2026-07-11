import { sanitizeWhiteboardScene, type WhiteboardScene } from '@tutorialkit/runtime';

export type WhiteboardUpdateSource = 'teacher' | 'playback' | 'initialization';

export function fromExcalidrawScene(elements: readonly unknown[], _appState: unknown): WhiteboardScene {
  // View/background state is intentionally not inferred from Excalidraw's continuously
  // changing callback because its defaults would create a false content event on mount.
  return sanitizeWhiteboardScene({ elements });
}

export function toExcalidrawInitialData(scene: WhiteboardScene) {
  const sanitized = sanitizeWhiteboardScene(scene);
  return { elements: sanitized.elements as any, appState: sanitized.appState as any, files: {} };
}
