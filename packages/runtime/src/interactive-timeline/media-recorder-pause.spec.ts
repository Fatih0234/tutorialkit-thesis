import { describe, expect, it, vi } from 'vitest';
import { InteractiveMediaRecorder } from './media-recorder.js';

describe('InteractiveMediaRecorder exercise pause', () => {
  it('excludes paused exercise-insertion time in fake-media mode', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const recorder = new InteractiveMediaRecorder({ fake: true });
    await recorder.prepare('audio');
    recorder.start({ recordingId: 'recording', startedAtMs: 1000 });

    vi.mocked(Date.now).mockReturnValue(1500);
    expect(recorder.pause()).toBe(true);
    expect(recorder.status).toBe('paused');

    vi.mocked(Date.now).mockReturnValue(5500);
    expect(recorder.resume()).toBe(true);
    vi.mocked(Date.now).mockReturnValue(6000);
    const asset = await recorder.stop();

    expect(asset?.durationMs).toBe(1000);
    vi.restoreAllMocks();
  });
});
