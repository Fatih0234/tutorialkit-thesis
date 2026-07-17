import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const FALLBACK_POC_URL = 'http://localhost:4321';
const DEV_TEACHER_USER_ID = 'dev-user-teacher-demo-8f4c2a9d';
const DEV_LEARNER_USER_ID = 'dev-user-learner-demo-61b7c3e2';
const DEV_LEARNER_TWO_USER_ID = 'dev-user-learner-two-927f4d1a';
const POC_LESSON_PATH = '/tests/file-tree/lesson-and-solution';
const INTERACTIVE_DATA_DIR = fileURLToPath(new URL('../.interactive-data/', import.meta.url));

function getPocUrl(baseURL?: string) {
  const url = new URL(process.env.TK_POC_URL ?? baseURL ?? FALLBACK_POC_URL);

  if (url.pathname === '/') {
    url.pathname = POC_LESSON_PATH;
  }

  return url.toString();
}

function getPublishedRecordingFile(recordingId: string) {
  return new URL(`../.interactive-data/teacher-recordings/${recordingId}.json`, import.meta.url);
}

function seedPublishedExerciseVersion(
  exerciseId: string,
  version = 1,
  starterSource = 'export const answer = 0;\n',
) {
  const now = new Date().toISOString();
  const content = {
    title: 'Set the answer to 42',
    instructions: 'Change the exported answer in example.js to 42.',
    explanation:
      'The exported name is part of the module contract. Keep it named answer, then assign the numeric value 42.',
    hints: ['Export the number 42 from example.js.'],
    successFeedback: 'The answer is correct.',
    failureFeedback: 'The answer is not 42 yet.',
    starterFiles: { '/example.js': starterSource },
    fileRoles: { '/example.js': 'editable', '/__exercise_tests__/exercise.test.mjs': 'private-validation' },
    allowCreatePatterns: ['/**'],
    privateValidationFiles: {
      '/__exercise_tests__/exercise.test.mjs':
        "let learnerModule;\nasync function loadLearnerModule() { learnerModule ??= import('../example.js'); return learnerModule; }\nexport const checks = [{ id: 'exports-answer', async run() { const module = await loadLearnerModule(); if (!Object.hasOwn(module, 'answer')) throw new Error('Expected a named export called answer.'); } }, { id: 'answer-42', async run() { const module = await loadLearnerModule(); if (module.answer !== 42) throw new Error('Expected answer to equal 42.'); } }];\n",
    },
    validation: {
      protocol: 'tutorialkit-exercise-v1',
      entrypoint: '/__exercise_tests__/exercise.test.mjs',
      timeoutMs: 10000,
      checks: [
        { id: 'exports-answer', title: 'Exports a value named answer', failureFeedback: 'Keep the exported variable named answer.' },
        { id: 'answer-42', title: 'The exported answer is 42', failureFeedback: 'Change answer to 42.' },
      ],
    },
  };
  const catalogDir = new URL('../.interactive-data/exercise-catalog/', import.meta.url);
  const versionsDir = new URL('../.interactive-data/exercise-versions/', import.meta.url);
  mkdirSync(catalogDir, { recursive: true });
  mkdirSync(versionsDir, { recursive: true });
  writeFileSync(
    new URL(`${exerciseId}.json`, catalogDir),
    JSON.stringify({
      schemaVersion: 1,
      exerciseId,
      ownerUserId: DEV_TEACHER_USER_ID,
      title: content.title,
      activeVersion: version,
      createdAt: now,
      updatedAt: now,
    }),
  );
  writeFileSync(
    new URL(`${exerciseId}-v${version}.json`, versionsDir),
    JSON.stringify({
      schemaVersion: 1,
      exerciseId,
      version,
      ownerUserId: DEV_TEACHER_USER_ID,
      content,
      contentHash: `e2e-seeded-content-v${version}`,
      createdAt: now,
      publishedAt: now,
    }),
  );
}

async function seedIndexedDbMediaDraft(
  page: Page,
  {
    recordingId,
    mediaAssetId,
    eventMs,
    finalContent,
  }: { recordingId: string; mediaAssetId: string; eventMs: number; finalContent: string },
) {
  await page.evaluate(
    async ({ recordingId, mediaAssetId, eventMs, finalContent }) => {
      function writeAscii(view: DataView, offset: number, value: string) {
        for (let index = 0; index < value.length; index += 1) {
          view.setUint8(offset + index, value.charCodeAt(index));
        }
      }

      function createSilentWavBlob(durationMs: number) {
        const sampleRate = 8000;
        const channelCount = 1;
        const bytesPerSample = 2;
        const sampleCount = Math.ceil((sampleRate * durationMs) / 1000);
        const dataSize = sampleCount * channelCount * bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        writeAscii(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeAscii(view, 8, 'WAVE');
        writeAscii(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, channelCount, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
        view.setUint16(32, channelCount * bytesPerSample, true);
        view.setUint16(34, bytesPerSample * 8, true);
        writeAscii(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        return new Blob([buffer], { type: 'audio/wav' });
      }

      function createStore(db: IDBDatabase, name: string, keyPath: string) {
        if (!db.objectStoreNames.contains(name)) {
          return db.createObjectStore(name, { keyPath });
        }

        return undefined;
      }

      const baseContent = 'console.log("media clock base");\n';
      const mediaMetadata = {
        id: mediaAssetId,
        recordingId,
        kind: 'audio',
        mimeType: 'audio/wav',
        durationMs: 1200,
        createdAt: '2026-01-01T00:00:01.000Z',
      };
      const recording = {
        id: recordingId,
        lessonId: 'lesson-and-solution',
        version: 1,
        startedAt: '2026-01-01T00:00:00.000Z',
        durationMs: 1200,
        baseFiles: {
          '/example.html': '<h1>Media clock base</h1>\n',
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
            id: 'event-media-change',
            seq: 2,
            tMs: eventMs,
            type: 'file.changed',
            filePath: '/example.js',
            payload: { content: finalContent },
            origin: 'teacher',
          },
        ],
        mediaAssets: [mediaMetadata],
      };

      localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(recording));

      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('interactive-timeline-poc', 4);

        request.onupgradeneeded = () => {
          const db = request.result;
          const teacherRecordings = createStore(db, 'teacherRecordings', 'id');

          teacherRecordings?.createIndex('lessonId', 'lessonId', { unique: false });
          teacherRecordings?.createIndex('startedAt', 'startedAt', { unique: false });

          const learnerDeltas = createStore(db, 'learnerDeltas', 'id');

          learnerDeltas?.createIndex('lessonId', 'lessonId', { unique: false });
          learnerDeltas?.createIndex('teacherRecordingId', 'teacherRecordingId', { unique: false });
          learnerDeltas?.createIndex('createdAt', 'createdAt', { unique: false });

          const mediaAssets = createStore(db, 'mediaAssets', 'id');

          mediaAssets?.createIndex('recordingId', 'recordingId', { unique: false });
          mediaAssets?.createIndex('createdAt', 'createdAt', { unique: false });
        };
        request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['teacherRecordings', 'mediaAssets'], 'readwrite');

          transaction.objectStore('teacherRecordings').put(recording);
          transaction.objectStore('mediaAssets').put({ ...mediaMetadata, blob: createSilentWavBlob(1200) });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error ?? new Error('Unable to seed IndexedDB'));
          transaction.onabort = () => reject(transaction.error ?? new Error('Unable to seed IndexedDB'));
        };
      });
    },
    { recordingId, mediaAssetId, eventMs, finalContent },
  );
}

function hashFiles(files: Record<string, string>) {
  const serialized = JSON.stringify(Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))));
  let hash = 0;
  for (let index = 0; index < serialized.length; index += 1) hash = (hash * 31 + serialized.charCodeAt(index)) | 0;
  return Math.abs(hash).toString(36);
}

function createPublishedRecording(recordingId: string, finalContent: string, eventMs = 2000) {
  const baseContent = 'console.log("remote learner base");\n';

  return {
    id: recordingId,
    lessonId: 'lesson-and-solution',
    version: 1,
    startedAt: '2026-01-01T00:00:00.000Z',
    durationMs: eventMs,
    baseFiles: {
      '/example.html': '<h1>Remote published base</h1>\n',
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
        id: 'event-remote-change',
        seq: 2,
        tMs: eventMs,
        type: 'file.changed',
        filePath: '/example.js',
        payload: { content: finalContent },
        origin: 'teacher',
      },
    ],
  };
}

async function apiDevLogin(request: APIRequestContext, userId: string) {
  const response = await request.post('/api/interactive/auth/dev-login', { data: { userId } });

  expect(response.ok()).toBeTruthy();
}

async function seedPublishedRecording(request: APIRequestContext, recording: ReturnType<typeof createPublishedRecording>) {
  await apiDevLogin(request, DEV_TEACHER_USER_ID);

  const response = await request.post('/api/interactive/teacher-recordings', { data: recording });

  expect(response.ok()).toBeTruthy();
}

async function clickUntilTextVisible(page: Page, buttonName: RegExp, expectedText: RegExp) {
  const button = page.getByRole('button', { name: buttonName });

  await expect(button).toBeVisible();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await button.click();

    try {
      await expect(page.getByText(expectedText)).toBeVisible({ timeout: 2500 });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }

      await page.waitForTimeout(300);
    }
  }
}

async function chooseDemoIdentity(page: Page, learnerName: 'Teacher Demo' | 'Learner Demo' | 'Learner Two') {
  const identitySelect = page.getByLabel(/choose account/i);

  await expect(identitySelect).toBeVisible();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await identitySelect.selectOption({ label: learnerName });

    try {
      await expect(page.locator('#interactive-demo-identity-heading').locator('xpath=..').getByText(learnerName, { exact: true })).toBeVisible({ timeout: 2500 });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }

      await page.waitForTimeout(300);
    }
  }
}

async function signInAsTeacher(page: Page) {
  await chooseDemoIdentity(page, 'Teacher Demo');
  await expect(page.getByText(/^teacher$/i)).toBeVisible();
}

async function signInAsLearner(page: Page, learnerName: 'Learner Demo' | 'Learner Two' = 'Learner Demo') {
  await chooseDemoIdentity(page, learnerName);
  await expect(page.getByText(/^learner$/i)).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page.getByText('Choose an account', { exact: true })).toBeVisible();
}

async function expandDetails(page: Page, summaryName: string) {
  const summary = page.locator('summary').filter({ hasText: summaryName }).first();

  await expect(summary).toBeVisible();

  const isOpen = await summary.evaluate((element) => element.closest('details')?.hasAttribute('open') ?? false);

  if (!isOpen) {
    await summary.click();
  }
}

async function openRecordingLibrary(page: Page) {
  await expect(page.getByLabel(/your recordings/i)).toBeVisible();
}

async function clickRoleTabUntilVisible(page: Page, tabName: 'Teacher Studio' | 'Learner Lesson', heading: RegExp) {
  const tab = page.getByRole('button', { name: tabName, exact: true });

  await expect(tab).toBeVisible();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await tab.click();

    try {
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible({ timeout: 2500 });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }

      await page.waitForTimeout(300);
    }
  }
}

async function openLearnerSection(page: Page) {
  await clickRoleTabUntilVisible(page, 'Learner Lesson', /interactive lessons/i);
}

async function openTeacherSection(page: Page) {
  await clickRoleTabUntilVisible(page, 'Teacher Studio', /teacher studio/i);
}

async function publishAndOpenRecordingAsLearner(page: Page, recording: any) {
  const loginResponse = await page.request.post('/api/interactive/auth/dev-login', { data: { userId: DEV_TEACHER_USER_ID } });
  expect(loginResponse.ok()).toBe(true);
  const publishResponse = await page.request.post('/api/interactive/teacher-recordings', { data: recording });
  expect(publishResponse.ok()).toBe(true);
  await page.reload();
  await signInAsLearner(page);
  await openLearnerSection(page);
  await page.getByRole('button', { name: /start lesson/i }).click();
  await expect(page.getByLabel(/interactive lesson controls/i)).toBeVisible();
  await page.evaluate((sourceRecording) => {
    localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(sourceRecording));
  }, recording);
}

async function drawWhiteboardShape(page: Page, toolName: 'Rectangle' | 'Ellipse' | 'Arrow', start: { x: number; y: number }, end: { x: number; y: number }) {
  const board = page.getByTestId('interactive-whiteboard');
  await board.getByRole('radio', { name: toolName, exact: true }).click({ force: true });
  const canvas = board.locator('canvas.interactive');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Whiteboard canvas is not visible.');
  await page.mouse.move(box.x + start.x, box.y + start.y);
  await page.mouse.down();
  await page.mouse.move(box.x + end.x, box.y + end.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(650);
}

async function startTeacherRecording(page: Page, mode: 'timeline' | 'audio' | 'camera' = 'timeline') {
  const backToSetup = page.getByRole('button', { name: /back to lecture setup|dashboard/i });

  if (await backToSetup.isVisible().catch(() => false)) {
    await backToSetup.click();
  }

  const modeName =
    mode === 'audio' ? /editor \+ microphone/i : mode === 'camera' ? /editor \+ camera \+ microphone/i : /^editor only$/i;

  await page.getByRole('radio', { name: modeName }).check();
  await page.getByRole('button', { name: /^start recording$/i }).click();
  await expect(page.getByLabel(/recording studio controls/i)).toBeVisible();
}

async function waitForPlayheadToAdvance(page: Page) {
  await expect
    .poll(async () => {
      const playheadText = await page.getByText(/playhead ms:\s*\d+/i).textContent();
      return Number(playheadText?.match(/playhead ms:\s*(\d+)/i)?.[1] ?? 0);
    })
    .toBeGreaterThan(0);
}

async function confirmResetDemoData(page: Page) {
  const response = await page.request.post('/api/interactive/demo/reset');
  expect(response.ok()).toBe(true);
  await page.reload();
  await expect(page.locator('[data-interactive-hydrated="true"]')).toBeAttached();
}

async function seedDemoRecordingFromTeacherDashboard(page: Page) {
  await openTeacherSection(page);
  await confirmResetDemoData(page);
  const response = await page.request.post('/api/interactive/demo/seed');
  expect(response.ok()).toBe(true);
  await page.reload();
  await expect(page.locator('[data-interactive-hydrated="true"]')).toBeAttached();
  await openRecordingLibrary(page);
  await expect(page.getByText(/lesson and solution/i).first()).toBeVisible();
}

function simpleHashFilesForTest(files: Record<string, string>) {
  const serialized = JSON.stringify(Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))));
  let hash = 0;

  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash * 31 + serialized.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function createConflictResolutionRecording({
  recordingId,
  futureFilePath = '/example.js',
  eventId = 'event-future-change',
  eventMs = 2000,
  jsBaseContent = "export default 'Conflict resolution base';\n",
  futureContent,
}: {
  recordingId: string;
  futureFilePath?: '/example.js' | '/example.html';
  eventId?: string;
  eventMs?: number;
  jsBaseContent?: string;
  futureContent?: string;
}) {
  const futureTeacherContent =
    futureContent ??
    (futureFilePath === '/example.js'
      ? `${jsBaseContent}// teacher conflict resolution final edit\n`
      : '<h1>Teacher changed conflict resolution HTML later</h1>\n');

  return {
    id: recordingId,
    lessonId: 'lesson-and-solution',
    version: 1,
    startedAt: '2026-01-01T00:00:00.000Z',
    durationMs: eventMs,
    baseFiles: {
      '/example.html': '<h1>Conflict resolution base</h1>\n',
      '/example.js': jsBaseContent,
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
        id: eventId,
        seq: 2,
        tMs: eventMs,
        type: 'file.changed',
        filePath: futureFilePath,
        payload: { content: futureTeacherContent },
        origin: 'teacher',
      },
    ],
  };
}

