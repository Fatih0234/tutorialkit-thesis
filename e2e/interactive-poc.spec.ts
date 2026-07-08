import { expect, test } from '@playwright/test';

const FALLBACK_POC_URL = 'http://localhost:4321';
const POC_LESSON_PATH = '/tests/file-tree/lesson-and-solution';

function getPocUrl(baseURL?: string) {
  const url = new URL(process.env.TK_POC_URL ?? baseURL ?? FALLBACK_POC_URL);

  if (url.pathname === '/') {
    url.pathname = POC_LESSON_PATH;
  }

  return url.toString();
}

test.describe('interactive timeline POC', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.goto(getPocUrl(baseURL));
    await page.evaluate(() => {
      localStorage.removeItem('interactive-poc.teacherRecording');
      localStorage.removeItem('interactive-poc.learnerDeltas');
    });
  });

  test('records one editor edit into teacher recording localStorage', async ({ page }) => {
    const startRecording = page.getByRole('button', { name: /start recording/i });
    const stopRecording = page.getByRole('button', { name: /stop recording/i });

    await expect(startRecording).toBeVisible();
    await expect(stopRecording).toBeVisible();

    await startRecording.click();
    await page.getByRole('button', { name: 'example.js' }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();
    await editor.click();
    await page.keyboard.type('\n// interactive poc recording edit');
    await expect(editor).toContainText('// interactive poc recording edit');
    await page.waitForTimeout(300);
    await expect(page.getByText(/event count:\s*[3-9]\d*/i)).toBeVisible();

    await stopRecording.click();

    const rawRecording = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(rawRecording).toBeTruthy();

    const recording = JSON.parse(rawRecording!);

    expect(recording.baseFiles).toBeTruthy();
    expect(Object.keys(recording.baseFiles).length).toBeGreaterThan(0);
    expect(Array.isArray(recording.events)).toBeTruthy();
    expect(recording.events.length).toBeGreaterThan(0);
    expect(recording.events.some((event: any) => event.type === 'file.changed')).toBeTruthy();
  });

  test('plays a stored teacher recording without mutating it', async ({ page }) => {
    const baseContent = 'console.log("teacher playback base");\n';
    const finalContent = `${baseContent}// teacher playback edit\n`;
    const recording = {
      id: 'teacher-recording-playback-test',
      lessonId: 'lesson-and-solution',
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      durationMs: 25,
      baseFiles: {
        '/example.html': '<h1>Teacher playback base</h1>\n',
        '/example.js': baseContent,
      },
      events: [
        { id: 'event-started', seq: 0, tMs: 0, type: 'recording.started', origin: 'system' },
        {
          id: 'event-opened',
          seq: 1,
          tMs: 0,
          type: 'file.opened',
          filePath: '/example.js',
          payload: { filePath: '/example.js' },
          origin: 'teacher',
        },
        {
          id: 'event-changed',
          seq: 2,
          tMs: 25,
          type: 'file.changed',
          filePath: '/example.js',
          payload: { content: finalContent },
          origin: 'teacher',
        },
      ],
    };

    await page.evaluate((teacherRecording) => {
      localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(teacherRecording));
    }, recording);

    const rawBefore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));
    const playRecording = page.getByRole('button', { name: /play recording/i });
    const pausePlayback = page.getByRole('button', { name: /pause & try it/i });

    await expect(playRecording).toBeVisible();
    await expect(pausePlayback).toBeVisible();
    await expect(playRecording).toBeEnabled();

    await playRecording.click();

    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await expect(editor).toContainText('// teacher playback edit');
    await expect(page.getByText(/playback status:\s*finished/i)).toBeVisible();
    await expect(page.getByText(/playhead ms:\s*25/i)).toBeVisible();

    const rawAfter = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(rawAfter).toBe(rawBefore);
  });

  test('allows learner editing while paused and resumes teacher playback', async ({ page }) => {
    const baseContent = 'console.log("teacher pause base");\n';
    const finalContent = `${baseContent}// teacher resumed final edit\n`;
    const recording = {
      id: 'teacher-recording-pause-resume-test',
      lessonId: 'lesson-and-solution',
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      durationMs: 2000,
      baseFiles: {
        '/example.html': '<h1>Teacher pause base</h1>\n',
        '/example.js': baseContent,
      },
      events: [
        { id: 'event-started', seq: 0, tMs: 0, type: 'recording.started', origin: 'system' },
        {
          id: 'event-opened',
          seq: 1,
          tMs: 0,
          type: 'file.opened',
          filePath: '/example.js',
          payload: { filePath: '/example.js' },
          origin: 'teacher',
        },
        {
          id: 'event-final-change',
          seq: 2,
          tMs: 2000,
          type: 'file.changed',
          filePath: '/example.js',
          payload: { content: finalContent },
          origin: 'teacher',
        },
      ],
    };

    await page.evaluate((teacherRecording) => {
      localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(teacherRecording));
    }, recording);

    const rawBefore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    await page.getByRole('button', { name: /play recording/i }).click();
    await expect(page.getByText(/mode:\s*teacher-playback/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();

    await page.getByRole('button', { name: /pause & try it/i }).click();
    await expect(page.getByText(/mode:\s*learner-editing/i)).toBeVisible();
    await expect(page.getByText(/playback status:\s*paused/i)).toBeVisible();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await editor.click();
    await page.keyboard.type('\n// learner temporary edit');
    await expect(editor).toContainText('// learner temporary edit');
    await page.waitForTimeout(300);

    const rawDuringLearnerEdit = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));
    const learnerDeltasDuringLearnerEdit = await page.evaluate(() => localStorage.getItem('interactive-poc.learnerDeltas'));

    expect(rawDuringLearnerEdit).toBe(rawBefore);
    expect(learnerDeltasDuringLearnerEdit).toBeNull();

    await page.getByRole('button', { name: /resume teacher/i }).click();
    await expect(page.getByText(/mode:\s*teacher-playback/i)).toBeVisible();
    await expect(page.getByText(/playback status:\s*playing/i)).toBeVisible();
    await expect(editor).toContainText('// teacher resumed final edit', { timeout: 5000 });
    await expect(page.getByText(/playback status:\s*finished/i)).toBeVisible();

    const rawAfter = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));
    const learnerDeltasAfterResume = await page.evaluate(() => localStorage.getItem('interactive-poc.learnerDeltas'));

    expect(rawAfter).toBe(rawBefore);
    expect(learnerDeltasAfterResume).toBeNull();
  });

  test('saves learner delta after pause and edit', async ({ page }) => {
    const baseContent = "export default 'Lesson file example.js content';\n";
    const recording = {
      id: 'teacher-recording-delta-test',
      lessonId: 'lesson-and-solution',
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      durationMs: 10000,
      baseFiles: {
        '/example.html': '<h1>Teacher delta base</h1>\n',
        '/example.js': baseContent,
      },
      events: [
        { id: 'event-started', seq: 0, tMs: 0, type: 'recording.started', origin: 'system' },
        {
          id: 'event-opened',
          seq: 1,
          tMs: 0,
          type: 'file.opened',
          filePath: '/example.js',
          payload: { filePath: '/example.js' },
          origin: 'teacher',
        },
        {
          id: 'event-future-change',
          seq: 2,
          tMs: 10000,
          type: 'file.changed',
          filePath: '/example.js',
          payload: { content: `${baseContent}// teacher future edit\n` },
          origin: 'teacher',
        },
      ],
    };

    await page.evaluate((teacherRecording) => {
      localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(teacherRecording));
    }, recording);

    const rawBefore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));
    const saveLearnerDelta = page.getByRole('button', { name: /save learner delta/i });

    await expect(saveLearnerDelta).toBeVisible();
    await expect(saveLearnerDelta).toBeDisabled();

    await page.getByRole('button', { name: /play recording/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await page.getByRole('button', { name: /pause & try it/i }).click();
    await expect(page.getByText(/mode:\s*learner-editing/i)).toBeVisible();
    await expect(saveLearnerDelta).toBeEnabled();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await editor.click();
    await page.keyboard.type('\n// learner delta edit');
    await expect(editor).toContainText('// learner delta edit');
    await page.waitForTimeout(600);

    await saveLearnerDelta.click();
    await expect(page.getByText(/learner delta count:\s*1/i)).toBeVisible();

    const deltas = await page.evaluate(() => {
      const raw = localStorage.getItem('interactive-poc.learnerDeltas');
      return raw ? JSON.parse(raw) : [];
    });
    const rawAfter = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(Array.isArray(deltas)).toBeTruthy();
    expect(deltas).toHaveLength(1);
    expect(typeof deltas[0].teacherTimestampMs).toBe('number');
    expect(deltas[0].addedOrModified['/example.js']).toContain('// learner delta edit');
    expect(Array.isArray(deltas[0].removed)).toBeTruthy();
    expect(rawAfter).toBe(rawBefore);
  });
});
