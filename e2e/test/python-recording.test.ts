import { expect, test, type Page } from '@playwright/test';

const LESSON_URL = '/tests/python/python-intro';
const TEACHER_ID = 'dev-user-teacher-demo-8f4c2a9d';
const LEARNER_ID = 'dev-user-learner-demo-61b7c3e2';

async function selectIdentity(page: Page, label: 'Teacher Demo' | 'Learner Demo') {
  await page.getByLabel(/choose account/i).selectOption({ label });
  await expect(page.getByText(label === 'Teacher Demo' ? /^teacher$/i : /^learner$/i)).toBeVisible();
}

async function openLesson(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('interactive-poc.workspaceLayout', JSON.stringify({ terminalOpen: true }));

    let count = 0;
    window.addEventListener('tutorialkit:python-execution', () => {
      count += 1;
      (window as Window & { __pythonExecutionCount?: number }).__pythonExecutionCount = count;
    });
  });
  await page.goto(LESSON_URL);
  await expect(page.locator('[data-interactive-hydrated="true"]')).toBeAttached();
}

function pythonRecording(id: string) {
  return {
    id,
    lessonId: 'python-intro',
    version: 1,
    startedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 3000,
    baseFiles: {
      '/main.py': 'print("teacher base")\n',
      '/helpers.py': 'def greet(name):\n    return f"Hello, {name}!"\n',
    },
    events: [
      { id: 'started', seq: 0, tMs: 0, type: 'recording.started', origin: 'system' },
      {
        id: 'run-started',
        seq: 1,
        tMs: 1000,
        type: 'execution.started',
        origin: 'teacher',
        payload: { executionId: 'teacher-run', provider: 'pyodide', entrypoint: 'main.py' },
      },
      {
        id: 'run-output',
        seq: 2,
        tMs: 1100,
        type: 'execution.stdout',
        origin: 'teacher',
        payload: { executionId: 'teacher-run', value: 'teacher captured\n' },
      },
      {
        id: 'run-finished',
        seq: 3,
        tMs: 1200,
        type: 'execution.finished',
        origin: 'teacher',
        payload: { executionId: 'teacher-run', exitCode: 0, durationMs: 100 },
      },
      {
        id: 'teacher-edit',
        seq: 4,
        tMs: 2000,
        type: 'file.changed',
        filePath: '/main.py',
        origin: 'teacher',
        payload: { content: 'print("teacher final")\n' },
      },
    ],
  };
}

test.describe.serial('Python recording and learner runtime boundaries', () => {
  test.setTimeout(120_000);

  test('records Python execution events and previews captured output without rerunning', async ({ page }) => {
    await openLesson(page);
    await selectIdentity(page, 'Teacher Demo');
    await page.getByRole('radio', { name: /^editor only$/i }).check();
    await page.getByRole('button', { name: /^start recording$/i }).click();
    await expect(page.getByLabel(/recording studio controls/i)).toBeVisible();
    await expect(page.getByLabel('Python execution controls').getByRole('status')).toContainText('ready', {
      timeout: 30_000,
    });

    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.locator('.xterm-rows')).toContainText('Hello, Ada! from template');

    await page.getByRole('button', { name: 'main.py' }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('print("teacher changed")\n');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.locator('.xterm-rows')).toContainText('teacher changed');
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /save draft/i }).click();

    const recording = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.teacherRecording')!));
    expect(recording.events.filter((event: { type: string }) => event.type === 'execution.started')).toHaveLength(2);
    expect(recording.events.some((event: { type: string }) => event.type === 'execution.stdout')).toBe(true);

    const executionCount = await page.evaluate(
      () => (window as Window & { __pythonExecutionCount?: number }).__pythonExecutionCount ?? 0,
    );
    expect(executionCount).toBe(2);

    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.locator('.xterm-rows')).toContainText('teacher changed', { timeout: 10_000 });
    await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached();
    expect(
      await page.evaluate(() => (window as Window & { __pythonExecutionCount?: number }).__pythonExecutionCount ?? 0),
    ).toBe(executionCount);

    const executionStarts = recording.events.filter((event: { type: string }) => event.type === 'execution.started');
    const executionOutputs = recording.events.filter((event: { type: string }) => event.type === 'execution.stdout');
    await page.getByLabel(/lesson timeline/i).fill(String(Math.max(0, executionStarts[0].tMs - 1)));
    await expect(page.locator('.xterm-rows')).not.toContainText('Hello, Ada! from template');
    await page.getByLabel(/lesson timeline/i).fill(String(executionOutputs.at(-1).tMs));
    await expect(page.locator('.xterm-rows')).toContainText('teacher changed');
    expect(
      await page.evaluate(() => (window as Window & { __pythonExecutionCount?: number }).__pythonExecutionCount ?? 0),
    ).toBe(executionCount);
  });

  test('invalidates learner execution before restoring immutable teacher playback', async ({ page, request }) => {
    const recording = pythonRecording(`python-boundary-${Date.now()}`);
    await request.post('/api/interactive/demo/reset');
    await request.post('/api/interactive/auth/dev-login', { data: { userId: TEACHER_ID } });

    const malformed = structuredClone(recording);
    malformed.id = `${recording.id}-malformed`;

    const malformedEvents = malformed.events as unknown as Array<{ payload?: unknown }>;
    malformedEvents[2]!.payload = { executionId: 'teacher-run', value: 42 };

    const malformedPublish = await request.post('/api/interactive/teacher-recordings', { data: malformed });
    expect(malformedPublish.status()).toBe(400);

    const publish = await request.post('/api/interactive/teacher-recordings', { data: recording });
    expect(publish.ok()).toBe(true);

    await openLesson(page);
    await selectIdentity(page, 'Learner Demo');
    await page.getByRole('button', { name: 'Learner Lesson', exact: true }).click();
    await page
      .getByRole('button', { name: /start lesson/i })
      .last()
      .click();
    await expect(page.getByLabel(/interactive lesson controls/i)).toBeVisible();
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.locator('.xterm-rows')).toContainText('teacher captured', { timeout: 10_000 });
    await page.getByRole('button', { name: /pause and experiment/i }).click();

    await page.getByRole('button', { name: 'main.py' }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('while True:\n    pass\n');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByLabel('Python execution controls').getByRole('status')).toContainText('running');
    await page.getByRole('button', { name: /return to lecture/i }).click();
    await page.getByRole('button', { name: /save and resume/i }).click();

    await expect(page.getByRole('button', { name: /open my experiment at/i }).first()).toBeVisible();
    await expect(editor).toContainText('teacher final');
    await expect(page.locator('.xterm-rows')).toContainText('teacher captured');
    await page.waitForTimeout(500);
    await expect(page.locator('.xterm-rows')).not.toContainText('KeyboardInterrupt');

    const stored = await request.get(`/api/interactive/teacher-recordings/${recording.id}`);
    const persisted = await stored.json();
    expect((persisted.teacherRecording ?? persisted).events).toEqual(recording.events);

    await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached();
    await page
      .getByRole('button', { name: /open my experiment at/i })
      .first()
      .click();
    await expect(editor).toContainText('while True');
    expect(LEARNER_ID).toContain('learner');
  });
});