async function prepareLocalConflictResolutionFlow({
  page,
  recordingId,
  learnerEdit,
  futureFilePath = '/example.js',
  futureContent,
}: {
  page: Page;
  recordingId: string;
  learnerEdit: string;
  futureFilePath?: '/example.js' | '/example.html';
  futureContent?: string;
}) {
  const recording = createConflictResolutionRecording({ recordingId, futureFilePath, futureContent });

  await page.evaluate((teacherRecording) => {
    localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(teacherRecording));
  }, recording);

  const rawBefore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));
  await publishAndOpenRecordingAsLearner(page, recording);
  await page.getByRole('button', { name: /^play$/i }).click();
  await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
  await waitForPlayheadToAdvance(page);
  await page.getByRole('button', { name: /pause and experiment/i }).click();
  await expect(page.getByText('My Experiment', { exact: true })).toBeVisible();

  const editor = page.getByRole('textbox', { name: 'Editor' }).first();

  await editor.click();
  await page.keyboard.type(`\n${learnerEdit}`);
  await expect(editor).toContainText(learnerEdit);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /save experiment/i }).click();
  await expect(page.getByText(/saved work count:\s*1/i)).toBeAttached();
  await expect(page.getByText(/work status:\s*saved/i)).toBeAttached();

  await page.getByRole('button', { name: /return to lecture/i }).click();
  await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached({ timeout: 5000 });

  if (futureFilePath === '/example.js') {
    await expect(editor).toContainText('// teacher conflict resolution final edit');
    await expect(editor).not.toContainText(learnerEdit);
  }

  return { editor, learnerEdit, rawBefore, recording };
}


