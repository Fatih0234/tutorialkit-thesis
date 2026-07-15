import { describe, expect, it } from 'vitest';
import { clampEditorSelection, normalizeEditorSelectionPayload } from './editor-selection.js';
import { validateRecordingPackage } from './export-package.js';

describe('editor selection timeline', () => {
  it('validates offsets and preserves selection direction', () => {
    expect(normalizeEditorSelectionPayload({ anchor: 12, head: 4 })).toEqual({ anchor: 12, head: 4 });
    expect(() => normalizeEditorSelectionPayload({ anchor: -1, head: 0 })).toThrow(/anchor/i);
    expect(() => normalizeEditorSelectionPayload({ anchor: 1.5, head: 0 })).toThrow(/anchor/i);
  });

  it('rejects malformed selection payloads at the package boundary', () => {
    expect(() => validateRecordingPackage({
      formatVersion: 1,
      exportedAt: new Date(0).toISOString(),
      mediaAssets: [],
      teacherRecording: {
        id: 'recording', lessonId: 'lesson', version: 1, startedAt: new Date(0).toISOString(), durationMs: 1, baseFiles: {},
        events: [{ id: 'selection', seq: 0, tMs: 0, type: 'editor.selection.changed', filePath: '/example.js', origin: 'teacher', payload: { anchor: -1, head: 0 } }],
      },
    })).toThrow(/anchor/i);
  });

  it('clamps offsets to the active document', () => {
    expect(clampEditorSelection({ anchor: 30, head: 3 }, 10)).toEqual({ anchor: 10, head: 3 });
  });
});
