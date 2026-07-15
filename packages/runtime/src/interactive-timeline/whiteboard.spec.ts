import { describe, expect, it } from 'vitest';
import { materializeWhiteboardScene, sanitizeWhiteboardScene, whiteboardSceneFingerprint } from './whiteboard.js';
import { validateRecordingPackage } from './export-package.js';
import type { TeacherRecording } from './types.js';

const initial = { elements: [{ id: 'initial', type: 'text', text: 'Start', isDeleted: false }] };
const first = { elements: [...initial.elements, { id: 'first', type: 'rectangle', isDeleted: false }] };
const second = { elements: [...first.elements, { id: 'second', type: 'ellipse', isDeleted: false }] };

function recording(events: TeacherRecording['events'] = []): TeacherRecording {
  return { id: 'recording', lessonId: 'lesson', version: 1, startedAt: new Date(0).toISOString(), durationMs: 3000, baseFiles: {}, events,
    presentationResources: [{ id: 'board', kind: 'whiteboard', title: 'Whiteboard', initialScene: initial }],
  };
}

const events: TeacherRecording['events'] = [
  { id: 'later', seq: 2, tMs: 2000, type: 'whiteboard.scene.changed', origin: 'teacher', payload: { resourceId: 'board', scene: second } },
  { id: 'first', seq: 1, tMs: 1000, type: 'whiteboard.scene.changed', origin: 'teacher', payload: { resourceId: 'board', scene: first } },
];

describe('whiteboard scenes', () => {
  it('keeps recordings without whiteboards valid', () => {
    expect(materializeWhiteboardScene({ ...recording(), presentationResources: undefined }, 'board', 1000)).toEqual({ elements: [] });
  });

  it('serializes and restores application-owned scene data while removing transient app state', () => {
    const scene = sanitizeWhiteboardScene({ elements: initial.elements, appState: { viewBackgroundColor: '#fff', selectedElementIds: { initial: true }, activeTool: { type: 'text' }, scrollX: 20 } });
    expect(JSON.parse(JSON.stringify(scene))).toEqual({ elements: initial.elements, appState: { viewBackgroundColor: '#fff' } });
  });

  it('orders events and materializes before, between, and after changes', () => {
    expect(materializeWhiteboardScene(recording(events), 'board', 999)).toEqual(initial);
    expect(materializeWhiteboardScene(recording(events), 'board', 1500)).toEqual(first);
    expect(materializeWhiteboardScene(recording(events), 'board', 3000)).toEqual(second);
  });

  it('provides a stable fingerprint for duplicate suppression', () => {
    expect(whiteboardSceneFingerprint(first)).toBe(whiteboardSceneFingerprint(structuredClone(first)));
  });

  it('round-trips whiteboards through version 1 packages and accepts older packages', () => {
    const packageBase = { formatVersion: 1, exportedAt: new Date(0).toISOString(), mediaAssets: [] } as const;
    expect(validateRecordingPackage({ ...packageBase, teacherRecording: recording(events) }).teacherRecording.presentationResources?.[0]).toEqual(recording(events).presentationResources?.[0]);
    expect(validateRecordingPackage({ ...packageBase, teacherRecording: { ...recording(), presentationResources: undefined } }).formatVersion).toBe(1);
  });

  it('rejects oversized scenes', () => {
    expect(() => sanitizeWhiteboardScene({ elements: Array.from({ length: 1001 }, (_, id) => ({ id })) })).toThrow(/exceeds 1000 elements/);
  });
});