test.describe('interactive timeline POC', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    rmSync(INTERACTIVE_DATA_DIR, { recursive: true, force: true });
    await page.goto(getPocUrl(baseURL));
    await page.evaluate(() => {
      localStorage.removeItem('interactive-poc.teacherRecording');
      localStorage.removeItem('interactive-poc.learnerDeltas');
      localStorage.removeItem('interactive-poc.fakeMediaRecorder');
      localStorage.removeItem('interactive-poc.workspaceLayout');
      localStorage.removeItem('interactive-poc.indexeddbMigrationComplete');
    });
    await expect(page.locator('[data-interactive-hydrated="true"]')).toBeAttached();
  });

  test('management pages keep only clear product actions', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /interactive learning/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /teacher studio/i })).toBeVisible();
    await expect(page.getByLabel(/choose account/i)).toBeVisible();
    await expect(page.getByRole('option', { name: /teacher demo/i })).toBeAttached();
    await expect(page.getByRole('button', { name: /edit materials/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^start recording$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /new recording|save draft|publish recording|export package|import package|demo seed|reset demo data/i })).toHaveCount(0);
    await expect(page.getByText(/thesis demo walkthrough|debug details|technical status|current draft id|event count/i)).toHaveCount(0);
    await openLearnerSection(page);

    await expect(page.getByRole('heading', { name: /interactive lessons/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /available lessons/i })).toBeVisible();
    await expect(page.getByText(/thesis demo walkthrough|debug details|technical status|recording id|event count/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /save experiment/i })).toHaveCount(0);
    await expect(page.getByLabel(/lesson timeline/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /pause & try it/i })).toHaveCount(0);
    await expect(page.locator('#interactive-experience-root > [data-interactive-experience-root]')).toBeVisible();
    await expect(page.locator('[data-tutorialkit-standard-layout]')).toHaveAttribute('inert', '');
    await expect(page.locator('[data-tutorialkit-standard-layout]')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('[data-interactive-management-shell]')).toBeVisible();
    await expect(page.locator('[data-interactive-workspace-shell]')).toBeHidden();
    await expect(page.getByRole('tab', { name: /output|terminal/i })).toHaveCount(0);
  });

  test('interactive counter fixture provides a ready learner exercise and teacher solution', async ({ page, baseURL }) => {
    const counterUrl = new URL('/tests/file-tree/interactive-counter', baseURL ?? FALLBACK_POC_URL);
    await page.goto(counterUrl.toString());
    await expect(page.locator('[data-interactive-hydrated="true"]')).toBeAttached();
    await expect(page.getByText('Interactive Counter Lab', { exact: true }).first()).toBeAttached();

    await page.getByRole('button', { name: /edit materials/i }).click();
    await page.getByRole('button', { name: 'example.js' }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();
    await expect(editor).toContainText('Learner challenge: decrease the count without going below zero.');
    await expect(editor).toContainText('Learner challenge: reset the count to zero.');
    await expect(page.getByRole('button', { name: 'styles.css' })).toBeVisible();
    await expect(page.getByRole('button', { name: /solve/i })).toBeVisible();

    await page.getByRole('button', { name: /solve/i }).click();
    await expect(editor).toContainText('count = Math.max(0, count - 1);');
    await expect(editor).toContainText('count = 0;');
  });

  test('teacher prepares materials separately before recording', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toBeHidden();
    await page.getByRole('button', { name: /edit materials/i }).click();
    await expect(page.getByRole('heading', { name: /preparing lecture materials/i })).toBeVisible();
    await expect(page.getByText(/recording is off/i)).toBeVisible();

    await page.getByRole('button', { name: 'example.js' }).click();
    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type('\n// prepared before recording');
    await expect(editor).toContainText('// prepared before recording');
    await page.getByRole('button', { name: /exit preparation/i }).click();
    await expect(page.getByRole('region', { name: /lecture setup/i })).toBeVisible();
    await expect(page.getByLabel(/initial file/i)).toHaveValue('/example.js');
    await expect(editor).toBeHidden();

    await startTeacherRecording(page);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();

    const recording = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.teacherRecording') || 'null'));

    expect(recording.baseFiles['/example.js']).toContain('// prepared before recording');
    expect(
      recording.events.some(
        (event: any) => event.type === 'file.changed' && event.payload?.content?.includes('// prepared before recording'),
      ),
    ).toBeFalsy();
  });

  test('immersive workspace reveals foldable explanation and terminal panels', async ({ page }) => {
    await page.getByRole('button', { name: /edit materials/i }).click();

    const explanationToggle = page.getByRole('button', { name: /^explanation$/i });
    const terminalToggle = page.getByRole('button', { name: /^terminal$/i });

    await expect(explanationToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(terminalToggle).toHaveAttribute('aria-pressed', 'false');

    const resourceToolbar = page.getByRole('navigation', { name: /presentation resources/i });
    const helpButton = page.getByRole('button', { name: /^(reset|solve)$/i });
    const editor = page.getByRole('textbox', { name: 'Editor' });
    await expect(resourceToolbar).toBeVisible();
    await expect(helpButton).toBeVisible();
    const resourceToolbarBox = await resourceToolbar.boundingBox();
    const helpButtonBox = await helpButton.boundingBox();
    const editorBox = await editor.boundingBox();
    expect(resourceToolbarBox).not.toBeNull();
    expect(helpButtonBox).not.toBeNull();
    expect(editorBox).not.toBeNull();
    expect(resourceToolbarBox!.y + resourceToolbarBox!.height).toBeLessThanOrEqual(helpButtonBox!.y + 1);
    expect(helpButtonBox!.y + helpButtonBox!.height).toBeLessThanOrEqual(editorBox!.y + 1);
    await helpButton.click();

    await explanationToggle.click();
    const explanation = page.getByRole('complementary', { name: /lesson explanation/i });
    await expect(explanation).toBeVisible();
    await expect(explanation.getByRole('heading', { name: /file tree test/i })).toBeVisible();
    await expect(explanationToggle).toHaveAttribute('aria-pressed', 'true');

    await terminalToggle.click();
    await expect(page.getByLabel(/live terminal panel/i)).toBeVisible();
    await expect(page.getByRole('tab', { name: /output/i })).toBeVisible();
    await expect(terminalToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(/lesson timeline/i)).toHaveCount(0);

    await page.getByRole('button', { name: /close explanation/i }).click();
    await expect(explanation).toBeHidden();
    await terminalToggle.click();
    await expect(page.getByLabel(/live terminal panel/i)).toBeHidden();

    await page.getByRole('button', { name: /show presentation resource: explanation/i }).click();
    const presentationExplanation = page.locator('[data-presentation-resource="lesson-explanation"]');
    await expect(presentationExplanation).toHaveAttribute('data-presentation-mode', 'minimized');
    await page.getByRole('button', { name: /focus explanation/i }).click();
    await expect(presentationExplanation).toHaveAttribute('data-presentation-mode', 'focused');
    await expect(presentationExplanation.getByRole('heading', { name: /file tree test/i })).toBeVisible();
    await page.getByRole('button', { name: /hide explanation/i }).click();
    await expect(presentationExplanation).toHaveCount(0);

    await page.getByRole('button', { name: /focus building a javascript counter/i }).click();
    const deckRevealPoint = page.locator('[data-presentation-resource="javascript-counter-deck"] p').filter({ hasText: /read the current value/i });
    await page.keyboard.press('ArrowRight');
    await expect(deckRevealPoint).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(deckRevealPoint).toHaveCount(0);
    await page.getByText(/edit presentation/i).click();
    await page.getByLabel(/deck title/i).fill('My Counter Lecture');
    await page.getByLabel(/deck title/i).press('ArrowRight');
    await expect(deckRevealPoint).toHaveCount(0);
    await page.getByRole('button', { name: /add slide/i }).click();
    await expect(page.getByText(/slide 1 \/ 3/i)).toBeVisible();
    await page.getByRole('button', { name: /minimize my counter lecture/i }).click();
    await expect(page.getByRole('button', { name: /hide presentation resource: my counter lecture/i })).toBeVisible();

    const savedLayout = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.workspaceLayout') || 'null'));
    expect(savedLayout).toMatchObject({ explanationOpen: false, terminalOpen: false });
    expect(savedLayout.explanationSize).toBeGreaterThanOrEqual(18);
    expect(savedLayout.terminalSize).toBeGreaterThanOrEqual(18);
  });

  test('presentation resources remain accessible without covering the editor at narrow widths', async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 720 });
    await page.getByRole('button', { name: /edit materials/i }).click();

    const resourceToolbar = page.getByRole('navigation', { name: /presentation resources/i });
    const helpButton = page.getByRole('button', { name: /^(reset|solve)$/i });
    const editor = page.getByRole('textbox', { name: 'Editor' });
    const whiteboardButton = page.getByRole('button', { name: /show presentation resource: whiteboard/i });
    await expect(resourceToolbar).toBeVisible();
    await expect(helpButton).toBeVisible();
    await whiteboardButton.scrollIntoViewIfNeeded();
    await whiteboardButton.click();
    await expect(page.locator('[data-presentation-resource="lecture-whiteboard"]')).toHaveAttribute('data-presentation-mode', 'minimized');

    const resourceToolbarBox = await resourceToolbar.boundingBox();
    const helpButtonBox = await helpButton.boundingBox();
    const editorBox = await editor.boundingBox();
    expect(resourceToolbarBox).not.toBeNull();
    expect(helpButtonBox).not.toBeNull();
    expect(editorBox).not.toBeNull();
    expect(resourceToolbarBox!.y + resourceToolbarBox!.height).toBeLessThanOrEqual(helpButtonBox!.y + 1);
    expect(helpButtonBox!.y + helpButtonBox!.height).toBeLessThanOrEqual(editorBox!.y + 1);
    await helpButton.click();
  });

  test('terminal stays in the immersive recording and review workspace only', async ({ page }) => {
    await startTeacherRecording(page);
    await expect(page.locator('[data-interactive-management-shell]')).toHaveCount(0);
    await expect(page.locator('[data-interactive-workspace-shell]')).toBeVisible();

    const terminalToggle = page.getByRole('button', { name: /^terminal$/i });
    const explanationToggle = page.getByRole('button', { name: /^explanation$/i });
    const eventCount = page.getByText(/event count:\s*\d+/i);
    const beforeToggle = await eventCount.textContent();

    await terminalToggle.click();
    await explanationToggle.click();
    await expect(page.getByRole('tab', { name: /output/i })).toBeVisible();
    await expect(page.getByRole('complementary', { name: /lesson explanation/i })).toBeVisible();
    await page.waitForTimeout(150);
    await expect(eventCount).toHaveText(beforeToggle || '');

    await page.getByRole('button', { name: /stop recording/i }).click();
    await expect(page.getByRole('heading', { name: /recording review/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /output/i })).toBeVisible();
    await expect(page.getByLabel(/lesson timeline/i)).toBeVisible();

    await page.getByRole('button', { name: /^dashboard$/i }).click();
    await expect(page.locator('[data-interactive-management-shell]')).toBeVisible();
    await expect(page.locator('[data-interactive-workspace-shell]')).toBeHidden();
    await expect(page.getByRole('tab', { name: /output/i })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toBeHidden();
  });

  test('website preview keeps one persistent host across presentation modes', async ({ page }) => {
    await page.getByRole('button', { name: /edit materials/i }).click();

    const preview = page.locator('[data-presentation-resource="website-preview"]');
    const previewHost = page.locator('[data-presentation-preview-host]');

    await expect(preview).toHaveAttribute('data-presentation-mode', 'minimized');
    await expect(previewHost).toBeAttached();
    await previewHost.evaluate((element: HTMLDivElement) => {
      (window as any).__interactivePreviewHost = element;
      element.dataset.presentationIdentity = 'persistent-preview';
    });
    const iframe = previewHost.locator('iframe').first();
    await expect(iframe).toBeAttached({ timeout: 20000 });
    await iframe.evaluate((element: HTMLIFrameElement) => {
      (window as any).__interactivePreviewFrame = element;
    });
    const website = page.frameLocator('[data-presentation-preview-host] iframe').first();
    await website.getByRole('button', { name: /click the live preview/i }).click();
    await expect(website.getByText(/clicked 1 time/i)).toBeVisible();

    await page.getByRole('button', { name: /focus website preview/i }).click();
    await expect(preview).toHaveAttribute('data-presentation-mode', 'focused');
    await page.getByRole('button', { name: /minimize website preview/i }).click();
    await expect(preview).toHaveAttribute('data-presentation-mode', 'minimized');
    await page.getByRole('button', { name: /hide website preview/i }).click();
    await expect(preview).toHaveAttribute('data-presentation-mode', 'hidden');
    await page.getByRole('button', { name: /show presentation resource: website preview/i }).click();
    await expect(preview).toHaveAttribute('data-presentation-mode', 'minimized');

    expect(await previewHost.evaluate((element: HTMLDivElement) =>
      (window as any).__interactivePreviewHost === element && element.dataset.presentationIdentity === 'persistent-preview')).toBeTruthy();
    expect(await iframe.evaluate((element: HTMLIFrameElement) => (window as any).__interactivePreviewFrame === element)).toBeTruthy();
    await expect(website.getByText(/clicked 1 time/i)).toBeVisible();
  });

  test('editor scrolling and text selection replay with the teacher pointer', async ({ page }) => {
    await page.getByRole('button', { name: /edit materials/i }).click();
    const editor = page.getByRole('textbox', { name: 'Editor' }).first();
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText(`\n${Array.from({ length: 140 }, (_, index) => `// scroll replay line ${index + 1}`).join('\n')}`);
    await page.waitForTimeout(250);
    await page.locator('.cm-scroller').first().evaluate((element) => element.scrollTo({ top: 0, left: 0 }));
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: /hide presentation resource: website preview/i }).click();
    await page.getByRole('button', { name: /hide presentation resource: building a javascript counter/i }).click();
    await page.getByRole('button', { name: /exit preparation/i }).click();
    await startTeacherRecording(page);
    await page.waitForTimeout(1600);

    const scroller = page.locator('.cm-scroller').first();
    await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight, left: 0 }));
    await page.waitForTimeout(250);
    await editor.click({ position: { x: 220, y: 80 } });
    await page.keyboard.press('Shift+Home');
    const teacherSelection = scroller.locator('.cm-selectionBackground').first();
    await expect(teacherSelection).toBeVisible();
    await page.waitForTimeout(200);
    const teacherSelectionBox = await teacherSelection.boundingBox();
    expect(teacherSelectionBox).not.toBeNull();
    const teacherEditorBox = await scroller.boundingBox();
    expect(teacherEditorBox).not.toBeNull();
    const pointerTarget = { x: teacherEditorBox!.x + Math.min(300, teacherEditorBox!.width / 2), y: teacherEditorBox!.y + Math.min(100, teacherEditorBox!.height / 2) };
    await page.mouse.click(pointerTarget.x, pointerTarget.y);
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'))).not.toBeNull();

    const recording = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.teacherRecording') || 'null'));
    const scrollEvent = recording.events.findLast((event: any) => event.type === 'editor.scrolled');
    const selectionEvent = recording.events.findLast((event: any) => event.type === 'editor.selection.changed' && event.payload?.anchor !== event.payload?.head);
    const pointerEvent = recording.events.findLast((event: any) => event.type === 'pointer.clicked' && event.payload?.anchor?.kind === 'editor');
    expect(scrollEvent?.payload.top).toBeGreaterThan(0);
    expect(selectionEvent).toBeTruthy();
    expect(pointerEvent).toBeTruthy();
    expect(pointerEvent.payload.coordinateSpaceVersion).toBe(3);
    expect(pointerEvent.payload.anchor).toMatchObject({ kind: 'editor', filePath: selectionEvent.filePath });
    expect(recording.events.filter((event: any) => event.type === 'file.changed')).toHaveLength(0);

    await page.setViewportSize({ width: 1500, height: 720 });
    await page.getByLabel(/lesson timeline/i).fill(String(pointerEvent.tMs));
    await expect.poll(() => scroller.evaluate((element) => Math.round(element.scrollTop))).toBe(Math.round(scrollEvent.payload.top));
    const replaySelection = scroller.locator('[data-instructor-selection]').first();
    const learnerCursor = scroller.locator('[data-learner-cursor="blurred"]').first();
    await expect(replaySelection).toBeVisible();
    await expect(learnerCursor).toBeVisible();
    await expect(page.locator('[data-teacher-pointer]')).toHaveAttribute('data-pointer-visible', 'true');
    await page.waitForTimeout(120);
    const replaySelectionBox = await replaySelection.boundingBox();
    const replayPointerBox = await page.locator('[data-teacher-pointer]').boundingBox();
    const replayHotspotBox = await page.locator('[data-pointer-hotspot]').boundingBox();
    const replayScrollerBox = await scroller.boundingBox();
    const replayEditorBox = await editor.boundingBox();
    expect(replaySelectionBox).not.toBeNull();
    expect(replayPointerBox).not.toBeNull();
    expect(replayEditorBox).not.toBeNull();
    expect(replayHotspotBox).not.toBeNull();
    expect(replayScrollerBox).not.toBeNull();
    expect(Math.abs((replayHotspotBox!.x - replayScrollerBox!.x) - 300)).toBeLessThanOrEqual(2);
    expect(Math.abs((replayHotspotBox!.y - replayScrollerBox!.y) - 100)).toBeLessThanOrEqual(2);
    expect(replayPointerBox!.y).toBeGreaterThanOrEqual(replayEditorBox!.y);
    expect(replayPointerBox!.y).toBeLessThanOrEqual(replayEditorBox!.y + replayEditorBox!.height);

    await page.getByLabel(/lesson timeline/i).fill('0');
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
  });

  test('workspace-relative pointer stays aligned when playback controls resize the presentation', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('interactive-poc.pointerDebug', 'true'));
    await page.reload();
    await expect(page.locator('[data-interactive-hydrated="true"]')).toBeAttached();
    await startTeacherRecording(page);
    await page.waitForTimeout(1600);
    await page.getByRole('button', { name: /focus building a javascript counter/i }).click();
    const revealButton = page.getByRole('button', { name: /reveal next/i });
    await expect(revealButton).toBeVisible();
    await revealButton.click();
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'))).not.toBeNull();

    const recording = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.teacherRecording') || 'null'));
    const revealClick = recording.events.findLast((event: any) => event.type === 'pointer.clicked' && event.payload?.surface === 'workspace');
    expect(revealClick?.payload.coordinateSpaceVersion).toBe(3);
    expect(revealClick?.payload.anchor).toMatchObject({ kind: 'element', id: 'deck:javascript-counter-deck:next-reveal' });
    await page.getByLabel(/lesson timeline/i).fill(String(revealClick.tMs));
    await expect(revealButton).toBeVisible();
    await expect(page.locator('[data-teacher-pointer]')).toHaveAttribute('data-pointer-surface', 'workspace');
    await page.waitForTimeout(120);
    const buttonBox = await revealButton.boundingBox();
    const crosshairCenterBox = await page.locator('[data-pointer-debug-center]').boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(crosshairCenterBox).not.toBeNull();
    const buttonCenter = { x: buttonBox!.x + buttonBox!.width / 2, y: buttonBox!.y + buttonBox!.height / 2 };
    const crosshairCenter = { x: crosshairCenterBox!.x + crosshairCenterBox!.width / 2, y: crosshairCenterBox!.y + crosshairCenterBox!.height / 2 };
    expect(Math.abs(crosshairCenter.x - buttonCenter.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(crosshairCenter.y - buttonCenter.y)).toBeLessThanOrEqual(1);
    await page.evaluate(() => localStorage.removeItem('interactive-poc.pointerDebug'));
  });

  test('teacher pointer records across the workspace and bridged website preview', async ({ page, baseURL }) => {
    const counterUrl = new URL('/tests/file-tree/interactive-counter', baseURL ?? FALLBACK_POC_URL);
    await page.goto(counterUrl.toString());
    await expect(page.locator('[data-interactive-hydrated="true"]')).toBeAttached();
    await startTeacherRecording(page);

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();
    await editor.hover({ position: { x: 80, y: 60 } });
    await page.waitForTimeout(120);
    const previewFrame = page.frameLocator('[data-presentation-preview-host] iframe').first();
    await expect(previewFrame.locator('body')).toBeVisible({ timeout: 20000 });
    await expect.poll(() => previewFrame.locator('body').evaluate(() => Boolean((window as any).__tutorialKitPointerBridgeEnabled))).toBe(true);
    await previewFrame.locator('body').hover({ position: { x: 120, y: 100 } });
    await page.waitForTimeout(150);
    await previewFrame.locator('body').click({ button: 'right', position: { x: 120, y: 100 } });
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'))).not.toBeNull();

    const recording = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.teacherRecording') || 'null'));
    const pointerEvents = recording.events.filter((event: any) => event.type === 'pointer.changed' || event.type === 'pointer.clicked');
    expect(pointerEvents.some((event: any) => event.payload?.surface === 'workspace' && event.payload?.visible)).toBeTruthy();
    const previewEvent = pointerEvents.find((event: any) => event.payload?.surface === 'preview' && event.payload?.visible);
    expect(previewEvent?.payload.x).toBeGreaterThanOrEqual(0);
    expect(previewEvent?.payload.x).toBeLessThanOrEqual(1);
    expect(previewEvent?.payload.y).toBeGreaterThanOrEqual(0);
    expect(previewEvent?.payload.y).toBeLessThanOrEqual(1);
    const rightClickEvent = pointerEvents.find((event: any) => event.type === 'pointer.clicked' && event.payload?.surface === 'preview' && event.payload?.button === 'right');
    expect(rightClickEvent).toBeTruthy();

    await expect(page.locator('[data-pointer-click-animation="right"]')).toHaveCount(0);
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect.poll(() => page.locator('[data-teacher-pointer]').getAttribute('data-pointer-click-sequence'), { timeout: Math.max(3000, rightClickEvent.tMs + 1500) }).not.toBe('0');

    await page.getByLabel(/lesson timeline/i).fill(String(previewEvent.tMs));
    const teacherPointer = page.locator('[data-teacher-pointer]');
    await expect(teacherPointer).toHaveAttribute('data-pointer-surface', 'preview');
    await expect(teacherPointer).toHaveAttribute('data-pointer-visible', 'true');
    await page.waitForTimeout(120);
    const pointerBox = await teacherPointer.boundingBox();
    const iframeBox = await page.locator('[data-presentation-preview-host] iframe').first().boundingBox();
    expect(pointerBox).not.toBeNull();
    expect(iframeBox).not.toBeNull();
    expect(pointerBox!.x).toBeGreaterThanOrEqual(iframeBox!.x - 2);
    expect(pointerBox!.y).toBeGreaterThanOrEqual(iframeBox!.y - 2);
    expect(pointerBox!.x).toBeLessThanOrEqual(iframeBox!.x + iframeBox!.width + 2);
    expect(pointerBox!.y).toBeLessThanOrEqual(iframeBox!.y + iframeBox!.height + 2);

    await publishAndOpenRecordingAsLearner(page, recording);
    await page.getByLabel(/lesson timeline/i).fill(String(previewEvent.tMs));
    await expect(page.locator('[data-teacher-pointer]')).toHaveAttribute('data-pointer-surface', 'preview');
    await expect(page.locator('[data-teacher-pointer]')).toHaveAttribute('data-pointer-visible', 'true');
    const learnerRecordingBefore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));
    await page.mouse.move(30, 30);
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'))).toBe(learnerRecordingBefore);
  });

  test('same-side resource windows overlap and the toolbar records which window is in front', async ({ page }) => {
    await startTeacherRecording(page);
    const deck = page.locator('[data-presentation-resource="javascript-counter-deck"]');
    const whiteboard = page.locator('[data-presentation-resource="lecture-whiteboard"]');
    await expect(deck).toHaveAttribute('data-presentation-frontmost', 'true');

    await page.getByRole('button', { name: /show presentation resource: whiteboard/i }).click();
    await expect(whiteboard).toHaveAttribute('data-presentation-mode', 'minimized');
    await expect(whiteboard).toHaveAttribute('data-presentation-frontmost', 'true');
    await expect(deck).toHaveAttribute('data-presentation-frontmost', 'false');
    const deckBox = await deck.boundingBox();
    const whiteboardBox = await whiteboard.boundingBox();
    expect(deckBox).toMatchObject({ x: whiteboardBox?.x, y: whiteboardBox?.y, width: whiteboardBox?.width, height: whiteboardBox?.height });

    await page.getByRole('button', { name: /bring forward presentation resource: building a javascript counter/i }).click();
    await expect(deck).toHaveAttribute('data-presentation-frontmost', 'true');
    await expect(whiteboard).toHaveAttribute('data-presentation-frontmost', 'false');
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();

    const recording = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.teacherRecording') || 'null'));
    const cues = recording.events.filter((event: any) => event.type === 'presentation.changed');
    expect(cues).toHaveLength(2);
    expect(cues[0].payload.layout.frontmostBySide.left).toBe('lecture-whiteboard');
    expect(cues[1].payload.layout.frontmostBySide.left).toBe('javascript-counter-deck');
    await page.getByLabel(/lesson timeline/i).fill(String(cues[0].tMs));
    await expect(whiteboard).toHaveAttribute('data-presentation-frontmost', 'true');
    await page.getByLabel(/lesson timeline/i).fill(String(cues[1].tMs));
    await expect(deck).toHaveAttribute('data-presentation-frontmost', 'true');
  });

  test('teacher whiteboard preparation, recording, publication, and learner seeking are deterministic', async ({ page }) => {
    test.setTimeout(90_000);
    await signInAsTeacher(page);
    await page.getByRole('button', { name: /edit materials/i }).click();
    await page.getByRole('button', { name: /show presentation resource: whiteboard/i }).click();
    await page.getByRole('button', { name: /focus whiteboard/i }).click();
    await drawWhiteboardShape(page, 'Rectangle', { x: 280, y: 220 }, { x: 430, y: 320 });
    await expect(page.getByTestId('interactive-whiteboard')).toHaveAttribute('data-whiteboard-element-count', '1');

    await page.getByRole('button', { name: /start recording/i }).click();
    await page.waitForTimeout(200);
    await drawWhiteboardShape(page, 'Ellipse', { x: 480, y: 260 }, { x: 600, y: 370 });
    await page.waitForTimeout(250);
    await drawWhiteboardShape(page, 'Arrow', { x: 360, y: 430 }, { x: 600, y: 470 });
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();

    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.teacherRecording') || 'null'));
    const boardResource = draft.presentationResources.find((resource: any) => resource.kind === 'whiteboard');
    const boardEvents = draft.events.filter((event: any) => event.type === 'whiteboard.scene.changed');
    expect(boardResource.initialScene.elements.filter((element: any) => !element.isDeleted)).toHaveLength(1);
    expect(boardEvents).toHaveLength(2);
    expect(boardEvents[0].payload.scene.elements.filter((element: any) => !element.isDeleted)).toHaveLength(2);
    expect(boardEvents[1].payload.scene.elements.filter((element: any) => !element.isDeleted)).toHaveLength(3);

    await page.getByRole('button', { name: /^publish$/i }).click();
    await expect(page.getByText(/published status:\s*published/i)).toBeAttached();
    await page.getByRole('button', { name: /dashboard/i }).click();
    await signOut(page);
    await signInAsLearner(page);
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    const learnerBoard = page.getByTestId('interactive-whiteboard');
    await expect(page.locator('[data-presentation-resource="lecture-whiteboard"]')).toHaveAttribute('data-presentation-mode', 'focused');
    await expect(learnerBoard).toHaveAttribute('data-whiteboard-readonly', 'true');
    await page.getByLabel(/lesson timeline/i).fill(String(Math.max(0, boardEvents[0].tMs - 1)));
    await expect(learnerBoard).toHaveAttribute('data-whiteboard-element-count', '1');
    await page.getByLabel(/lesson timeline/i).fill(String(boardEvents[0].tMs));
    await expect(learnerBoard).toHaveAttribute('data-whiteboard-element-count', '2');
    await page.getByLabel(/lesson timeline/i).fill(String(boardEvents[1].tMs));
    await expect(learnerBoard).toHaveAttribute('data-whiteboard-element-count', '3');
    const immutableBefore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));
    await expect(learnerBoard.getByRole('radio', { name: 'Rectangle', exact: true })).toHaveCount(0);
    await page.reload();
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await page.getByLabel(/lesson timeline/i).fill(String(boardEvents[1].tMs));
    await expect(page.getByTestId('interactive-whiteboard')).toHaveAttribute('data-whiteboard-element-count', '3');
    expect(await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'))).toBe(immutableBefore);
  });

  test('remote persistence rejects malformed and oversized whiteboard scenes', async ({ request }) => {
    await apiDevLogin(request, DEV_TEACHER_USER_ID);
    const malformed: any = createPublishedRecording('teacher-recording-invalid-whiteboard-test', 'console.log("invalid board");\n', 1000);
    malformed.presentationResources = [{ id: 'board', kind: 'whiteboard', title: 'Whiteboard', initialScene: { elements: Array.from({ length: 1001 }, (_, id) => ({ id })) } }];
    const response = await request.post('/api/interactive/teacher-recordings', { data: malformed });
    expect(response.status()).toBe(400);
    expect(await response.text()).toMatch(/whiteboard scene exceeds/i);
  });

  test('teacher presentation cues record and seek deterministic slide layouts', async ({ page }) => {
    await startTeacherRecording(page);

    const slide = page.locator('[data-presentation-resource="javascript-counter-deck"]');
    await expect(slide).toHaveAttribute('data-presentation-mode', 'minimized');
    const website = page.frameLocator('[data-presentation-preview-host] iframe').first();
    await website.getByRole('button', { name: /click the live preview/i }).click({ timeout: 20000 });
    await expect(website.getByText(/clicked 1 time/i)).toBeVisible();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /focus building a javascript counter/i }).click();
    await expect(slide).toHaveAttribute('data-presentation-mode', 'focused');
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: /reveal next/i }).click();
    await expect(slide.getByText(/read the current value/i)).toBeVisible();
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: /reveal next/i }).click();
    await expect(slide.getByText(/increment it after every click/i)).toBeVisible();
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: /next slide/i }).click();
    await expect(slide.getByRole('heading', { name: /events update the dom/i })).toBeVisible();
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: /minimize building a javascript counter/i }).click();
    await expect(slide).toHaveAttribute('data-presentation-mode', 'minimized');

    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();

    const recording = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.teacherRecording') || 'null'));
    const presentationEvents = recording.events.filter((event: any) => event.type === 'presentation.changed');

    const deck = recording.presentationResources.find((resource: any) => resource.id === 'javascript-counter-deck');
    expect(deck.slides).toHaveLength(2);
    expect(recording.initialPresentationLayout.resources['javascript-counter-deck']).toBe('minimized');
    expect(presentationEvents).toHaveLength(5);
    expect(recording.events.some((event: any) => event.type === 'file.changed')).toBeFalsy();
    expect(presentationEvents[0].payload.layout.resources['javascript-counter-deck']).toBe('focused');
    expect(presentationEvents[2].payload.layout.deckStates['javascript-counter-deck']).toEqual({ slideIndex: 0, revealedStep: 2 });
    expect(presentationEvents[3].payload.layout.deckStates['javascript-counter-deck']).toEqual({ slideIndex: 1, revealedStep: 0 });
    expect(presentationEvents[4].payload.layout.resources['javascript-counter-deck']).toBe('minimized');

    await page.getByLabel(/lesson timeline/i).fill(String(presentationEvents[2].tMs));
    await expect(slide.getByText(/increment it after every click/i)).toBeVisible();
    await page.getByLabel(/lesson timeline/i).fill(String(presentationEvents[3].tMs));
    await expect(slide.getByRole('heading', { name: /events update the dom/i })).toBeVisible();
    await page.getByLabel(/lesson timeline/i).fill(String(presentationEvents[4].tMs));
    await expect(slide).toHaveAttribute('data-presentation-mode', 'minimized');
  });

  test('learner can override presentation cues and return to teacher direction', async ({ page, request }) => {
    const recording: any = createPublishedRecording(
      'teacher-recording-presentation-override-test',
      'console.log("presentation complete");\n',
      7000,
    );
    recording.presentationResources = [
      { id: 'website-preview', kind: 'preview', title: 'Website Preview' },
      { id: 'lesson-explanation', kind: 'explanation', title: 'Explanation' },
      {
        id: 'learner-counter-deck', kind: 'deck', title: 'Learner Counter Deck', slides: [
          { id: 'learner-state', title: 'State', elements: [
            { id: 'learner-state-intro', kind: 'paragraph', text: 'Initial concept', revealStep: 0 },
            { id: 'learner-state-point', kind: 'bullet', text: 'Learner-revealed point', revealStep: 1 },
          ] },
          { id: 'learner-dom', title: 'DOM update', elements: [] },
        ],
      },
    ];
    recording.initialPresentationLayout = {
      resources: { 'website-preview': 'minimized', 'lesson-explanation': 'hidden', 'learner-counter-deck': 'minimized' },
      deckStates: { 'learner-counter-deck': { slideIndex: 0, revealedStep: 0 } },
    };
    recording.events.splice(2, 0,
      {
        id: 'event-presentation-focus',
        seq: 2,
        tMs: 500,
        type: 'presentation.changed',
        payload: {
          layout: {
            resources: { 'website-preview': 'minimized', 'lesson-explanation': 'hidden', 'learner-counter-deck': 'focused' },
            focusedResourceId: 'learner-counter-deck',
            deckStates: { 'learner-counter-deck': { slideIndex: 0, revealedStep: 0 } },
          },
        },
        origin: 'teacher',
      },
      {
        id: 'event-presentation-minimize',
        seq: 3,
        tMs: 6000,
        type: 'presentation.changed',
        payload: {
          layout: {
            resources: { 'website-preview': 'minimized', 'lesson-explanation': 'hidden', 'learner-counter-deck': 'minimized' },
            deckStates: { 'learner-counter-deck': { slideIndex: 1, revealedStep: 0 } },
          },
        },
        origin: 'teacher',
      },
    );
    recording.events.at(-1).seq = 4;

    await seedPublishedRecording(request, recording);
    const rawBefore = readFileSync(getPublishedRecordingFile(recording.id), 'utf8');

    await signInAsLearner(page);
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await page.getByRole('button', { name: /^play$/i }).click();

    const slide = page.locator('[data-presentation-resource="learner-counter-deck"]');
    await expect(slide).toHaveAttribute('data-presentation-mode', 'focused', { timeout: 1800 });
    await page.getByRole('button', { name: /reveal next/i }).click();
    await expect(slide.getByText(/learner-revealed point/i)).toBeVisible();
    await page.getByRole('button', { name: /hide learner counter deck/i }).click();
    await expect(slide).toHaveCount(0);
    await expect(page.getByRole('button', { name: /follow teacher/i })).toBeVisible();
    await page.waitForTimeout(400);
    await expect(slide).toHaveCount(0);

    await page.getByRole('button', { name: /follow teacher/i }).click();
    await expect(slide).toHaveAttribute('data-presentation-mode', 'focused');
    await page.getByRole('button', { name: /minimize learner counter deck/i }).click();
    await page.getByRole('button', { name: /focus learner counter deck/i }).click();
    await expect(page.getByRole('button', { name: /follow teacher/i })).toBeVisible();

    await expect(slide).toHaveAttribute('data-presentation-mode', 'minimized', { timeout: 7000 });
    await expect(slide.getByRole('heading', { name: /dom update/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /follow teacher/i })).toHaveCount(0);
    expect(readFileSync(getPublishedRecordingFile(recording.id), 'utf8')).toBe(rawBefore);
  });

  test('account switching works', async ({ page }) => {
    await expect(page.getByText('Choose an account', { exact: true })).toBeVisible();
    await signInAsTeacher(page);
    await signOut(page);
    await expect(page.getByText('Choose an account', { exact: true })).toBeVisible();
  });

  test('draft deletion requires confirmation', async ({ page }) => {
    await signInAsTeacher(page);
    await startTeacherRecording(page);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();
    await page.getByRole('button', { name: /^dashboard$/i }).click();
    await openRecordingLibrary(page);
    await page.getByRole('button', { name: /delete lesson and solution draft/i }).click();
    const confirmDelete = page.getByRole('button', { name: /confirm delete lesson and solution draft/i });
    await expect(confirmDelete).toBeVisible();
    await confirmDelete.click();
    await expect(page.getByRole('button', { name: /open review/i })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: /open review/i })).toHaveCount(0);
  });

  test('teacher publish requires teacher identity', async ({ page }) => {
    await startTeacherRecording(page);
    await page.getByRole('button', { name: 'example.js' }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type('\n// teacher identity publish edit');
    await expect(editor).toContainText('// teacher identity publish edit');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await expect(page.getByRole('button', { name: /^publish$/i })).toBeDisabled();
    await page.getByRole('button', { name: /save draft/i }).click();
    await page.getByRole('button', { name: /^dashboard$/i }).click();

    await signInAsTeacher(page);
    await page.getByRole('button', { name: /open review/i }).click();
    await expect(page.getByRole('button', { name: /^publish$/i })).toBeEnabled();
    await page.getByRole('button', { name: /^publish$/i }).click();
    await expect(page.getByText(/published status:\s*published/i)).toBeAttached();

    const publishedIdText = await page.getByText(/published recording id:\s*teacher-recording-/i).textContent();
    const publishedId = publishedIdText?.match(/published recording id:\s*(teacher-recording-[\w-]+)/i)?.[1];
    const publishedRecording = JSON.parse(readFileSync(getPublishedRecordingFile(publishedId!), 'utf8'));

    expect(publishedRecording.ownerUserId).toBe(DEV_TEACHER_USER_ID);
    expect(publishedRecording.createdByUserId).toBe(DEV_TEACHER_USER_ID);
    expect(publishedRecording.publishedByUserId).toBe(DEV_TEACHER_USER_ID);
  });

  test('records one editor edit into a saved teacher draft localStorage mirror', async ({ page }) => {
    const stopRecording = page.getByRole('button', { name: /stop recording/i });
    const saveDraft = page.getByRole('button', { name: /save draft/i });

    await expect(page.getByRole('region', { name: /lecture setup/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toBeHidden();
    await expect(saveDraft).toHaveCount(0);

    await startTeacherRecording(page);
    await expect(page.getByLabel(/recording studio controls/i)).toContainText(/recording in progress/i);
    const studioBounds = await page.getByLabel(/recording studio controls/i).evaluate((element) => {
      const bounds = element.parentElement!.getBoundingClientRect();
      return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
    });

    expect(studioBounds).toEqual({ left: 0, top: 0, ...page.viewportSize()! });
    await expect(page.getByRole('heading', { level: 2, name: /teacher studio/i })).toHaveCount(0);
    await expect(page.getByText(/recording status:\s*active/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /stop recording/i })).toBeEnabled();
    await expect(page.getByText(/draft status:\s*unsaved/i)).toBeAttached();
    await page.getByRole('button', { name: 'example.js' }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();
    await editor.click();
    await page.keyboard.type('\n// interactive poc recording edit');
    await expect(editor).toContainText('// interactive poc recording edit');
    await page.waitForTimeout(300);
    await expect(page.getByText(/event count:\s*[3-9]\d*/i)).toBeAttached();

    await stopRecording.click();
    await expect(page.getByText(/draft status:\s*unsaved/i)).toBeAttached();
    await expect(saveDraft).toBeEnabled();
    await saveDraft.click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();

    const rawRecording = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(rawRecording).toBeTruthy();

    const recording = JSON.parse(rawRecording!);

    expect(recording.baseFiles).toBeTruthy();
    expect(Object.keys(recording.baseFiles).length).toBeGreaterThan(0);
    expect(Array.isArray(recording.events)).toBeTruthy();
    expect(recording.events.length).toBeGreaterThan(0);
    expect(recording.events.some((event: any) => event.type === 'file.changed')).toBeTruthy();
  });

  test('pauses recording only to choose a prepared exercise and cancels without changing the workspace', async ({ page }) => {
    await signInAsTeacher(page);
    await startTeacherRecording(page);
    const editor = page.getByRole('textbox', { name: 'Editor' }).first();
    const teacherSource = await editor.textContent();

    await page.getByRole('button', { name: /pause for exercise/i }).click();

    await expect(page.getByRole('heading', { name: /choose a prepared exercise/i })).toBeVisible();
    await expect(page.getByText(/no verified exercises are available for this lesson/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /capture draft/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /author complete exercise/i })).toHaveCount(0);
    await page.getByRole('button', { name: /^cancel$/i }).click();

    await expect(page.getByLabel(/recording studio controls/i)).toBeVisible();
    await expect(editor).toHaveText(teacherSource ?? '');
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /save draft/i }).click();

    const recording = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.teacherRecording') || 'null'));
    expect(recording.exercisePoints ?? []).toHaveLength(0);
  });

  test('publishes a prepared exercise as an immutable version pinned by the recording', async ({ page }) => {
    await signInAsTeacher(page);
    await page.getByRole('button', { name: /new prepared exercise/i }).click();

    await page.getByLabel(/^title$/i).fill('Counter validation exercise');
    await page.getByLabel(/learner instructions/i).fill('Complete the counter behavior.');
    await page.getByLabel(/exercise explanation/i).fill(
      'A counter keeps state and updates that state in response to an action.',
    );
    await expect(page.getByText(/private validation files are hidden/i)).toBeVisible();
    await page.getByRole('button', { name: /private validation/i }).click();
    const validationEditor = page.getByRole('textbox', { name: 'Editor' }).first();
    await validationEditor.fill(
      "import { readFile } from 'node:fs/promises';\nexport const checks = [{ id: 'exercise-complete', async run() { const source = await readFile(new URL('../example.js', import.meta.url), 'utf8'); if (!source.includes('EXERCISE_DONE')) throw new Error('Missing marker'); } }];\n",
    );
    await page.getByRole('button', { name: /starter workspace/i }).click();

    await page.getByRole('button', { name: /test starter/i }).click();
    await expect(page.getByText(/starter:\s*failed/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/reference:\s*not checked/i)).toBeVisible();
    await page.getByRole('button', { name: /save exercise/i }).click();
    await expect(page.getByText('Counter validation exercise', { exact: true })).toBeVisible();
    await expect(page.getByText(/verification current/i)).toBeVisible();

    await startTeacherRecording(page);
    await page.getByRole('button', { name: /pause for exercise/i }).click();
    await expect(page.getByRole('heading', { name: /choose a prepared exercise/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /capture draft/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /author complete exercise/i })).toHaveCount(0);
    await page.getByRole('button', { name: 'Counter validation exercise', exact: true }).click();
    await expect(page.getByLabel(/recording studio controls/i)).toBeVisible();
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /^publish$/i }).click();
    await expect(page.getByText(/published status:\s*published/i)).toBeAttached({ timeout: 15000 });

    const recording = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.teacherRecording') || 'null'));
    expect(recording.exercisePoints).toHaveLength(1);
    expect(recording.exercisePoints[0].exerciseVersionAtPublication).toBe(1);

    const versionsResponse = await page.request.get(
      `/api/interactive/exercises/${recording.exercisePoints[0].exerciseId}/versions`,
    );
    expect(versionsResponse.ok()).toBe(true);
    const versions = (await versionsResponse.json()).exerciseVersions;
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      version: 1,
      exerciseId: recording.exercisePoints[0].exerciseId,
      content: { explanation: 'A counter keeps state and updates that state in response to an action.' },
    });

    await page.getByRole('button', { name: /^dashboard$/i }).click();
    await page.getByRole('button', { name: /publish exercise update/i }).click();
    await expect(page.getByText(/published exercise version 1/i)).toBeVisible();

    await page.evaluate(async () => {
      const request = indexedDB.open('interactive-timeline-poc', 4);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction(['exerciseDrafts', 'exerciseCatalog'], 'readwrite');
      transaction.objectStore('exerciseDrafts').clear();
      transaction.objectStore('exerciseCatalog').clear();
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    });
    await page.reload();
    await signInAsTeacher(page);
    await expect(page.getByText('Counter validation exercise', { exact: true })).toBeVisible();
    await expect(page.getByText(/verification current/i)).toBeVisible();
  });

  test('learner is intercepted by an exercise, autosaves, checks, and resumes the lecture', async ({ page }) => {
    const exerciseId = 'exercise-e2e-learner-flow';
    const pointId = 'exercise-point-e2e-learner-flow';
    const recording = {
      ...createPublishedRecording(
        'teacher-recording-exercise-learner-flow',
        'console.log("teacher lecture resumed");\n',
        1200,
      ),
      exercisePoints: [
        {
          schemaVersion: 1,
          id: pointId,
          exerciseId,
          teacherTimestampMs: 300,
          lastAppliedTeacherEventSeq: 1,
          exerciseVersionAtPublication: 1,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    seedPublishedExerciseVersion(exerciseId);
    await publishAndOpenRecordingAsLearner(page, recording);
    const editor = page.getByRole('textbox', { name: 'Editor' }).first();
    const exerciseMarker = page.getByRole('button', { name: /open exercise at 300 milliseconds/i });
    await expect(exerciseMarker.locator('.i-ph-student-fill')).toHaveCSS('background-color', 'rgb(5, 150, 105)');
    await page.getByRole('button', { name: /^play$/i }).click();

    await expect(page.getByRole('dialog', { name: /set the answer to 42/i })).toBeVisible({ timeout: 10000 });
    await expect(editor).toContainText('remote learner base');
    await expect(editor).not.toContainText('answer = 0');
    await expect(page.getByLabel(/exercise mode/i)).toHaveCount(0);
    const attemptsBeforeStart = await page.evaluate(async () =>
      (await (await fetch('/api/interactive/exercise-attempts')).json()).exerciseAttempts,
    );
    expect(attemptsBeforeStart).toHaveLength(0);
    await expect(page.getByRole('button', { name: /exercise\.test\.mjs/i })).toHaveCount(0);

    await page.getByRole('button', { name: /skip for now/i }).click();
    await expect(page.getByLabel(/exercise mode/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /open exercise at 300 milliseconds/i })).toHaveAttribute(
      'title',
      /skipped/i,
    );
    await page.getByRole('button', { name: /^restart$/i }).click();
    await expect(page.getByRole('dialog', { name: /set the answer to 42/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/saved work for this exercise/i)).toBeVisible();
    await page.getByRole('button', { name: /resume exercise/i }).click();
    await expect(page.getByLabel(/exercise mode/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/skipped attempt was restored/i)).toBeVisible();
    await expect(page.getByLabel('Exercise Explanation')).toBeVisible();
    await expect(page.getByLabel('Exercise Explanation')).toContainText('The exported name is part of the module contract.');
    await expect(page.getByRole('button', { name: 'Terminal' })).toBeVisible();
    const exerciseResources = page.getByRole('navigation', { name: 'Presentation resources' });
    await expect(exerciseResources.getByRole('button')).toHaveCount(1);
    const exercisePreviewButton = exerciseResources.getByRole('button');
    await expect(exercisePreviewButton).toContainText('Website Preview');
    await exercisePreviewButton.click();
    await expect(page.getByLabel('Website preview presentation')).toHaveAttribute('data-presentation-mode', 'minimized');
    await exercisePreviewButton.click();
    await expect(page.getByLabel('Website preview presentation')).toHaveAttribute('data-presentation-mode', 'hidden');

    await page.getByRole('button', { name: /check solution/i }).click();
    await expect(page.getByText(/answer is not 42 yet/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel(/test results/i)).toContainText(/PASS\s+Exports a value named answer/);
    await expect(page.getByLabel(/test results/i)).toContainText(/FAIL\s+The exported answer is 42/);
    await expect(page.getByLabel(/test results/i)).toContainText('1 of 2 checks passed');

    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('export const answerr = 41;');
    await page.getByRole('button', { name: /check solution/i }).click();
    await expect(page.getByLabel(/test results/i)).toContainText(/FAIL\s+Exports a value named answer/, { timeout: 15000 });
    await expect(page.getByLabel(/test results/i)).toContainText('Keep the exported variable named answer.');
    await expect(page.getByLabel(/test results/i)).toContainText('0 of 2 checks passed');
    await expect(page.getByLabel(/test results/i)).not.toContainText('Solution checks could not run');

    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('export const answer = 42;');
    await page.keyboard.press('ControlOrMeta+S');
    await expect(page.getByLabel(/exercise checkpoints/i)).toBeVisible();

    await page.getByRole('button', { name: /check solution/i }).click();
    await expect(page.getByText(/answer is correct/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/the exported answer is 42/i)).toBeVisible();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\n// changed after passing');
    await expect(page.getByText(/workspace has changed since the successful check/i)).toBeVisible();
    await page.getByRole('button', { name: /check solution/i }).click();
    await expect(page.getByText(/answer is correct/i)).toBeVisible({ timeout: 15000 });

    seedPublishedExerciseVersion(exerciseId, 2, 'export const answer = 1;\n');
    await page.getByRole('button', { name: /start over/i }).click();
    await expect(editor).toContainText('answer = 1');
    await expect(page.locator('[data-exercise-workspace-transition]')).toHaveCount(0);
    const passedAttemptId = await page.getByLabel(/exercise attempt/i).locator('option', { hasText: 'passed' }).getAttribute('value');
    await page.getByLabel(/exercise attempt/i).selectOption(passedAttemptId!);
    await expect(page.locator('[data-exercise-workspace-transition]')).toHaveCount(0);
    await expect(editor).toContainText('answer = 42');

    await page.getByRole('button', { name: /continue lecture/i }).click();
    await expect(page.getByLabel(/exercise mode/i)).toHaveCount(0);
    await expect(editor).toContainText('teacher lecture resumed', { timeout: 10000 });
    await expect(page.getByLabel('Exercise Explanation')).toHaveCount(0);
    await expect(page.locator('aside[aria-label="Explanation"]')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Presentation resources' }).getByRole('button')).toHaveCount(4);
    await expect(page.getByRole('button', { name: /open exercise at 300 milliseconds/i })).toHaveAttribute(
      'title',
      /passed/i,
    );
  });

  test('uses an immediate covered exercise transition when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const exerciseId = 'exercise-e2e-reduced-motion';
    const pointId = 'exercise-point-e2e-reduced-motion';
    const recording = {
      ...createPublishedRecording(
        'teacher-recording-exercise-reduced-motion',
        'console.log("teacher restored after reduced motion");\n',
        800,
      ),
      exercisePoints: [
        {
          schemaVersion: 1,
          id: pointId,
          exerciseId,
          teacherTimestampMs: 250,
          lastAppliedTeacherEventSeq: 1,
          exerciseVersionAtPublication: 1,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    seedPublishedExerciseVersion(exerciseId);
    await publishAndOpenRecordingAsLearner(page, recording);
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByRole('dialog', { name: /set the answer to 42/i })).toBeVisible();
    await page.getByRole('button', { name: /start exercise/i }).click();
    await expect(page.getByLabel(/exercise mode/i)).toBeVisible();
    await expect(page.locator('[data-exercise-workspace-transition]')).toHaveCount(0);
    await page.getByRole('button', { name: /skip for now/i }).click();
    await expect(page.getByLabel(/exercise mode/i)).toHaveCount(0);
    await expect(page.locator('[data-exercise-workspace-transition]')).toHaveCount(0);
  });

  test('editor recording replays progressively and seeks deterministically', async ({ page }) => {
    await startTeacherRecording(page);
    await page.getByRole('button', { name: 'example.js' }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type('\n// progressive first step');
    await page.waitForTimeout(900);
    await page.keyboard.type('\n// progressive second step');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();

    const recording = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.teacherRecording') || 'null'));
    const firstCompleteEvent = recording.events.find(
      (event: any) =>
        event.type === 'file.changed' &&
        event.payload?.content?.includes('// progressive first step') &&
        !event.payload?.content?.includes('// progressive second step'),
    );

    expect(firstCompleteEvent).toBeTruthy();
    expect(recording.events.some((event: any) => event.type === 'file.opened' && event.tMs === 0)).toBeTruthy();

    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(editor).toContainText('// progressive first step', { timeout: firstCompleteEvent.tMs + 1000 });
    await expect(editor).not.toContainText('// progressive second step');
    await expect(editor).toContainText('// progressive second step', { timeout: 3000 });
    await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached();

    await page.getByLabel(/lesson timeline/i).fill(String(firstCompleteEvent.tMs));

    await expect(page.getByText(/playback status:\s*paused/i)).toBeAttached();
    await expect(editor).toContainText('// progressive first step');
    await expect(editor).not.toContainText('// progressive second step');

    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(editor).toContainText('// progressive second step', { timeout: 3000 });
  });

  test('teacher draft list works with a saved local draft', async ({ page }) => {
    await startTeacherRecording(page);
    await page.getByRole('button', { name: 'example.js' }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type('\n// teacher local draft edit');
    await expect(editor).toContainText('// teacher local draft edit');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await expect(page.getByText(/draft status:\s*unsaved/i)).toBeAttached();

    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();
    await expect(page.getByText(/current draft id:\s*teacher-recording-/i)).toBeAttached();

    const rawRecording = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(rawRecording).toBeTruthy();
    const savedRecording = JSON.parse(rawRecording!);

    await page.evaluate(() => localStorage.removeItem('interactive-poc.teacherRecording'));
    await page.reload();
    await openRecordingLibrary(page);

    await expect(page.getByRole('heading', { name: /^drafts$/i })).toBeVisible();
    await expect(page.getByText(/lesson and solution/i).first()).toBeVisible();
    await page.getByRole('button', { name: /open review/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();

    const reloadedEditor = page.getByRole('textbox', { name: 'Editor' }).first();

    await expect(reloadedEditor).toContainText('// teacher local draft edit');
    await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached();
  });

  test('teacher can save and load draft with fake audio media', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('interactive-poc.fakeMediaRecorder', 'true'));

    await startTeacherRecording(page, 'audio');
    await expect(page.getByText(/media status:\s*recording/i)).toBeAttached();
    await expect(page.getByText(/media kind:\s*audio/i)).toBeAttached();
    await page.getByRole('button', { name: 'example.js' }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type('\n// teacher fake audio draft edit');
    await expect(editor).toContainText('// teacher fake audio draft edit');
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: /stop recording/i }).click();
    await expect(page.getByText(/draft status:\s*unsaved/i)).toBeAttached();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(/media duration ms:\s*[1-9]\d*/i)).toBeAttached();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();
    await expect(page.getByText(/media status:\s*saved/i)).toBeAttached();

    const mirroredRecording = await page.evaluate(() => {
      const raw = localStorage.getItem('interactive-poc.teacherRecording');
      return raw ? JSON.parse(raw) : undefined;
    });

    expect(mirroredRecording?.mediaAssets).toHaveLength(1);
    expect(mirroredRecording.mediaAssets[0].kind).toBe('audio');
    expect(mirroredRecording.mediaAssets[0].blob).toBeUndefined();

    await page.reload();
    await page.getByRole('button', { name: /open review/i }).click();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(/media kind:\s*audio/i)).toBeAttached();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();

    const reloadedEditor = page.getByRole('textbox', { name: 'Editor' }).first();

    await expect(reloadedEditor).toContainText('// teacher fake audio draft edit', { timeout: 5000 });
    await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached({ timeout: 5000 });
  });

  test('webcam recording becomes an optional synchronized camera resource', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('interactive-poc.fakeMediaRecorder', 'true'));

    await startTeacherRecording(page, 'camera');
    await expect(page.getByText(/media kind:\s*webcam/i)).toBeAttached();
    await page.waitForTimeout(100);
    await page.getByRole('button', { name: /stop recording/i }).click();

    const camera = page.getByLabel(/instructor camera presentation/i);
    const cameraVideo = page.getByLabel(/recorded instructor camera/i);
    await expect(camera).toHaveAttribute('data-presentation-mode', 'minimized');
    await expect(cameraVideo).toBeVisible();
    expect(await cameraVideo.evaluate((element) => (element as HTMLVideoElement).controls)).toBe(false);

    await camera.getByRole('button', { name: /hide instructor camera/i }).click();
    await expect(camera).toHaveAttribute('data-presentation-mode', 'hidden');
    await page.getByRole('button', { name: /show presentation resource: instructor camera/i }).click();
    await expect(camera).toHaveAttribute('data-presentation-mode', 'minimized');
    await camera.getByRole('button', { name: /focus instructor camera/i }).click();
    await expect(camera).toHaveAttribute('data-presentation-mode', 'focused');

    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'))).not.toBeNull();
    const recording = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.teacherRecording') ?? 'null'));
    expect(recording.presentationResources).toContainEqual(expect.objectContaining({ id: 'instructor-camera', kind: 'camera' }));
    expect(recording.initialPresentationLayout.resources['instructor-camera']).toBe('minimized');
  });

  test('media playback drives the structured timeline playhead', async ({ page }) => {
    const finalContent = 'console.log("media clock base");\n// media currentTime applied edit\n';

    await seedIndexedDbMediaDraft(page, {
      recordingId: 'teacher-recording-media-clock-test',
      mediaAssetId: 'media-asset-clock-test',
      eventMs: 600,
      finalContent,
    });

    await page.reload();
    await page.getByRole('button', { name: /open review/i }).click();
    await expect(page.getByText(/draft status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeAttached();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByText(/playback status:\s*playing/i)).toBeAttached();

    await expect
      .poll(async () => {
        return page
          .getByLabel(/recorded audio preview/i)
          .evaluate((element) => Math.round((element as HTMLMediaElement).currentTime * 1000));
      })
      .toBeGreaterThan(0);

    await expect
      .poll(async () => {
        const playheadText = await page.getByText(/playhead ms:\s*\d+/i).textContent();
        return Number(playheadText?.match(/playhead ms:\s*(\d+)/i)?.[1] ?? 0);
      })
      .toBeGreaterThan(0);

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await expect(editor).toContainText('// media currentTime applied edit', { timeout: 5000 });
    await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached({ timeout: 5000 });
  });

  test('Teacher Studio lists a published lesson', async ({ page, request }) => {
    const finalContent = 'console.log("remote learner base");\n// teacher studio listed published edit\n';
    const recording = createPublishedRecording('teacher-recording-dashboard-list-test', finalContent, 25);

    await seedPublishedRecording(request, recording);
    await page.reload();
    await openTeacherSection(page);
    await openRecordingLibrary(page);
    await expect(page.getByRole('heading', { name: /published lessons/i })).toBeVisible();
    await page.getByRole('button', { name: /view lesson/i }).click();
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText(
      '// teacher studio listed published edit',
      { timeout: 5000 },
    );
  });

  test('reviewing a published lesson never creates a draft', async ({ page, request }) => {
    const recording = createPublishedRecording(
      'teacher-recording-readonly-review-test',
      'console.log("published review");\n// published review remains read only\n',
    );

    await seedPublishedRecording(request, recording);
    await page.reload();
    await openTeacherSection(page);
    await expect(page.getByRole('button', { name: /open review/i })).toHaveCount(0);
    await page.getByRole('button', { name: /view lesson/i }).click();
    await expect(page.getByText(/^published$/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /save draft|^publish$/i })).toHaveCount(0);
    await page.getByRole('button', { name: /^dashboard$/i }).click();
    await expect(page.getByRole('button', { name: /open review/i })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: /open review/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /view lesson/i })).toBeVisible();
  });

  test('teacher can delete an owned published lesson and its learner work', async ({ page, request }) => {
    const recording = createPublishedRecording(
      'teacher-recording-delete-published-test',
      'console.log("delete published lesson");\n',
    );
    const delta = {
      id: 'learner-delta-delete-published-test',
      userId: DEV_LEARNER_USER_ID,
      lessonId: recording.lessonId,
      teacherRecordingId: recording.id,
      teacherRecordingVersion: recording.version,
      teacherTimestampMs: 10,
      baseTeacherFilesHash: simpleHashFilesForTest(recording.baseFiles),
      addedOrModified: { '/example.js': '// linked learner work\n' },
      removed: [],
      createdAt: '2026-01-01T00:01:00.000Z',
    };

    await seedPublishedRecording(request, recording);
    await apiDevLogin(request, DEV_LEARNER_USER_ID);
    const deltaResponse = await request.post('/api/interactive/learner-deltas', { data: delta });
    expect(deltaResponse.ok()).toBe(true);
    const unauthorizedDelete = await request.delete(`/api/interactive/teacher-recordings/${recording.id}`);
    expect(unauthorizedDelete.status()).toBe(403);
    await page.reload();
    await signInAsTeacher(page);
    await expect(page.getByRole('button', { name: /delete lesson and solution lesson/i })).toBeVisible();
    await page.getByRole('button', { name: /delete lesson and solution lesson/i }).click();
    await expect(page.getByText(/removes the lesson, its media, and linked learner experiments/i)).toBeVisible();
    await page.getByRole('button', { name: /confirm delete lesson and solution lesson/i }).click();
    await expect(page.getByText(/published lesson deleted/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /view lesson/i })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: /view lesson/i })).toHaveCount(0);

    const deletedRecording = await request.get(`/api/interactive/teacher-recordings/${recording.id}`);
    expect(deletedRecording.status()).toBe(404);
    await apiDevLogin(request, DEV_LEARNER_USER_ID);
    const deltasResponse = await request.get(`/api/interactive/learner-deltas?teacherRecordingId=${recording.id}`);
    expect((await deltasResponse.json()).learnerDeltas).toHaveLength(0);
  });

  test('teacher can publish and reload recording from backend', async ({ page }) => {
    await signInAsTeacher(page);
    await startTeacherRecording(page);
    await page.getByRole('button', { name: 'example.js' }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type('\n// teacher backend publish edit');
    await expect(editor).toContainText('// teacher backend publish edit');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /^publish$/i }).click();
    await expect(page.getByText(/published status:\s*published/i)).toBeAttached();

    const publishedIdText = await page.getByText(/published recording id:\s*teacher-recording-/i).textContent();
    const publishedId = publishedIdText?.match(/published recording id:\s*(teacher-recording-[\w-]+)/i)?.[1];

    expect(publishedId).toBeTruthy();
    expect(readFileSync(getPublishedRecordingFile(publishedId!), 'utf8')).toContain('// teacher backend publish edit');

    await page.evaluate(() => {
      localStorage.removeItem('interactive-poc.teacherRecording');
      localStorage.removeItem('interactive-poc.learnerDeltas');
    });
    await page.reload();
    await openRecordingLibrary(page);
    await page.getByRole('button', { name: /view lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeAttached();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText(
      '// teacher backend publish edit',
      { timeout: 5000 },
    );
    await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached({ timeout: 5000 });
    await page.getByRole('button', { name: /^dashboard$/i }).click();
    await expect(page.getByRole('button', { name: /open review/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /view lesson/i })).toBeVisible();
  });

  test('teacher can publish media recording and load media from backend', async ({ page }) => {
    await signInAsTeacher(page);
    await page.evaluate(() => localStorage.setItem('interactive-poc.fakeMediaRecorder', 'true'));

    await startTeacherRecording(page, 'audio');
    await expect(page.getByText(/media status:\s*recording/i)).toBeAttached();
    await page.getByRole('button', { name: 'example.js' }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type('\n// teacher backend media publish edit');
    await expect(editor).toContainText('// teacher backend media publish edit');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeAttached();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /^publish$/i }).click();
    await expect(page.getByText(/published status:\s*published/i)).toBeAttached();
    await expect(page.getByText(/media status:\s*saved/i)).toBeAttached();

    const publishedIdText = await page.getByText(/published recording id:\s*teacher-recording-/i).textContent();
    const publishedId = publishedIdText?.match(/published recording id:\s*(teacher-recording-[\w-]+)/i)?.[1];

    expect(publishedId).toBeTruthy();

    await page.evaluate(() => {
      localStorage.removeItem('interactive-poc.teacherRecording');
      localStorage.removeItem('interactive-poc.learnerDeltas');
      localStorage.removeItem('interactive-poc.fakeMediaRecorder');
    });
    await page.reload();
    await openRecordingLibrary(page);
    await page.getByRole('button', { name: /view lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(/media kind:\s*audio/i)).toBeAttached();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText(
      '// teacher backend media publish edit',
      { timeout: 5000 },
    );
    await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached({ timeout: 5000 });
  });

  test.skip('demo seed creates predictable lesson', async ({ page }) => {
    const learnerEdit = '// learner demo seed conflict edit';

    await signInAsTeacher(page);
    await seedDemoRecordingFromTeacherDashboard(page);
    await signInAsLearner(page);
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeAttached();
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await page.getByRole('button', { name: /pause and experiment/i }).click();
    await expect(page.getByText('My Experiment', { exact: true })).toBeVisible();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type(`\n${learnerEdit}`);
    await expect(editor).toContainText(learnerEdit);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /save experiment/i }).click();
    await expect(page.getByText(/work status:\s*saved/i)).toBeAttached();
    await expect(page.getByRole('button', { name: /open my experiment at/i })).toBeVisible();

    await page.getByRole('button', { name: /return to lecture/i }).click();
    await expect(editor).toContainText('// teacher demo final edit', { timeout: 6000 });
    await expect(editor).not.toContainText(learnerEdit);
    await page.getByRole('button', { name: /open my experiment at/i }).click();
    await expect(page.getByText(/work status:\s*experiment opened/i)).toBeAttached();
    await expect(editor).toContainText(learnerEdit);
    await expect(page.getByText(/conflict warning/i)).toHaveCount(0);
  });

  test('reset demo data only removes demo records and does not break app', async ({ page, request }) => {
    const nonDemoRecording = createPublishedRecording(
      'teacher-recording-reset-preserve-test',
      'console.log("remote learner base");\n// preserved non-demo final edit\n',
      25,
    );

    await seedPublishedRecording(request, nonDemoRecording);
    await signInAsTeacher(page);
    await seedDemoRecordingFromTeacherDashboard(page);
    await confirmResetDemoData(page);
    await expect(page.getByRole('heading', { level: 2, name: /teacher studio/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^start recording$/i })).toBeVisible();

    const preservedResponse = await request.get(`/api/interactive/teacher-recordings/${nonDemoRecording.id}`);
    const demoResponse = await request.get('/api/interactive/teacher-recordings/demo-interactive-conflict-flow');

    expect(preservedResponse.ok()).toBeTruthy();
    expect(demoResponse.status()).toBe(404);
    await expect(page.getByRole('button', { name: /view lesson/i })).toBeVisible();

    const seedResponse = await page.request.post('/api/interactive/demo/seed');
    expect(seedResponse.ok()).toBe(true);
  });

  test('first learner mutation pauses playback before applying the edit', async ({ page, request }) => {
    const recording = createPublishedRecording(
      'teacher-recording-automatic-takeover-test',
      'console.log("teacher event B");\n',
      1800,
    );
    (recording.events as any[]).splice(2, 0, {
      id: 'teacher-event-a',
      seq: 2,
      tMs: 100,
      type: 'file.changed',
      filePath: '/example.js',
      payload: { content: 'console.log("teacher event A");\n' },
      origin: 'teacher',
    });
    recording.events.at(-1)!.seq = 3;

    await publishAndOpenRecordingAsLearner(page, recording);
    const immutableTeacherRecording = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));
    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByText('Lesson', { exact: true })).toBeVisible();
    await expect(page.getByLabel('My work history graph')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /pause and experiment|save experiment/i })).toHaveCount(0);
    await expect(editor).toContainText('teacher event A');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await expect(page.getByText(/playback status:\s*playing/i)).toBeAttached();
    await expect(page.getByText(/saved work count:\s*0/i)).toBeAttached();

    await page.keyboard.insertText('// first learner mutation');

    await expect(page.getByText(/playback status:\s*paused/i)).toBeAttached();
    await expect(page.getByText(/mode:\s*learner-editing/i)).toBeAttached();
    await expect(page.getByText(/origin event seq:\s*2/i)).toBeAttached();
    await expect(page.getByText('My workspace', { exact: true })).toBeVisible();
    await expect(page.getByLabel('My work history graph')).toBeVisible();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toHaveAttribute('data-learner-changed', 'true');
    await expect(editor).toContainText('// first learner mutation');
    await page.waitForTimeout(1900);
    await expect(page.getByText(/learner commit count:\s*0/i)).toBeAttached();
    await expect(page.getByRole('button', { name: /autosaved edit event/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /open my work at .*1 unsaved draft/i })).toBeVisible();
    await expect(editor).not.toContainText('teacher event B');
    expect(await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'))).toBe(immutableTeacherRecording);

    await page.keyboard.press('ControlOrMeta+S');
    await expect(page.getByText(/learner commit count:\s*1/i)).toBeAttached();
    await expect(page.getByText(/learner history status:\s*checkpoint saved:/i)).toBeAttached();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).not.toHaveAttribute('data-learner-changed', 'true');
    await expect(page.getByRole('button', { name: /open my work at .*1 checkpoint$/i })).toBeVisible();
    const firstCommitLabel = await page.getByText(/last learner commit name:/i).textContent();
    expect(firstCommitLabel).toMatch(/last learner commit name:\s*[a-z]+-[a-z]+/i);
    const firstCommitName = firstCommitLabel?.match(/last learner commit name:\s*([a-z]+-[a-z]+)/i)?.[1] ?? '';
    expect(firstCommitName).not.toBe('');

    await page.keyboard.press('ControlOrMeta+S');
    await expect(page.getByText(/learner commit count:\s*1/i)).toBeAttached();
    await expect(page.getByText(/learner history status:\s*nothing to save/i)).toBeAttached();

    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n// second learner edit');
    await page.keyboard.press('ControlOrMeta+S');
    await expect(page.getByText(/learner commit count:\s*2/i)).toBeAttached();
    await expect(page.getByRole('button', { name: /open my work at .*2 checkpoints$/i })).toBeVisible();
    await expect.poll(() => page.evaluate(async () => {
      const request = indexedDB.open('interactive-timeline-poc', 4);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const storeRequest = db.transaction('learnerCommits').objectStore('learnerCommits').count();
      return new Promise<number>((resolve, reject) => {
        storeRequest.onsuccess = () => resolve(storeRequest.result);
        storeRequest.onerror = () => reject(storeRequest.error);
      });
    })).toBe(2);

    const historyData = await page.evaluate(async () => {
      const request = indexedDB.open('interactive-timeline-poc', 4);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const read = <T>(storeName: string) => new Promise<T[]>((resolve, reject) => {
        const storeRequest = db.transaction(storeName).objectStore(storeName).getAll();
        storeRequest.onsuccess = () => resolve(storeRequest.result as T[]);
        storeRequest.onerror = () => reject(storeRequest.error);
      });
      return {
        branches: await read<any>('learnerBranches'),
        events: await read<any>('learnerHistoryEvents'),
        commits: await read<any>('learnerCommits'),
        workingTrees: await read<any>('learnerWorkingTrees'),
      };
    });
    expect(historyData.branches).toHaveLength(1);
    expect(historyData.events.length).toBeGreaterThanOrEqual(2);
    expect(historyData.commits).toHaveLength(2);
    expect(historyData.workingTrees[0]).toEqual(expect.objectContaining({ schemaVersion: 1, dirty: false }));

    await page.getByRole('button', { name: /Checkpoint 1, branch/i }).click();
    await expect(page.getByText(/learner history view mode:\s*historical/i)).toBeAttached();
    await expect(page.getByText('Viewing earlier version', { exact: true })).toBeVisible();
    await expect(editor).toContainText('// first learner mutation');
    await expect(editor).not.toContainText('// second learner edit');

    const parentBranchId = historyData.branches[0].id;
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n// forked historical edit');
    await expect(editor).toContainText('// forked historical edit');
    await expect(editor).not.toContainText('// second learner edit');
    await expect(page.getByText(/learner branch count:\s*2/i)).toBeAttached();
    await expect(page.getByText(/learner history view mode:\s*head/i)).toBeAttached();
    await expect(page.getByText(/learner history status:\s*draft autosaved/i)).toBeAttached();
    const childBranchLabel = await page.getByText(/active learner branch id:/i).textContent();
    const childBranchId = childBranchLabel?.replace(/active learner branch id:\s*/i, '') ?? '';
    expect(childBranchId).not.toBe(parentBranchId);
    await expect(page.getByRole('button', { name: /Alternative 1 started here, branch/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Autosaved draft, branch/i })).toBeVisible();

    const historyButton = page.getByRole('button', { name: /^my work \(/i });
    await historyButton.click();
    await expect(page.getByRole('button', { name: /close/i })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'My Work' })).toBeVisible();
    await expect(page.getByText(/1 work session · 2 checkpoints · 1 autosaved draft/i)).toBeVisible();
    await expect(page.getByText(/1 alternative path/i)).toBeVisible();
    const workDialog = page.getByRole('dialog', { name: 'My Work' });
    await workDialog.getByText(/1 file changed/i).click();
    await expect(workDialog.getByText('example.js', { exact: true })).toBeVisible();
    await expect(workDialog.getByText('Modified', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /open work/i }).click();
    await expect(editor).toContainText('// forked historical edit');
    await expect(editor).not.toContainText('// second learner edit');

    await page.getByRole('button', { name: /Latest work, branch/i }).click();
    await expect(editor).toContainText('// second learner edit');
    await expect(editor).not.toContainText('// forked historical edit');
    await page.getByRole('button', { name: /Autosaved draft, branch/i }).click();
    await expect(page.getByText(`Active learner branch id: ${childBranchId}`, { exact: true })).toBeAttached();
    await expect(editor).toContainText('// forked historical edit');

    await expect(page.getByRole('button', { name: /create checkpoint|resume teacher/i })).toHaveCount(0);
    await page.getByLabel('Interactive lesson controls').getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByText('Following Teacher', { exact: true })).toBeVisible();
    await expect(page.getByText(/learner commit count:\s*0/i)).toBeAttached();
    await expect(page.getByLabel('My work history graph')).toHaveCount(0);

    await page.getByLabel('Lesson timeline').fill('0');
    await expect(page.getByText(/mode:\s*idle/i)).toBeAttached();
    await expect(editor).toContainText('remote learner base');
    await expect(page.getByText(`Active learner branch id: ${childBranchId}`, { exact: true })).toBeAttached();
    await page.getByRole('button', { name: /open my work at .*2 checkpoints/i }).click();
    await expect(page.getByLabel('My work history graph')).toBeVisible();
    await page.getByRole('button', { name: /Autosaved draft, branch/i }).click();
    await expect(editor).toContainText('// forked historical edit');

    await page.reload();
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByText(`Active learner branch id: ${childBranchId}`, { exact: true })).toBeAttached();
    await page.getByRole('button', { name: /Autosaved draft, branch/i }).click();
    await expect(editor).toContainText('// forked historical edit');
    await page.getByRole('button', { name: /^my work \(/i }).click();
    await expect(page.getByText(/1 work session · 2 checkpoints · 1 autosaved draft/i)).toBeVisible();
    await page.getByRole('button', { name: /open work/i }).click();
    await expect(editor).toContainText('// forked historical edit');
  });

  test('history markers pause without seeking and automatically restore the latest editor state', async ({ page, request }) => {
    const recording = createPublishedRecording(
      'teacher-recording-independent-history-position-test',
      'console.log("teacher final state");\n',
      3000,
    );
    await seedPublishedRecording(request, recording);
    await signInAsLearner(page);
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await page.getByRole('button', { name: /^play$/i }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('// learner checkpoint');
    await page.keyboard.press('ControlOrMeta+S');
    await expect(page.getByText(/learner commit count:\s*1/i)).toBeAttached();
    const commitLabel = await page.getByText(/last learner commit name:/i).textContent();
    const commitName = commitLabel?.match(/last learner commit name:\s*([a-z]+-[a-z]+)/i)?.[1] ?? '';
    expect(commitName).not.toBe('');

    const controls = page.getByLabel('Interactive lesson controls');
    await controls.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => Number((await page.getByText(/playhead ms:/i).textContent())?.match(/\d+/)?.[0] ?? 0)).toBeGreaterThan(500);
    await expect(editor).not.toContainText('// learner checkpoint');
    const beforeMarkerClick = Number((await page.getByText(/playhead ms:/i).textContent())?.match(/\d+/)?.[0] ?? 0);

    const marker = page.getByRole('button', { name: /open my work at .*1 checkpoint/i });
    await expect(marker).toBeVisible();
    expect((await marker.boundingBox())?.width).toBeGreaterThanOrEqual(32);
    await marker.click();
    await expect(page.getByText(/playback status:\s*paused/i)).toBeAttached();
    await expect(page.getByLabel('My work history graph')).toBeVisible();
    await expect(editor).toContainText('// learner checkpoint');
    await expect(page.getByRole('button', { name: /Checkpoint 1, branch.*selected/i })).toBeVisible();
    const learnerChanges = page.getByLabel('Learner changes');
    await expect(learnerChanges.getByText('Checkpoint', { exact: true })).toBeVisible();
    await expect(learnerChanges.getByText(/^\d+ changed area/)).toBeVisible();
    await expect(page.locator('.cm-line[data-learner-change]')).toHaveCount(0);
    await expect(page.locator('.tk-learner-inline-diff-removed')).toHaveCount(0);
    const highlightToggle = learnerChanges.getByRole('button', { name: 'Review learner changes' });
    await expect(highlightToggle).toHaveAttribute('aria-pressed', 'false');
    await highlightToggle.click();
    await expect(page.locator('.cm-line[data-learner-change]')).not.toHaveCount(0);
    await highlightToggle.click();
    await expect(page.locator('.cm-line[data-learner-change]')).toHaveCount(0);
    const afterMarkerClick = Number((await page.getByText(/playhead ms:/i).textContent())?.match(/\d+/)?.[0] ?? 0);
    expect(afterMarkerClick).toBeGreaterThanOrEqual(beforeMarkerClick - 50);

    await page.getByRole('button', { name: /Checkpoint 1, branch/i }).click();
    await expect(editor).toContainText('// learner checkpoint');
    const afterCheckpointClick = Number((await page.getByText(/playhead ms:/i).textContent())?.match(/\d+/)?.[0] ?? 0);
    expect(afterCheckpointClick).toBe(afterMarkerClick);

    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n// unsaved after checkpoint');
    const dirtyMarker = page.getByRole('button', { name: /open my work at .*1 checkpoint, 1 unsaved draft/i });
    const changedFile = page.getByRole('button', { name: 'example.js', pressed: true });
    await expect(dirtyMarker).toBeVisible();
    await expect(changedFile).toHaveAttribute('data-learner-changed', 'true');
    await expect(page.getByRole('button', { name: /autosaved edit event/i })).toHaveCount(0);
    await page.getByRole('button', { name: /Checkpoint 1, branch/i }).click();
    await expect(changedFile).not.toHaveAttribute('data-learner-changed', 'true');
    await page.getByRole('button', { name: /Autosaved draft, branch/i }).click();
    await expect(changedFile).toHaveAttribute('data-learner-changed', 'true');
    await expect(learnerChanges.getByText('Autosaved draft', { exact: true })).toBeVisible();
    await expect(highlightToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.cm-line[data-learner-change]')).toHaveCount(0);
    await highlightToggle.click();
    await expect(page.locator('.cm-line[data-learner-change]')).not.toHaveCount(0);
    await editor.click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('Shift+End');
    await page.keyboard.insertText('console.log("learner replacement");');
    await expect(editor).toContainText('learner replacement');
    const removedTeacherLines = page.getByRole('group', { name: /removed teacher lines?/i }).first();
    await expect(removedTeacherLines).toBeVisible();
    await expect(removedTeacherLines).toHaveAttribute('contenteditable', 'false');
    await expect(page.locator('.cm-line[data-learner-change="modified"]').first()).toBeVisible();
    await learnerChanges.getByRole('button', { name: 'Previous learner change' }).click();
    await highlightToggle.click();
    await expect(page.locator('.tk-learner-inline-diff-removed')).toHaveCount(0);
    await expect(page.locator('.cm-line[data-learner-change]')).toHaveCount(0);
    await expect(page.getByText(/learner commit count:\s*1/i)).toBeAttached();
    await expect(page.getByText(/learner branch count:\s*1/i)).toBeAttached();

    await controls.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByText('Following Teacher', { exact: true })).toBeVisible();
    await expect(editor).not.toContainText('// learner checkpoint');
    await expect(changedFile).not.toHaveAttribute('data-learner-changed', 'true');
    await expect(page.getByLabel('Learner changes')).toHaveCount(0);
    await expect(page.locator('.cm-line[data-learner-change]')).toHaveCount(0);
    await expect.poll(async () => Number((await page.getByText(/playhead ms:/i).textContent())?.match(/\d+/)?.[0] ?? 0)).toBeGreaterThan(afterCheckpointClick + 250);
    const beforeDirtyMarker = Number((await page.getByText(/playhead ms:/i).textContent())?.match(/\d+/)?.[0] ?? 0);

    await dirtyMarker.click();
    await expect(page.getByText(/playback status:\s*paused/i)).toBeAttached();
    await expect(editor).toContainText('// unsaved after checkpoint');
    await expect(changedFile).toHaveAttribute('data-learner-changed', 'true');
    const afterDirtyMarker = Number((await page.getByText(/playhead ms:/i).textContent())?.match(/\d+/)?.[0] ?? 0);
    expect(afterDirtyMarker).toBeGreaterThanOrEqual(beforeDirtyMarker - 50);
    await page.getByRole('button', { name: /Autosaved draft, branch/i }).click();
    await expect(editor).toContainText('// unsaved after checkpoint');
    await expect(changedFile).toHaveAttribute('data-learner-changed', 'true');
    expect(Number((await page.getByText(/playhead ms:/i).textContent())?.match(/\d+/)?.[0] ?? 0)).toBe(afterDirtyMarker);

    await controls.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByText('Following Teacher', { exact: true })).toBeVisible();
    await expect(editor).not.toContainText('// learner checkpoint');
    await expect(changedFile).not.toHaveAttribute('data-learner-changed', 'true');
    await expect.poll(async () => Number((await page.getByText(/playhead ms:/i).textContent())?.match(/\d+/)?.[0] ?? 0)).toBeGreaterThan(afterDirtyMarker);
  });

  test('reload restores an autosaved dirty learner working tree', async ({ page, request }) => {
    const recording = createPublishedRecording(
      'teacher-recording-history-reload-test',
      'console.log("teacher later state");\n',
      1500,
    );

    await seedPublishedRecording(request, recording);
    await signInAsLearner(page);
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await page.getByRole('button', { name: /^play$/i }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n// durable dirty learner draft');
    await expect(page.getByText(/learner history status:\s*draft autosaved/i)).toBeAttached();
    await expect(page.getByText(/learner remote sync status:\s*synced/i)).toBeAttached({ timeout: 10000 });
    const branchIdText = await page.getByText(/active learner branch id:/i).textContent();
    const branchId = branchIdText?.replace(/active learner branch id:\s*/i, '') ?? '';
    expect(branchId).not.toBe('');

    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('interactive-timeline-poc', 4);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['learnerBranches', 'learnerHistoryEvents', 'learnerCommits', 'learnerWorkingTrees'],
          'readwrite',
        );
        for (const name of transaction.objectStoreNames) transaction.objectStore(name).clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    });

    await page.reload();
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await page.getByRole('button', { name: /^play$/i }).click();

    await expect(page.getByText(/learner history status:\s*dirty draft restored/i)).toBeAttached();
    await expect(page.getByText(/mode:\s*learner-editing/i)).toBeAttached();
    await expect(page.getByText(`Active learner branch id: ${branchId}`, { exact: true })).toBeAttached();
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText('// durable dirty learner draft');
  });

  test('learner focus and selection preserve playback and instructor presence', async ({ page, request }) => {
    const recording = createPublishedRecording('teacher-recording-dual-cursor-test', 'console.log("teacher finished");\n', 3000);
    (recording.events as any[]).splice(2, 0, {
      id: 'event-instructor-selection',
      seq: 2,
      tMs: 100,
      type: 'editor.selection.changed',
      filePath: '/example.js',
      payload: { anchor: 0, head: 7 },
      origin: 'teacher',
    });
    recording.events.at(-1)!.seq = 3;

    await seedPublishedRecording(request, recording);
    await signInAsLearner(page);
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await page.getByRole('button', { name: /^play$/i }).click();
    const instructorFile = page.getByRole('button', { name: 'example.js', pressed: true });
    await expect(instructorFile).toBeVisible();
    await expect(instructorFile).not.toHaveAttribute('data-instructor-present', 'true');
    await expect(page.locator('[data-instructor-selection]')).toBeVisible();
    await expect(page.getByLabel('Cursor legend')).toContainText('Instructor');
    await expect(page.getByLabel('Cursor legend')).toContainText('You');

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');

    await expect(page.getByText(/playback status:\s*playing/i)).toBeAttached();
    await expect(page.getByText(/saved work count:\s*0/i)).toBeAttached();
    await expect(page.locator('[data-instructor-selection]')).toBeVisible();
  });

  test('learner explicitly attaches selected editor code to AI without changing lesson state', async ({ page, request }) => {
    const recording = createPublishedRecording('teacher-recording-ai-selection-test', 'console.log("selected code");\n', 1000);

    await seedPublishedRecording(request, recording);
    await signInAsLearner(page);
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();
    const before = await editor.textContent();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');

    const attach = page.getByRole('button', { name: /ask ai about selected code/i });
    await expect(attach).toBeVisible();
    await attach.click();
    await expect(page.getByText(/example\.js · line 1/i)).toBeVisible();

    await page.getByRole('textbox', { name: /ask the ai learning assistant/i }).fill('Explain this selection.');
    const aiRequestPromise = page.waitForRequest((request) => request.url().endsWith('/api/interactive/ai/chat'));
    const aiResponsePromise = page.waitForResponse((response) => response.url().endsWith('/api/interactive/ai/chat'));
    await page.getByRole('button', { name: /^send$/i }).click();
    const [aiRequest, aiResponse] = await Promise.all([aiRequestPromise, aiResponsePromise]);
    expect(aiResponse.status()).toBe(200);
    expect(aiRequest.postDataJSON().context.selection).toEqual(expect.objectContaining({ filePath: '/example.js', startLine: 1, endLine: 1 }));
    await expect(page.getByText(/received selected code|I can explain code/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /remove selected code attachment/i })).toHaveCount(0);
    await expect(editor).toHaveText(before ?? '');

    const storedResponse = await request.get(`/api/interactive/teacher-recordings/${recording.id}`);
    expect(storedResponse.ok()).toBe(true);
    expect((await storedResponse.json()).teacherRecording).toEqual(expect.objectContaining(recording));
  });

  test.skip('learner can open a published recording and save work remotely', async ({ page, request }) => {
    const finalContent = 'console.log("remote learner base");\n// remote teacher final edit\n';
    const recording = createPublishedRecording('teacher-recording-remote-delta-test', finalContent);

    await seedPublishedRecording(request, recording);
    await signInAsLearner(page);
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeAttached();
    await expect(page.getByLabel(/demo identity/i)).toHaveCount(0);
    const timelineBounds = await page.getByLabel(/lesson timeline/i).boundingBox();
    expect(timelineBounds?.width ?? 0).toBeGreaterThan(900);
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByText(/teacher lecture/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await expect
      .poll(async () => {
        const playheadText = await page.getByText(/playhead ms:\s*\d+/i).textContent();
        return Number(playheadText?.match(/playhead ms:\s*(\d+)/i)?.[1] ?? 0);
      })
      .toBeGreaterThan(0);

    await page.getByRole('button', { name: /pause and experiment/i }).click();
    await expect(page.getByText('My Experiment', { exact: true })).toBeVisible();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type('\n// remote learner delta edit');
    await expect(editor).toContainText('// remote learner delta edit');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /save experiment/i }).click();
    await expect(page.getByText(/work status:\s*saved/i)).toBeAttached();
    await expect(page.getByText(/saved work count:\s*1/i)).toBeAttached();
    await expect(page.getByRole('button', { name: /open my experiment at/i })).toBeVisible();

    await page.evaluate(() => localStorage.removeItem('interactive-poc.learnerDeltas'));
    await page.reload();
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(/saved work count:\s*1/i)).toBeAttached();

    await page.getByRole('button', { name: /open my experiment at/i }).click();
    await expect(page.getByText(/work status:\s*experiment opened/i)).toBeAttached();
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText('// remote learner delta edit');
  });

  test.skip('learner work is scoped by signed-in user', async ({ page, request }) => {
    const learnerEdit = '// learner demo scoped edit';
    const finalContent = 'console.log("remote learner base");\n// scoped teacher final edit\n';
    const recording = createPublishedRecording('teacher-recording-scoped-learner-work-test', finalContent);

    await seedPublishedRecording(request, recording);
    await signInAsLearner(page, 'Learner Demo');
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await expect
      .poll(async () => {
        const playheadText = await page.getByText(/playhead ms:\s*\d+/i).textContent();
        return Number(playheadText?.match(/playhead ms:\s*(\d+)/i)?.[1] ?? 0);
      })
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: /pause and experiment/i }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type(`\n${learnerEdit}`);
    await expect(editor).toContainText(learnerEdit);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /save experiment/i }).click();
    await expect(page.getByText(/work status:\s*saved/i)).toBeAttached();
    await expect(page.getByText(/saved work count:\s*1/i)).toBeAttached();

    await page.getByRole('button', { name: /^lessons$/i }).click();
    await signOut(page);
    await page.reload();
    await signInAsLearner(page, 'Learner Two');
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(/saved work count:\s*0/i)).toBeAttached();
    await expect(page.getByRole('button', { name: /open my experiment at/i })).toHaveCount(0);

    await page.getByRole('button', { name: /^lessons$/i }).click();
    await signOut(page);
    await signInAsLearner(page, 'Learner Demo');
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await expect(page.getByText(/saved work count:\s*1/i)).toBeAttached();
    await page.getByRole('button', { name: /open my experiment at/i }).click();
    await expect(page.getByText(/work status:\s*experiment opened/i)).toBeAttached();
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText(learnerEdit);
  });

  test('server scopes mismatched learner userId to the signed-in user', async ({ request }) => {
    const recording = createPublishedRecording('teacher-recording-mismatched-user-test', '// mismatched user final edit\n');

    await seedPublishedRecording(request, recording);
    await apiDevLogin(request, DEV_LEARNER_USER_ID);

    const response = await request.post('/api/interactive/learner-deltas', {
      data: {
        id: 'learner-delta-mismatched-user-test',
        userId: DEV_LEARNER_TWO_USER_ID,
        lessonId: recording.lessonId,
        teacherRecordingId: recording.id,
        teacherRecordingVersion: recording.version,
        teacherTimestampMs: 1,
        baseTeacherFilesHash: 'test-hash',
        addedOrModified: { '/example.js': '// mismatched user payload\n' },
        removed: [],
        selectedFile: '/example.js',
        createdAt: '2026-01-01T00:00:02.000Z',
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    expect(body.learnerDelta.userId).toBe(DEV_LEARNER_USER_ID);

    const learnerDemoDeltas = await request.get(`/api/interactive/learner-deltas?teacherRecordingId=${recording.id}`);

    expect((await learnerDemoDeltas.json()).learnerDeltas).toHaveLength(1);

    await apiDevLogin(request, DEV_LEARNER_TWO_USER_ID);

    const learnerTwoDeltas = await request.get(`/api/interactive/learner-deltas?teacherRecordingId=${recording.id}`);

    expect((await learnerTwoDeltas.json()).learnerDeltas).toHaveLength(0);
  });

  test('remote learner history is idempotent, server-owned, isolated, and preserves divergence', async ({ request }) => {
    const recording = createPublishedRecording('teacher-recording-remote-history-test', '// remote history final\n');
    await seedPublishedRecording(request, recording);
    await apiDevLogin(request, DEV_LEARNER_USER_ID);

    const branchId = 'learner-branch-remote-history-test';
    const branchFiles = { ...recording.baseFiles, '/example.js': '// browser A\n' };
    const aggregate = {
      schemaVersion: 1,
      branch: {
        schemaVersion: 1,
        id: branchId,
        userId: DEV_LEARNER_TWO_USER_ID,
        lessonId: recording.lessonId,
        origin: {
          teacherRecordingId: recording.id,
          teacherRecordingVersion: recording.version,
          teacherTimestampMs: 0,
          lastAppliedTeacherEventSeq: 1,
          baseTeacherFilesHash: hashFiles(recording.baseFiles),
        },
        headEventSeq: 1,
        createdAt: '2026-01-01T00:00:01.000Z',
        updatedAt: '2026-01-01T00:00:02.000Z',
      },
      events: [{
        schemaVersion: 1,
        id: 'learner-event-remote-history-a',
        branchId,
        seq: 1,
        createdAt: '2026-01-01T00:00:02.000Z',
        type: 'file.changed',
        filePath: 'example.js',
        payload: { content: '// browser A\n' },
      }],
      commits: [],
      workingTree: {
        schemaVersion: 1,
        branchId,
        filesSnapshot: branchFiles,
        latestEventSeq: 1,
        dirty: true,
        updatedAt: '2026-01-01T00:00:02.000Z',
      },
    };

    const created = await request.put(`/api/interactive/learner-branches/${branchId}`, { data: { learnerBranch: aggregate } });
    expect(created.status()).toBe(201);
    expect((await created.json()).learnerBranch.branch.userId).toBe(DEV_LEARNER_USER_ID);

    const repeated = await request.put(`/api/interactive/learner-branches/${branchId}`, { data: { learnerBranch: aggregate } });
    const repeatedBody = await repeated.json();
    expect(repeated.ok(), JSON.stringify(repeatedBody)).toBeTruthy();
    expect(repeatedBody.outcome).toBe('unchanged');

    const divergent = structuredClone(aggregate);
    divergent.events[0].id = 'learner-event-remote-history-b';
    divergent.events[0].payload.content = '// browser B divergence\n';
    divergent.workingTree.filesSnapshot['/example.js'] = '// browser B divergence\n';
    const forked = await request.put(`/api/interactive/learner-branches/${branchId}`, { data: { learnerBranch: divergent } });
    const forkedBody = await forked.json();
    expect(forkedBody.outcome).toBe('forked');
    expect(forkedBody.learnerBranch.branch.id).not.toBe(branchId);

    const ownerList = await request.get(`/api/interactive/learner-branches?teacherRecordingId=${recording.id}`);
    expect((await ownerList.json()).learnerBranches).toHaveLength(2);

    await apiDevLogin(request, DEV_LEARNER_TWO_USER_ID);
    const otherList = await request.get(`/api/interactive/learner-branches?teacherRecordingId=${recording.id}`);
    expect((await otherList.json()).learnerBranches).toHaveLength(0);
    expect((await request.get(`/api/interactive/learner-branches/${branchId}`)).status()).toBe(404);
  });

  test.skip('published teacher recording remains immutable after remote learner delta save', async ({ page, request }) => {
    const finalContent = 'console.log("remote learner base");\n// immutable teacher final edit\n';
    const recording = createPublishedRecording('teacher-recording-remote-immutable-test', finalContent);

    await seedPublishedRecording(request, recording);

    const rawBefore = readFileSync(getPublishedRecordingFile(recording.id), 'utf8');

    await signInAsLearner(page);
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await expect
      .poll(async () => {
        const playheadText = await page.getByText(/playhead ms:\s*\d+/i).textContent();
        return Number(playheadText?.match(/playhead ms:\s*(\d+)/i)?.[1] ?? 0);
      })
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: /pause and experiment/i }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type('\n// immutable remote learner edit');
    await expect(editor).toContainText('// immutable remote learner edit');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /save experiment/i }).click();
    await expect(page.getByText(/work status:\s*saved/i)).toBeAttached();

    const rawAfter = readFileSync(getPublishedRecordingFile(recording.id), 'utf8');

    expect(rawAfter).toBe(rawBefore);

    const changedRecording = createPublishedRecording(recording.id, `${finalContent}// changed immutable body\n`);
    const secondPublish = await request.post('/api/interactive/teacher-recordings', { data: changedRecording });

    expect(secondPublish.status()).toBe(409);
    expect(readFileSync(getPublishedRecordingFile(recording.id), 'utf8')).toBe(rawBefore);
  });

  test.skip('later teacher edits do not conflict with a timestamped learner experiment', async ({ page, request }) => {
    const learnerEdit = '// learner timestamped experiment';
    const finalContent = 'console.log("remote learner base");\n// teacher later final edit\n';
    const recording = createPublishedRecording('teacher-recording-timestamped-experiment-test', finalContent, 3000);

    await seedPublishedRecording(request, recording);
    await signInAsLearner(page);
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await waitForPlayheadToAdvance(page);
    await page.getByRole('button', { name: /pause and experiment/i }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type(`\n${learnerEdit}`);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /save experiment/i }).click();
    await expect(page.getByRole('button', { name: /open my experiment at/i })).toBeVisible();
    await expect(page.getByText(/conflict warning/i)).toHaveCount(0);
    await expect(page.getByLabel(/interactive lesson controls/i)).toContainText(/experiment saved/i);

    await page.getByRole('button', { name: /return to lecture/i }).click();
    await expect(page.getByText(/teacher lecture/i)).toBeVisible();
    await expect(editor).toContainText('// teacher later final edit', { timeout: 5000 });
    await expect(editor).not.toContainText(learnerEdit);

    await page.getByRole('button', { name: /open my experiment at/i }).click();
    await expect(editor).toContainText(learnerEdit);
    await expect(editor).not.toContainText('// teacher later final edit');
    await expect(page.getByText('My Experiment', { exact: true })).toBeVisible();
  });

  test.skip('multiple saves at one lecture timestamp remain one marker with versions', async ({ page }) => {
    const learnerEdit = '// learner first checkpoint version';
    const { editor } = await prepareLocalConflictResolutionFlow({
      page,
      recordingId: 'teacher-recording-checkpoint-versions-test',
      learnerEdit,
    });

    await page.getByRole('button', { name: /open my experiment at/i }).click();
    await editor.click();
    await page.keyboard.type('\n// learner second checkpoint version');
    await page.getByRole('button', { name: /save experiment/i }).click();

    await expect(page.getByText(/saved work count:\s*2/i)).toBeAttached();
    await expect(page.getByLabel(/my experiment markers/i).getByRole('button')).toHaveCount(1);
    await page.getByRole('button', { name: /my experiments \(1\)/i }).click();
    await expect(page.getByLabel(/my experiments drawer/i)).toContainText('2 saved versions');
  });

  test.skip('resume lecture protects unsaved experiment changes', async ({ page }) => {
    const recording = createConflictResolutionRecording({ recordingId: 'teacher-recording-unsaved-warning-test' });

    await page.evaluate((teacherRecording) => {
      localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(teacherRecording));
    }, recording);
    await publishAndOpenRecordingAsLearner(page, recording);
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await waitForPlayheadToAdvance(page);
    await page.getByRole('button', { name: /pause and experiment/i }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type('\n// unsaved learner experiment');
    await expect(page.getByText(/^unsaved changes$/i)).toBeVisible();
    await page.getByRole('button', { name: /return to lecture/i }).click();
    await expect(page.getByRole('alert', { name: /unsaved experiment warning/i })).toBeVisible();

    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(editor).toContainText('// unsaved learner experiment');
    await expect(page.getByText('My Experiment', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /return to lecture/i }).click();
    await page.getByRole('button', { name: /resume without saving/i }).click();
    await expect(editor).toContainText('// teacher conflict resolution final edit', { timeout: 5000 });
    await expect(editor).not.toContainText('// unsaved learner experiment');
  });

  test.skip('save and resume creates a marker before restoring lecture truth', async ({ page }) => {
    const recording = createConflictResolutionRecording({ recordingId: 'teacher-recording-save-resume-test' });

    await page.evaluate((teacherRecording) => {
      localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(teacherRecording));
    }, recording);
    await publishAndOpenRecordingAsLearner(page, recording);
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await waitForPlayheadToAdvance(page);
    await page.getByRole('button', { name: /pause and experiment/i }).click();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type('\n// save and resume learner experiment');
    await expect(page.getByText(/^unsaved changes$/i)).toBeVisible();
    await page.getByRole('button', { name: /return to lecture/i }).click();
    await page.getByRole('button', { name: /save and resume/i }).click();

    await expect(page.getByRole('button', { name: /open my experiment at/i })).toBeVisible();
    await expect(editor).toContainText('// teacher conflict resolution final edit', { timeout: 5000 });
    await expect(editor).not.toContainText('// save and resume learner experiment');
  });

  test.skip('opening a checkpoint preserves the immutable teacher recording', async ({ page }) => {
    const learnerEdit = '// immutable checkpoint edit';
    const { editor, rawBefore } = await prepareLocalConflictResolutionFlow({
      page,
      recordingId: 'teacher-recording-checkpoint-immutable-test',
      learnerEdit,
    });

    await page.getByRole('button', { name: /open my experiment at/i }).click();
    await expect(editor).toContainText(learnerEdit);

    const rawAfterRestore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(rawAfterRestore).toBe(rawBefore);
  });

  test.skip('plays a stored teacher recording without mutating it', async ({ page }) => {
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
    await publishAndOpenRecordingAsLearner(page, recording);
    const playRecording = page.getByRole('button', { name: /^play$/i });
    const pausePlayback = page.getByRole('button', { name: /pause and experiment/i });

    await expect(playRecording).toBeVisible();
    await expect(pausePlayback).toBeVisible();
    await expect(playRecording).toBeEnabled();

    const lessonTimeline = page.getByLabel(/lesson timeline/i);
    await playRecording.click();

    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await expect(editor).toContainText('// teacher playback edit');
    await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached();
    await expect(page.getByText(/playhead ms:\s*25/i)).toBeAttached();
    await page.getByRole('button', { name: /restart/i }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(lessonTimeline).toHaveValue('0');

    const rawAfter = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(rawAfter).toBe(rawBefore);
  });

  test('replays a teacher-created file as a structured timeline event', async ({ page }) => {
    const recording = {
      id: 'teacher-recording-created-file-test',
      lessonId: 'lesson-and-solution',
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      durationMs: 80,
      baseFiles: {
        '/example.html': '<h1>Created file base</h1>\n',
        '/example.js': 'console.log("created file base");\n',
      },
      events: [
        { id: 'created-start', seq: 0, tMs: 0, type: 'recording.started', origin: 'system' },
        {
          id: 'created-file',
          seq: 1,
          tMs: 25,
          type: 'file.created',
          filePath: '/created-during-lecture.js',
          payload: { content: '// created during lecture\n' },
          origin: 'teacher',
        },
        {
          id: 'opened-created-file',
          seq: 2,
          tMs: 30,
          type: 'file.opened',
          filePath: '/created-during-lecture.js',
          payload: { filePath: '/created-during-lecture.js' },
          origin: 'teacher',
        },
      ],
    };

    await page.evaluate((teacherRecording) => {
      localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(teacherRecording));
    }, recording);
    await publishAndOpenRecordingAsLearner(page, recording);
    await page.getByRole('button', { name: /^play$/i }).click();

    await expect(page.getByRole('button', { name: 'created-during-lecture.js', pressed: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText('// created during lecture');
  });

  test.skip('allows learner editing while paused and resumes teacher playback', async ({ page }) => {
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
    await publishAndOpenRecordingAsLearner(page, recording);

    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByText(/teacher lecture/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await expect
      .poll(async () => {
        const playheadText = await page.getByText(/playhead ms:\s*\d+/i).textContent();
        return Number(playheadText?.match(/playhead ms:\s*(\d+)/i)?.[1] ?? 0);
      })
      .toBeGreaterThan(0);

    await page.getByRole('button', { name: /pause and experiment/i }).click();
    await expect(page.getByText('My Experiment', { exact: true })).toBeVisible();
    await expect(page.getByText(/playback status:\s*paused/i)).toBeAttached();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type('\n// learner temporary edit');
    await expect(editor).toContainText('// learner temporary edit');
    await page.waitForTimeout(300);

    const rawDuringLearnerEdit = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));
    const learnerDeltasDuringLearnerEdit = await page.evaluate(() => localStorage.getItem('interactive-poc.learnerDeltas'));

    expect(rawDuringLearnerEdit).toBe(rawBefore);
    expect(learnerDeltasDuringLearnerEdit === null || learnerDeltasDuringLearnerEdit === '[]').toBe(true);

    await page.getByRole('button', { name: /return to lecture/i }).click();
    await page.getByRole('button', { name: /resume without saving/i }).click();
    await expect(page.getByText(/teacher lecture/i)).toBeVisible();
    await expect(page.getByText(/playback status:\s*playing/i)).toBeAttached();
    await expect(editor).toContainText('// teacher resumed final edit', { timeout: 5000 });
    await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached();

    const rawAfter = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));
    const learnerDeltasAfterResume = await page.evaluate(() => localStorage.getItem('interactive-poc.learnerDeltas'));

    expect(rawAfter).toBe(rawBefore);
    expect(learnerDeltasAfterResume === null || learnerDeltasAfterResume === '[]').toBe(true);
  });

  test.skip('saves a learner experiment marker and reopens its exact historical branch', async ({ page }) => {
    const baseContent = "export default 'Lesson file example.js content';\n";
    const teacherReplayContent = `${baseContent}// teacher replay overwrite\n`;
    const recording = createConflictResolutionRecording({
      recordingId: 'teacher-recording-delta-marker-test',
      jsBaseContent: baseContent,
      futureContent: teacherReplayContent,
    });

    await page.evaluate((teacherRecording) => {
      localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(teacherRecording));
    }, recording);

    const rawBefore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));
    await publishAndOpenRecordingAsLearner(page, recording);
    const saveExperiment = page.getByRole('button', { name: /save experiment/i });

    await expect(saveExperiment).toHaveCount(0);
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await waitForPlayheadToAdvance(page);
    await page.getByRole('button', { name: /pause and experiment/i }).click();
    await expect(saveExperiment).toBeEnabled();

    const editor = page.getByRole('textbox', { name: 'Editor' }).first();

    await editor.click();
    await page.keyboard.type('\n// learner delta edit');
    await expect(page.getByText(/^unsaved changes$/i)).toBeVisible();
    await saveExperiment.click();
    await expect(page.getByText(/saved work count:\s*1/i)).toBeAttached();
    await expect(page.getByText(/work status:\s*saved/i)).toBeAttached();
    await expect(page.getByRole('button', { name: /open my experiment at/i })).toBeVisible();

    const deltas = await page.evaluate(() => {
      const raw = localStorage.getItem('interactive-poc.learnerDeltas');
      return raw ? JSON.parse(raw) : [];
    });

    expect(deltas).toHaveLength(1);
    expect(deltas[0].userId).toBe(DEV_LEARNER_USER_ID);
    expect(typeof deltas[0].teacherTimestampMs).toBe('number');
    expect(deltas[0].addedOrModified['/example.js']).toContain('// learner delta edit');

    await page.getByRole('button', { name: /return to lecture/i }).click();
    await expect(editor).toContainText('// teacher replay overwrite', { timeout: 5000 });
    await expect(editor).not.toContainText('// learner delta edit');

    await page.getByRole('button', { name: /open my experiment at/i }).click();
    await expect(editor).toContainText('// learner delta edit');
    await expect(editor).not.toContainText('// teacher replay overwrite');
    await expect(page.getByText(/conflict warning/i)).toHaveCount(0);

    const rawAfter = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(rawAfter).toBe(rawBefore);
  });

  test('checkpoint restoration applies learner-added and removed files', async ({ page }) => {
    const recording = createConflictResolutionRecording({ recordingId: 'teacher-recording-added-file-checkpoint-test' });
    const checkpointTimestampMs = 500;
    const delta = {
      id: 'learner-delta-added-file-checkpoint-test',
      userId: DEV_LEARNER_USER_ID,
      lessonId: recording.lessonId,
      teacherRecordingId: recording.id,
      teacherRecordingVersion: recording.version,
      teacherTimestampMs: checkpointTimestampMs,
      baseTeacherFilesHash: simpleHashFilesForTest(recording.baseFiles),
      addedOrModified: { '/learner-experiment.js': '// learner-created checkpoint file\n' },
      removed: ['/example.html'],
      selectedFile: '/learner-experiment.js',
      createdAt: '2026-01-01T00:01:00.000Z',
    };

    const loginResponse = await page.request.post('/api/interactive/auth/dev-login', { data: { userId: DEV_TEACHER_USER_ID } });
    expect(loginResponse.ok()).toBe(true);
    const publishResponse = await page.request.post('/api/interactive/teacher-recordings', { data: recording });
    expect(publishResponse.ok()).toBe(true);
    await page.reload();
    await signInAsLearner(page);
    const deltaResponse = await page.request.post('/api/interactive/learner-deltas', { data: delta });
    expect(deltaResponse.ok()).toBe(true);
    await page.evaluate(
      ({ teacherRecording, learnerDelta }) => {
        localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(teacherRecording));
        localStorage.setItem('interactive-poc.learnerDeltas', JSON.stringify([learnerDelta]));
      },
      { teacherRecording: recording, learnerDelta: delta },
    );
    await page.reload();
    await openLearnerSection(page);
    await page.getByRole('button', { name: /start lesson/i }).click();
    await expect(page.getByRole('button', { name: /open imported legacy checkpoint at/i })).toBeVisible();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /open imported legacy checkpoint at/i }).click();

    await expect(page.getByRole('button', { name: 'learner-experiment.js', pressed: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'example.html' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText('// learner-created checkpoint file');
  });

});
