import { expect, test } from '@playwright/test';

const LESSON_URL = '/tests/python/python-intro';

test('runs and recovers an introductory multi-file Python lesson', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() =>
    localStorage.setItem('interactive-poc.workspaceLayout', JSON.stringify({ terminalOpen: true })),
  );
  await page.goto(LESSON_URL);

  const editMaterials = page.getByRole('button', { name: 'Edit Materials' });

  if (await editMaterials.isVisible()) {
    await editMaterials.click();
  }

  await expect(page.getByRole('button', { name: 'main.py' })).toBeVisible();
  await page.getByRole('button', { name: 'main.py' }).click();
  await expect(page.getByLabel('Python execution controls')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('ready', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.xterm-rows')).toContainText('Hello, Ada! from template', { timeout: 20_000 });

  const editor = page.getByRole('textbox', { name: 'Editor' });
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('from helpers import greet\nprint(greet("Grace"))\n');
  await expect(editor).toContainText('Grace');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.xterm-rows')).toContainText('Hello, Grace!', { timeout: 20_000 });

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('raise ValueError("intentional")\n');
  await expect(editor).toContainText('intentional');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.xterm-rows')).toContainText('ValueError: intentional', { timeout: 20_000 });

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('while True:\n    pass\n');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('running');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('status')).toContainText('ready', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Reset runtime' }).click();
  await expect(page.getByRole('status')).toContainText('ready', { timeout: 30_000 });
});
