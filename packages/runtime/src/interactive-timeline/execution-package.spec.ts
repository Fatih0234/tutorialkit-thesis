import { describe, expect, it } from 'vitest';
import { validateRecordingPackage } from './export-package.js';

function packageWith(type: string, payload: unknown) {
  return {
    formatVersion: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    teacherRecording: {
      id: 'recording',
      lessonId: 'lesson',
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      durationMs: 1,
      baseFiles: {},
      events: [{ id: 'event', seq: 1, tMs: 0, type, origin: 'teacher', payload }],
    },
    mediaAssets: [],
  };
}

describe('recording package execution events', () => {
  it('accepts valid execution events', () => {
    expect(
      validateRecordingPackage(
        packageWith('execution.started', { executionId: 'run-1', provider: 'pyodide', entrypoint: 'main.py' }),
      ).teacherRecording.events,
    ).toHaveLength(1);
  });

  it('rejects malformed and unknown events at the package boundary', () => {
    expect(() => validateRecordingPackage(packageWith('execution.stdout', { value: 'missing id' }))).toThrow();
    expect(() => validateRecordingPackage(packageWith('future.event', {}))).toThrow(/type is invalid/);
  });
});
