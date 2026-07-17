import { describe, expect, it, vi } from 'vitest';
import { TimelineRecorder } from './recorder.js';

describe('TimelineRecorder exercise pause', () => {
  it('excludes authoring time and suppresses events while paused', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const recorder = new TimelineRecorder();
    recorder.start({ lessonId: 'lesson', baseFiles: { '/index.js': '' }, startedAtMs: 1000 });

    vi.mocked(Date.now).mockReturnValue(1500);
    expect(recorder.pause()).toEqual({ timestampMs: 500, lastAppliedEventSeq: 0 });
    recorder.recordFileChanged('/index.js', { content: 'authoring' });
    expect(recorder.getRecording()?.events).toHaveLength(1);

    vi.mocked(Date.now).mockReturnValue(5500);
    expect(recorder.resume()).toBe(true);
    vi.mocked(Date.now).mockReturnValue(6000);
    recorder.recordFileChanged('/index.js', { content: 'lecture' });

    expect(recorder.getRecording()?.events.at(-1)).toMatchObject({ tMs: 1000, payload: { content: 'lecture' } });
    expect(recorder.stop()?.durationMs).toBe(1000);
    vi.restoreAllMocks();
  });

  it('adds an exercise point at the exact paused position', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const recorder = new TimelineRecorder();
    recorder.start({ lessonId: 'lesson', baseFiles: {}, startedAtMs: 1000 });
    vi.mocked(Date.now).mockReturnValue(1250);
    recorder.pause();

    const point = recorder.addExercisePoint({
      schemaVersion: 1,
      id: 'point-1',
      exerciseId: 'exercise-1',
      teacherTimestampMs: 0,
      lastAppliedTeacherEventSeq: -1,
      createdAt: new Date(0).toISOString(),
    });

    expect(point).toMatchObject({ teacherTimestampMs: 250, lastAppliedTeacherEventSeq: 0 });
    expect(recorder.getRecording()?.exercisePoints).toEqual([point]);
    vi.restoreAllMocks();
  });
});
