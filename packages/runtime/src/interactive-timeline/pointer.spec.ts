import { describe, expect, it } from 'vitest';
import { validateRecordingPackage } from './export-package.js';
import { materializeTeacherPointer, normalizeTeacherPointerClickPayload, normalizeTeacherPointerPayload } from './pointer.js';
import type { TeacherRecording, TimelineEvent } from './types.js';

describe('teacher pointer timeline', () => {
  it('validates normalized pointer payloads', () => {
    expect(normalizeTeacherPointerPayload({ surface: 'preview', x: 0.25, y: 1, visible: true })).toEqual({ surface: 'preview', x: 0.25, y: 1, visible: true });
    expect(normalizeTeacherPointerPayload({ surface: 'experience', x: 0.25, y: 0.5, visible: true, coordinateSpaceVersion: 2 })).toEqual({ surface: 'experience', x: 0.25, y: 0.5, visible: true, coordinateSpaceVersion: 2 });
    expect(normalizeTeacherPointerPayload({ surface: 'workspace', x: 0.25, y: 0.5, visible: true, coordinateSpaceVersion: 3, anchor: { kind: 'editor', filePath: 'example.js', documentOffset: 12, offsetX: 3, offsetY: 4 } })).toEqual({ surface: 'workspace', x: 0.25, y: 0.5, visible: true, coordinateSpaceVersion: 3, anchor: { kind: 'editor', filePath: '/example.js', documentOffset: 12, offsetX: 3, offsetY: 4 } });
    expect(() => normalizeTeacherPointerPayload({ surface: 'workspace', x: -1, y: 0, visible: true })).toThrow(/x must be between/i);
    expect(() => normalizeTeacherPointerPayload({ surface: 'other', x: 0, y: 0, visible: true })).toThrow(/surface/i);
    expect(normalizeTeacherPointerClickPayload({ surface: 'workspace', x: 0.5, y: 0.5, button: 'right' }).button).toBe('right');
    expect(() => normalizeTeacherPointerClickPayload({ surface: 'workspace', x: 0.5, y: 0.5, button: 'middle' })).toThrow(/button/i);
  });

  it('rejects malformed pointer payloads at the package boundary', () => {
    expect(() => validateRecordingPackage({
      formatVersion: 1,
      exportedAt: new Date(0).toISOString(),
      mediaAssets: [],
      teacherRecording: {
        id: 'recording', lessonId: 'lesson', version: 1, startedAt: new Date(0).toISOString(), durationMs: 10, baseFiles: {},
        events: [{ id: 'pointer', seq: 0, tMs: 0, type: 'pointer.changed', origin: 'teacher', payload: { surface: 'preview', x: 2, y: 0, visible: true } }],
      },
    })).toThrow(/x must be between/i);
  });

  it('materializes the latest ordered pointer state', () => {
    const events: TimelineEvent[] = [
      { id: 'later', seq: 2, tMs: 200, type: 'pointer.changed', origin: 'teacher', payload: { surface: 'preview', x: 0.8, y: 0.7, visible: true } },
      { id: 'first', seq: 1, tMs: 100, type: 'pointer.changed', origin: 'teacher', payload: { surface: 'workspace', x: 0.2, y: 0.3, visible: true } },
    ];
    const recording: TeacherRecording = { id: 'recording', lessonId: 'lesson', version: 1, startedAt: new Date(0).toISOString(), durationMs: 300, baseFiles: {}, events };
    expect(materializeTeacherPointer(recording, 99).visible).toBe(false);
    expect(materializeTeacherPointer(recording, 150).surface).toBe('workspace');
    expect(materializeTeacherPointer(recording, 250).surface).toBe('preview');
  });
});
