import { expect, test } from '@playwright/test';

const POC_URL = process.env.TK_POC_URL ?? 'http://localhost:4321';

test.describe('interactive timeline POC', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(POC_URL);
    await page.evaluate(() => {
      localStorage.removeItem('interactive-poc.teacherRecording');
      localStorage.removeItem('interactive-poc.learnerDeltas');
    });
  });

  test('records one editor edit into teacher recording localStorage', async ({ page }) => {
    await page.getByRole('button', { name: /start recording/i }).click();

    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.type('\n// interactive poc recording edit');

    await page.getByRole('button', { name: /stop recording/i }).click();

    const recording = await page.evaluate(() => {
      const raw = localStorage.getItem('interactive-poc.teacherRecording');
      return raw ? JSON.parse(raw) : null;
    });

    expect(recording).toBeTruthy();
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
