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

  test('saves learner delta after pause and edit', async ({ page }) => {
    test.skip(true, 'Enable after Phase 4 debug UI exists.');

    await page.getByRole('button', { name: /play recording/i }).click();
    await page.getByRole('button', { name: /^pause$/i }).click();

    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.type('\n// learner delta edit');

    await page.getByRole('button', { name: /save learner delta/i }).click();

    const deltas = await page.evaluate(() => {
      const raw = localStorage.getItem('interactive-poc.learnerDeltas');
      return raw ? JSON.parse(raw) : [];
    });

    expect(deltas.length).toBeGreaterThan(0);
    expect(Object.keys(deltas.at(-1).addedOrModified).length).toBeGreaterThan(0);
  });
});
