import { describe, expect, it } from 'vitest';
import { whiteboardSceneFingerprint } from '@tutorialkit/runtime';
import { fromExcalidrawScene } from './excalidraw-adapter.js';
import { evaluateWhiteboardCommit } from './useInteractiveWhiteboard.js';

describe('Excalidraw whiteboard adapter', () => {
  it('persists elements and stable appearance but drops transient UI state', () => {
    const scene = fromExcalidrawScene(
      [{ id: 'shape', type: 'rectangle', x: 10, y: 20, isDeleted: false }],
      { viewBackgroundColor: '#ffffff', gridSize: 20, selectedElementIds: { shape: true }, activeTool: { type: 'rectangle' }, cursorButton: 'down', scrollX: 55, zoom: { value: 2 } },
    );
    expect(scene.elements).toHaveLength(1);
    expect(scene.appState).toBeUndefined();
  });

  it('suppresses duplicates, including a teacher callback after a programmatic playback update', () => {
    const playbackScene = { elements: [{ id: 'playback', type: 'text' }] };
    const playbackFingerprint = whiteboardSceneFingerprint(playbackScene);
    expect(evaluateWhiteboardCommit(playbackFingerprint, structuredClone(playbackScene)).changed).toBe(false);
    expect(evaluateWhiteboardCommit(playbackFingerprint, { elements: [...playbackScene.elements, { id: 'teacher', type: 'rectangle' }] }).changed).toBe(true);
  });

  it('rejects non-serializable and oversized element collections', () => {
    expect(() => fromExcalidrawScene([{ id: 'shape', callback: () => undefined }], {})).toThrow(/non-serializable/);
    expect(() => fromExcalidrawScene(Array.from({ length: 1001 }, (_, id) => ({ id })), {})).toThrow(/exceeds 1000/);
  });
});
