import { readFileSync, rmSync, writeFileSync } from 'node:fs';
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
        const request = indexedDB.open('interactive-timeline-poc', 2);

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
  const identitySelect = page.getByLabel(/choose demo identity/i);

  await expect(identitySelect).toBeVisible();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await identitySelect.selectOption({ label: `Sign in as ${learnerName}` });

    try {
      await expect(page.getByText(new RegExp(`signed-in user:\\s*${learnerName}`, 'i'))).toBeVisible({ timeout: 2500 });
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
  await expect(page.getByText(/signed-in role:\s*teacher/i)).toBeVisible();
}

async function signInAsLearner(page: Page, learnerName: 'Learner Demo' | 'Learner Two' = 'Learner Demo') {
  await chooseDemoIdentity(page, learnerName);
  await expect(page.getByText(/signed-in role:\s*learner/i)).toBeVisible();
}

async function signOut(page: Page) {
  await clickUntilTextVisible(page, /sign out/i, /signed-in user:\s*signed out/i);
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
  await expandDetails(page, 'Recording Library');
}

async function openTeacherTools(page: Page) {
  await expandDetails(page, 'Import, Export, and Demo Tools');
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
  await clickRoleTabUntilVisible(page, 'Learner Lesson', /learner lesson/i);
}

async function openTeacherSection(page: Page) {
  await clickRoleTabUntilVisible(page, 'Teacher Studio', /teacher studio/i);
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
  await openTeacherTools(page);
  await page.getByRole('button', { name: /^reset demo data$/i }).click();
  await expect(page.getByText(/are you sure\? this removes only demo-prefixed records/i)).toBeVisible();
  await page.getByRole('button', { name: /^confirm reset demo data$/i }).click();
}

async function seedDemoRecordingFromTeacherDashboard(page: Page) {
  await openTeacherSection(page);
  await confirmResetDemoData(page);
  await expect(page.getByText(/demo data status:\s*reset/i)).toBeVisible();
  await page.getByRole('button', { name: /demo seed/i }).click();
  await expect(page.getByText(/demo data status:\s*seeded demo-interactive-conflict-flow/i)).toBeVisible();
  await openRecordingLibrary(page);
  await expect(page.getByLabel(/select published lesson/i)).toHaveValue('demo-interactive-conflict-flow');
}

async function exportRecordingPackageFromUi(page: Page, outputPath: string) {
  await openTeacherTools(page);
  const downloadPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: /export package/i }).click();

  const download = await downloadPromise;

  await download.saveAs(outputPath);
  await expect(page.getByText(/export package status:\s*exported package/i)).toBeVisible();

  return outputPath;
}

async function uploadRecordingPackage(page: Page, packagePath: string) {
  await openTeacherTools(page);
  await page.getByLabel(/import package/i).setInputFiles(packagePath);
  await expect(page.getByText(/import package status:\s*package selected/i)).toBeVisible();
}

async function getImportedPublishedId(page: Page) {
  const importStatusText = await page.getByText(/import package status:\s*imported published copy/i).textContent();
  const importedId = importStatusText?.match(/imported published copy\s+([^\s]+)/i)?.[1];

  expect(importedId).toBeTruthy();

  return importedId!;
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

  await signInAsLearner(page);
  await openLearnerSection(page);
  await page.getByRole('button', { name: /play lesson/i }).click();
  await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
  await waitForPlayheadToAdvance(page);
  await page.getByRole('button', { name: /try it yourself/i }).click();
  await expect(page.getByText(/mode:\s*learner-editing/i)).toBeVisible();

  const editor = page.locator('#editor-opened').getByRole('textbox').first();

  await editor.click();
  await page.keyboard.type(`\n${learnerEdit}`);
  await expect(editor).toContainText(learnerEdit);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /save my work/i }).click();
  await expect(page.getByText(/saved work count:\s*1/i)).toBeVisible();
  await expect(page.getByText(/work status:\s*saved/i)).toBeVisible();

  await page.getByRole('button', { name: /resume teacher/i }).click();
  await expect(page.getByText(/playback status:\s*finished/i)).toBeVisible({ timeout: 5000 });

  if (futureFilePath === '/example.js') {
    await expect(editor).toContainText('// teacher conflict resolution final edit');
    await expect(editor).not.toContainText(learnerEdit);
  }

  return { editor, learnerEdit, rawBefore, recording };
}

async function openConflictResolutionPrompt(page: Page) {
  await expect(page.getByRole('region', { name: /conflict resolution/i })).toHaveCount(0);
  await page.getByRole('button', { name: /restore my work/i }).click();
  await expect(page.getByRole('region', { name: /conflict resolution/i })).toBeVisible();
}

test.describe('interactive timeline POC', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    rmSync(INTERACTIVE_DATA_DIR, { recursive: true, force: true });
    await page.goto(getPocUrl(baseURL));
    await page.evaluate(() => {
      localStorage.removeItem('interactive-poc.teacherRecording');
      localStorage.removeItem('interactive-poc.learnerDeltas');
      localStorage.removeItem('interactive-poc.fakeMediaRecorder');
    });
  });

  test('primary UI uses thesis-demo product wording', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /interactive thesis demo/i })).toBeVisible();
    await expandDetails(page, 'Thesis demo walkthrough');
    await expect(page.getByText(/seed a lesson or create a recording/i)).toBeVisible();
    await expect(page.getByText(/resume, restore, and resolve conflicts/i)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /teacher studio/i })).toBeVisible();
    await expect(page.getByLabel(/choose demo identity/i)).toBeVisible();
    await expect(page.getByRole('option', { name: /sign in as teacher demo/i })).toBeAttached();
    await expect(page.getByRole('option', { name: /sign in as learner demo/i })).toBeAttached();
    await expect(page.getByRole('option', { name: /sign in as learner two/i })).toBeAttached();
    await openLearnerSection(page);

    await expect(page.getByRole('button', { name: /try it yourself/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /save my work/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /restore my work/i })).toBeVisible();
    await expect(page.getByText(/work status:/i)).toBeVisible();
    await expect(page.getByText(/conflict warning:/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /pause & try it/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /save learner delta/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /restore learner delta/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /teacher dashboard/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /learner playback/i })).toHaveCount(0);
    await expect(page.getByText(/raw debug controls/i)).toHaveCount(0);
    await expect(page.getByText(/compatibility localStorage keys/i)).toBeHidden();
  });

  test('demo sign-in works', async ({ page }) => {
    await expect(page.getByText(/signed-in user:\s*signed out/i)).toBeVisible();
    await signInAsTeacher(page);
    await signOut(page);
    await expect(page.getByText(/signed-in role:\s*none/i)).toBeVisible();
  });

  test('destructive teacher actions require confirmation', async ({ page }) => {
    await signInAsTeacher(page);
    await openTeacherSection(page);

    await openTeacherTools(page);
    await page.getByRole('button', { name: /^reset demo data$/i }).click();
    await expect(page.getByRole('button', { name: /^confirm reset demo data$/i })).toBeVisible();
    await expect(page.getByText(/are you sure\? this removes only demo-prefixed records/i)).toBeVisible();
    await expect(page.getByText(/demo data status:\s*idle/i)).toBeVisible();
    await page.getByRole('button', { name: /^confirm reset demo data$/i }).click();
    await expect(page.getByText(/demo data status:\s*reset/i)).toBeVisible();

    await page.getByRole('button', { name: /record timeline only/i }).click();
    await page.getByRole('button', { name: /stop recording/i }).click();
    await expect(page.getByText(/draft status:\s*unsaved/i)).toBeVisible();
    await openRecordingLibrary(page);
    await page.getByRole('button', { name: /^discard draft$/i }).click();
    await expect(page.getByRole('button', { name: /^confirm discard draft$/i })).toBeVisible();
    await expect(page.getByText(/are you sure\? this clears the current draft/i)).toBeVisible();
    await expect(page.getByText(/draft status:\s*unsaved/i)).toBeVisible();
    await page.getByRole('button', { name: /^confirm discard draft$/i }).click();
    await expect(page.getByText(/draft status:\s*discarded/i)).toBeVisible();

    await page.getByRole('button', { name: /record timeline only/i }).click();
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeVisible();
    await openRecordingLibrary(page);
    await page.getByRole('button', { name: /^delete draft$/i }).click();
    await expect(page.getByRole('button', { name: /^confirm delete draft$/i }).first()).toBeVisible();
    await expect(page.getByText(/are you sure\? this deletes the selected local draft/i).first()).toBeVisible();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeVisible();
  });

  test('teacher publish requires teacher identity', async ({ page }) => {
    await page.getByRole('button', { name: /record timeline only/i }).click();
    await page.getByRole('button', { name: 'example.js' }).click();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await editor.click();
    await page.keyboard.type('\n// teacher identity publish edit');
    await expect(editor).toContainText('// teacher identity publish edit');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await expect(page.getByRole('button', { name: /publish recording/i })).toBeDisabled();

    await signInAsTeacher(page);
    await expect(page.getByRole('button', { name: /publish recording/i })).toBeEnabled();
    await page.getByRole('button', { name: /publish recording/i }).click();
    await expect(page.getByText(/published status:\s*published/i)).toBeVisible();
    await expect(page.getByText(/publish identity:\s*teacher allowed/i)).toBeVisible();

    const publishedIdText = await page.getByText(/published recording id:\s*teacher-recording-/i).textContent();
    const publishedId = publishedIdText?.match(/published recording id:\s*(teacher-recording-[\w-]+)/i)?.[1];
    const publishedRecording = JSON.parse(readFileSync(getPublishedRecordingFile(publishedId!), 'utf8'));

    expect(publishedRecording.ownerUserId).toBe(DEV_TEACHER_USER_ID);
    expect(publishedRecording.createdByUserId).toBe(DEV_TEACHER_USER_ID);
    expect(publishedRecording.publishedByUserId).toBe(DEV_TEACHER_USER_ID);
  });

  test('records one editor edit into a saved teacher draft localStorage mirror', async ({ page }) => {
    const startRecording = page.getByRole('button', { name: /record timeline only/i });
    const stopRecording = page.getByRole('button', { name: /stop recording/i });
    const saveDraft = page.getByRole('button', { name: /save draft/i });

    await expect(startRecording).toBeVisible();
    await expect(stopRecording).toBeVisible();
    await expect(saveDraft).toBeVisible();

    await startRecording.click();
    await expect(page.getByRole('region', { name: /recording session/i })).toContainText(/recording in progress/i);
    await expect(page.getByText(/recording status:\s*active/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /stop recording/i })).toBeEnabled();
    await expect(page.getByText(/draft status:\s*unsaved/i)).toBeVisible();
    await page.getByRole('button', { name: 'example.js' }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();
    await editor.click();
    await page.keyboard.type('\n// interactive poc recording edit');
    await expect(editor).toContainText('// interactive poc recording edit');
    await page.waitForTimeout(300);
    await expect(page.getByText(/event count:\s*[3-9]\d*/i)).toBeVisible();

    await stopRecording.click();
    await expect(page.getByText(/draft status:\s*unsaved/i)).toBeVisible();
    await expect(saveDraft).toBeEnabled();
    await saveDraft.click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeVisible();

    const rawRecording = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(rawRecording).toBeTruthy();

    const recording = JSON.parse(rawRecording!);

    expect(recording.baseFiles).toBeTruthy();
    expect(Object.keys(recording.baseFiles).length).toBeGreaterThan(0);
    expect(Array.isArray(recording.events)).toBeTruthy();
    expect(recording.events.length).toBeGreaterThan(0);
    expect(recording.events.some((event: any) => event.type === 'file.changed')).toBeTruthy();
  });

  test('teacher draft list works with a saved local draft', async ({ page }) => {
    await page.getByRole('button', { name: /record timeline only/i }).click();
    await page.getByRole('button', { name: 'example.js' }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await editor.click();
    await page.keyboard.type('\n// teacher local draft edit');
    await expect(editor).toContainText('// teacher local draft edit');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await expect(page.getByText(/draft status:\s*unsaved/i)).toBeVisible();

    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeVisible();
    await expect(page.getByText(/current draft id:\s*teacher-recording-/i)).toBeVisible();

    const rawRecording = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(rawRecording).toBeTruthy();
    const savedRecording = JSON.parse(rawRecording!);

    await page.evaluate(() => localStorage.removeItem('interactive-poc.teacherRecording'));
    await page.reload();
    await openRecordingLibrary(page);

    await expect(page.getByRole('heading', { name: /local drafts/i })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: savedRecording.id })).toBeVisible();

    const loadDraft = page.getByRole('button', { name: /load draft/i });

    await expect(loadDraft).toBeVisible();
    await expect(loadDraft).toBeEnabled();
    await loadDraft.click();
    await expect(page.getByText(/draft status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(/current draft id:\s*teacher-recording-/i)).toBeVisible();

    const previewDraft = page.getByRole('button', { name: /preview draft/i });

    await expect(previewDraft).toBeEnabled();
    await previewDraft.click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();

    const reloadedEditor = page.locator('#editor-opened').getByRole('textbox').first();

    await expect(reloadedEditor).toContainText('// teacher local draft edit');
    await expect(page.getByText(/playback status:\s*finished/i)).toBeVisible();
  });

  test('teacher can save and load draft with fake audio media', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('interactive-poc.fakeMediaRecorder', 'true'));

    await page.getByRole('button', { name: /record with mic/i }).click();
    await expect(page.getByText(/media status:\s*recording/i)).toBeVisible();
    await expect(page.getByText(/media kind:\s*audio/i)).toBeVisible();
    await page.getByRole('button', { name: 'example.js' }).click();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await editor.click();
    await page.keyboard.type('\n// teacher fake audio draft edit');
    await expect(editor).toContainText('// teacher fake audio draft edit');
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: /stop recording/i }).click();
    await expect(page.getByText(/draft status:\s*unsaved/i)).toBeVisible();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(/media duration ms:\s*[1-9]\d*/i)).toBeVisible();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeVisible();
    await expect(page.getByText(/media status:\s*saved/i)).toBeVisible();

    const mirroredRecording = await page.evaluate(() => {
      const raw = localStorage.getItem('interactive-poc.teacherRecording');
      return raw ? JSON.parse(raw) : undefined;
    });

    expect(mirroredRecording?.mediaAssets).toHaveLength(1);
    expect(mirroredRecording.mediaAssets[0].kind).toBe('audio');
    expect(mirroredRecording.mediaAssets[0].blob).toBeUndefined();

    await page.reload();
    await page.getByRole('button', { name: /load draft/i }).click();
    await expect(page.getByText(/draft status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(/media kind:\s*audio/i)).toBeVisible();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /preview draft/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();

    const reloadedEditor = page.locator('#editor-opened').getByRole('textbox').first();

    await expect(reloadedEditor).toContainText('// teacher fake audio draft edit', { timeout: 5000 });
    await expect(page.getByText(/playback status:\s*finished/i)).toBeVisible({ timeout: 5000 });
  });

  test('media playback drives the structured timeline playhead', async ({ page }) => {
    const finalContent = 'console.log("media clock base");\n// media currentTime applied edit\n';

    await seedIndexedDbMediaDraft(page, {
      recordingId: 'teacher-recording-media-clock-test',
      mediaAssetId: 'media-asset-clock-test',
      eventMs: 600,
      finalContent,
    });

    await page.getByRole('button', { name: /load draft/i }).click();
    await expect(page.getByText(/draft status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeVisible();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /preview draft/i }).click();
    await expect(page.getByText(/playback status:\s*playing/i)).toBeVisible();

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

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await expect(editor).toContainText('// media currentTime applied edit', { timeout: 5000 });
    await expect(page.getByText(/playback status:\s*finished/i)).toBeVisible({ timeout: 5000 });
  });

  test('Teacher Studio lists a published lesson', async ({ page, request }) => {
    const finalContent = 'console.log("remote learner base");\n// teacher studio listed published edit\n';
    const recording = createPublishedRecording('teacher-recording-dashboard-list-test', finalContent, 25);

    await seedPublishedRecording(request, recording);
    await openTeacherSection(page);
    await openRecordingLibrary(page);
    await page.getByRole('button', { name: /refresh recordings/i }).click();
    await expect(page.getByRole('heading', { name: /published lessons/i })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: recording.id })).toBeVisible();

    await page.getByRole('button', { name: /load selected published lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeVisible();
    await page.getByRole('button', { name: /preview selected published lesson/i }).click();
    await expect(page.locator('#editor-opened').getByRole('textbox').first()).toContainText(
      '// teacher studio listed published edit',
      { timeout: 5000 },
    );
  });

  test('teacher can publish and reload recording from backend', async ({ page }) => {
    await signInAsTeacher(page);
    await page.getByRole('button', { name: /record timeline only/i }).click();
    await page.getByRole('button', { name: 'example.js' }).click();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await editor.click();
    await page.keyboard.type('\n// teacher backend publish edit');
    await expect(editor).toContainText('// teacher backend publish edit');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /publish recording/i }).click();
    await expect(page.getByText(/published status:\s*published/i)).toBeVisible();

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
    await expect(page.getByLabel(/select published lesson/i)).toHaveValue(publishedId!);

    await page.getByRole('button', { name: /load published lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(new RegExp(`published recording id:\\s*${publishedId}`, 'i'))).toBeVisible();
    await page.getByRole('button', { name: /preview published lesson/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await expect(page.locator('#editor-opened').getByRole('textbox').first()).toContainText(
      '// teacher backend publish edit',
      { timeout: 5000 },
    );
    await expect(page.getByText(/playback status:\s*finished/i)).toBeVisible({ timeout: 5000 });
  });

  test('teacher can publish media recording and load media from backend', async ({ page }) => {
    await signInAsTeacher(page);
    await page.evaluate(() => localStorage.setItem('interactive-poc.fakeMediaRecorder', 'true'));

    await page.getByRole('button', { name: /record with mic/i }).click();
    await expect(page.getByText(/media status:\s*recording/i)).toBeVisible();
    await page.getByRole('button', { name: 'example.js' }).click();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await editor.click();
    await page.keyboard.type('\n// teacher backend media publish edit');
    await expect(editor).toContainText('// teacher backend media publish edit');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeVisible();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /publish recording/i }).click();
    await expect(page.getByText(/published status:\s*published/i)).toBeVisible();
    await expect(page.getByText(/media status:\s*saved/i)).toBeVisible();

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
    await expect(page.getByLabel(/select published lesson/i)).toHaveValue(publishedId!);

    await page.getByRole('button', { name: /load published lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(/media kind:\s*audio/i)).toBeVisible();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /preview published lesson/i }).click();
    await expect(page.locator('#editor-opened').getByRole('textbox').first()).toContainText(
      '// teacher backend media publish edit',
      { timeout: 5000 },
    );
    await expect(page.getByText(/playback status:\s*finished/i)).toBeVisible({ timeout: 5000 });
  });

  test('unsupported import package version shows a friendly error', async ({ page }, testInfo) => {
    const packagePath = testInfo.outputPath('unsupported-export-package.json');

    writeFileSync(packagePath, JSON.stringify({ formatVersion: 999, exportedAt: '2026-01-01T00:00:00.000Z' }));
    await uploadRecordingPackage(page, packagePath);
    await page.getByRole('button', { name: /import as draft/i }).click();
    await expect(page.getByText(/import package status:\s*error: unsupported package version/i)).toBeVisible();
    await expect(page.getByText(/export the package again with this app/i)).toBeVisible();
  });

  test('teacher can export and import recording as draft', async ({ page }, testInfo) => {
    await signInAsTeacher(page);
    await seedDemoRecordingFromTeacherDashboard(page);

    const packagePath = await exportRecordingPackageFromUi(page, testInfo.outputPath('demo-export-draft.json'));
    const exportedPackage = JSON.parse(readFileSync(packagePath, 'utf8'));

    expect(exportedPackage.formatVersion).toBe(1);
    expect(exportedPackage.teacherRecording.id).toBe('demo-interactive-conflict-flow');
    expect(exportedPackage.teacherRecording.events).toHaveLength(3);
    expect(exportedPackage.mediaAssets[0].metadata.id).toBe('demo-interactive-conflict-flow-audio');
    expect(exportedPackage.mediaAssets[0].dataBase64).toBeTruthy();

    await confirmResetDemoData(page);
    await expect(page.getByText(/demo data status:\s*reset/i)).toBeVisible();
    await uploadRecordingPackage(page, packagePath);
    await page.getByRole('button', { name: /import as draft/i }).click();
    await expect(page.getByText(/import package status:\s*imported draft copy demo-interactive-conflict-flow-import/i)).toBeVisible();
    await openRecordingLibrary(page);
    await expect(page.getByLabel(/select local draft/i)).toHaveValue(/demo-interactive-conflict-flow-import/);

    await page.getByRole('button', { name: /^preview draft$/i }).click();
    await expect(page.locator('#editor-opened').getByRole('textbox').first()).toContainText('// teacher demo final edit', {
      timeout: 6000,
    });
  });

  test('teacher can import package as published recording', async ({ page, request }, testInfo) => {
    await signInAsTeacher(page);
    await seedDemoRecordingFromTeacherDashboard(page);

    const packagePath = await exportRecordingPackageFromUi(page, testInfo.outputPath('demo-export-published.json'));

    await uploadRecordingPackage(page, packagePath);
    await page.getByRole('button', { name: /import as published/i }).click();
    await expect(page.getByText(/import package status:\s*imported published copy demo-interactive-conflict-flow-import/i)).toBeVisible();

    const importedId = await getImportedPublishedId(page);

    await openRecordingLibrary(page);
    await expect(page.getByLabel(/select published lesson/i)).toHaveValue(importedId);

    await apiDevLogin(request, DEV_TEACHER_USER_ID);
    const importedResponse = await request.get(`/api/interactive/teacher-recordings/${importedId}`);
    const importedRecording = (await importedResponse.json()).teacherRecording;
    const immutableResponse = await request.post('/api/interactive/teacher-recordings', {
      data: { ...importedRecording, durationMs: importedRecording.durationMs + 1 },
    });

    expect(immutableResponse.status()).toBe(409);

    await signInAsLearner(page);
    await openLearnerSection(page);
    await page.getByLabel(/select published lesson/i).selectOption(importedId);
    await page.getByRole('button', { name: /open published lesson/i }).click();
    await expect(page.getByText(new RegExp(`published recording id:\\s*${importedId}`, 'i'))).toBeVisible();
    await page.getByRole('button', { name: /play lesson/i }).click();
    await expect(page.locator('#editor-opened').getByRole('textbox').first()).toContainText('// teacher demo final edit', {
      timeout: 6000,
    });
  });

  test('imported recording keeps media playback', async ({ page }, testInfo) => {
    await signInAsTeacher(page);
    await seedDemoRecordingFromTeacherDashboard(page);

    const packagePath = await exportRecordingPackageFromUi(page, testInfo.outputPath('demo-export-media.json'));

    await uploadRecordingPackage(page, packagePath);
    await page.getByRole('button', { name: /import as draft/i }).click();
    await expect(page.getByText(/import package status:\s*imported draft copy demo-interactive-conflict-flow-import/i)).toBeVisible();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(/media kind:\s*audio/i)).toBeVisible();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /^preview draft$/i }).click();
    await expect(page.getByText(/playback status:\s*playing/i)).toBeVisible();
    await waitForPlayheadToAdvance(page);
    await expect(page.locator('#editor-opened').getByRole('textbox').first()).toContainText('// teacher demo final edit', {
      timeout: 6000,
    });
  });

  test('import package with missing media degrades gracefully', async ({ page }, testInfo) => {
    await signInAsTeacher(page);
    await seedDemoRecordingFromTeacherDashboard(page);

    const packagePath = await exportRecordingPackageFromUi(page, testInfo.outputPath('demo-export-without-media-source.json'));
    const packageWithoutMedia = JSON.parse(readFileSync(packagePath, 'utf8'));
    const missingMediaPath = testInfo.outputPath('demo-export-without-media.json');

    packageWithoutMedia.mediaAssets = [];
    writeFileSync(missingMediaPath, JSON.stringify(packageWithoutMedia));

    await uploadRecordingPackage(page, missingMediaPath);
    await page.getByRole('button', { name: /import as draft/i }).click();
    await expect(page.getByText(/import package status:\s*imported draft copy demo-interactive-conflict-flow-import/i)).toBeVisible();
    await expect(page.getByText(/media asset\(s\) were skipped because package data was missing/i)).toBeVisible();

    await page.getByRole('button', { name: /^preview draft$/i }).click();
    await expect(page.locator('#editor-opened').getByRole('textbox').first()).toContainText('// teacher demo final edit', {
      timeout: 6000,
    });
  });

  test('demo seed creates predictable lesson', async ({ page }) => {
    const learnerEdit = '// learner demo seed conflict edit';

    await signInAsTeacher(page);
    await seedDemoRecordingFromTeacherDashboard(page);
    await signInAsLearner(page);
    await openLearnerSection(page);
    await expect(page.getByLabel(/select published lesson/i)).toHaveValue('demo-interactive-conflict-flow');
    await page.getByRole('button', { name: /open published lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeVisible();
    await page.getByRole('button', { name: /play lesson/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await page.getByRole('button', { name: /try it yourself/i }).click();
    await expect(page.getByText(/mode:\s*learner-editing/i)).toBeVisible();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await editor.click();
    await page.keyboard.type(`\n${learnerEdit}`);
    await expect(editor).toContainText(learnerEdit);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /save my work/i }).click();
    await expect(page.getByText(/work status:\s*saved/i)).toBeVisible();
    await expect(page.getByText(/conflict warning:\s*conflict/i)).toBeVisible();

    await page.getByRole('button', { name: /resume teacher/i }).click();
    await expect(editor).toContainText('// teacher demo final edit', { timeout: 6000 });
    await expect(editor).not.toContainText(learnerEdit);
    await page.getByRole('button', { name: /restore my work/i }).click();
    await expect(page.getByRole('region', { name: /conflict resolution/i })).toBeVisible();
    await page.getByRole('button', { name: /restore my work anyway/i }).click();
    await expect(page.getByText(/work status:\s*restored with conflicts/i)).toBeVisible();
    await expect(editor).toContainText(learnerEdit);
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
    await expect(page.getByText(/demo data status:\s*reset/i)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /teacher studio/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /record timeline only/i })).toBeVisible();

    const preservedResponse = await request.get(`/api/interactive/teacher-recordings/${nonDemoRecording.id}`);
    const demoResponse = await request.get('/api/interactive/teacher-recordings/demo-interactive-conflict-flow');

    expect(preservedResponse.ok()).toBeTruthy();
    expect(demoResponse.status()).toBe(404);
    await expect(page.getByRole('listitem').filter({ hasText: nonDemoRecording.id })).toBeVisible();

    await page.getByRole('button', { name: /demo seed/i }).click();
    await expect(page.getByText(/demo data status:\s*seeded demo-interactive-conflict-flow/i)).toBeVisible();
    await expect(page.getByLabel(/select published lesson/i)).toHaveValue('demo-interactive-conflict-flow');
  });

  test('learner can open a published recording and save work remotely', async ({ page, request }) => {
    const finalContent = 'console.log("remote learner base");\n// remote teacher final edit\n';
    const recording = createPublishedRecording('teacher-recording-remote-delta-test', finalContent);

    await seedPublishedRecording(request, recording);
    await signInAsLearner(page);
    await openLearnerSection(page);
    await page.getByRole('button', { name: /open published lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeVisible();
    await page.getByRole('button', { name: /play lesson/i }).click();
    await expect(page.getByText(/mode:\s*teacher-playback/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await expect
      .poll(async () => {
        const playheadText = await page.getByText(/playhead ms:\s*\d+/i).textContent();
        return Number(playheadText?.match(/playhead ms:\s*(\d+)/i)?.[1] ?? 0);
      })
      .toBeGreaterThan(0);

    await page.getByRole('button', { name: /try it yourself/i }).click();
    await expect(page.getByText(/mode:\s*learner-editing/i)).toBeVisible();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await editor.click();
    await page.keyboard.type('\n// remote learner delta edit');
    await expect(editor).toContainText('// remote learner delta edit');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /save my work/i }).click();
    await expect(page.getByText(/work status:\s*saved/i)).toBeVisible();
    await expect(page.getByText(/saved work count:\s*1/i)).toBeVisible();
    await expect(page.getByText(/conflict warning:\s*conflict/i)).toBeVisible();

    await page.evaluate(() => localStorage.removeItem('interactive-poc.learnerDeltas'));
    await page.reload();
    await openLearnerSection(page);
    await page.getByRole('button', { name: /open published lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(/saved work count:\s*1/i)).toBeVisible();

    await page.getByRole('button', { name: /restore my work/i }).click();
    await expect(page.getByRole('region', { name: /conflict resolution/i })).toBeVisible();
    await page.getByRole('button', { name: /restore my work anyway/i }).click();
    await expect(page.getByText(/work status:\s*restored with conflicts/i)).toBeVisible();
    await expect(page.locator('#editor-opened').getByRole('textbox').first()).toContainText('// remote learner delta edit');
  });

  test('learner work is scoped by signed-in user', async ({ page, request }) => {
    const learnerEdit = '// learner demo scoped edit';
    const finalContent = 'console.log("remote learner base");\n// scoped teacher final edit\n';
    const recording = createPublishedRecording('teacher-recording-scoped-learner-work-test', finalContent);

    await seedPublishedRecording(request, recording);
    await signInAsLearner(page, 'Learner Demo');
    await openLearnerSection(page);
    await page.getByRole('button', { name: /open published lesson/i }).click();
    await page.getByRole('button', { name: /play lesson/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await expect
      .poll(async () => {
        const playheadText = await page.getByText(/playhead ms:\s*\d+/i).textContent();
        return Number(playheadText?.match(/playhead ms:\s*(\d+)/i)?.[1] ?? 0);
      })
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: /try it yourself/i }).click();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await editor.click();
    await page.keyboard.type(`\n${learnerEdit}`);
    await expect(editor).toContainText(learnerEdit);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /save my work/i }).click();
    await expect(page.getByText(/work status:\s*saved/i)).toBeVisible();
    await expect(page.getByText(/saved work count:\s*1/i)).toBeVisible();

    await signOut(page);
    await page.reload();
    await signInAsLearner(page, 'Learner Two');
    await openLearnerSection(page);
    await page.getByRole('button', { name: /open published lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(/saved work count:\s*0/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /restore my work/i })).toBeDisabled();

    await signOut(page);
    await signInAsLearner(page, 'Learner Demo');
    await openLearnerSection(page);
    await page.getByRole('button', { name: /open published lesson/i }).click();
    await expect(page.getByText(/saved work count:\s*1/i)).toBeVisible();
    await page.getByRole('button', { name: /restore my work/i }).click();
    await expect(page.getByRole('region', { name: /conflict resolution/i })).toBeVisible();
    await page.getByRole('button', { name: /restore my work anyway/i }).click();
    await expect(page.getByText(/work status:\s*restored with conflicts/i)).toBeVisible();
    await expect(page.locator('#editor-opened').getByRole('textbox').first()).toContainText(learnerEdit);
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

  test('published teacher recording remains immutable after remote learner delta save', async ({ page, request }) => {
    const finalContent = 'console.log("remote learner base");\n// immutable teacher final edit\n';
    const recording = createPublishedRecording('teacher-recording-remote-immutable-test', finalContent);

    await seedPublishedRecording(request, recording);

    const rawBefore = readFileSync(getPublishedRecordingFile(recording.id), 'utf8');

    await signInAsLearner(page);
    await openLearnerSection(page);
    await page.getByRole('button', { name: /open published lesson/i }).click();
    await page.getByRole('button', { name: /play lesson/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await expect
      .poll(async () => {
        const playheadText = await page.getByText(/playhead ms:\s*\d+/i).textContent();
        return Number(playheadText?.match(/playhead ms:\s*(\d+)/i)?.[1] ?? 0);
      })
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: /try it yourself/i }).click();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await editor.click();
    await page.keyboard.type('\n// immutable remote learner edit');
    await expect(editor).toContainText('// immutable remote learner edit');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /save my work/i }).click();
    await expect(page.getByText(/work status:\s*saved/i)).toBeVisible();

    const rawAfter = readFileSync(getPublishedRecordingFile(recording.id), 'utf8');

    expect(rawAfter).toBe(rawBefore);

    const changedRecording = createPublishedRecording(recording.id, `${finalContent}// changed immutable body\n`);
    const secondPublish = await request.post('/api/interactive/teacher-recordings', { data: changedRecording });

    expect(secondPublish.status()).toBe(409);
    expect(readFileSync(getPublishedRecordingFile(recording.id), 'utf8')).toBe(rawBefore);
  });

  test('conflict restore prompts learner', async ({ page, request }) => {
    const learnerEdit = '// learner conflict prompt edit';
    const finalContent = 'console.log("remote learner base");\n// teacher conflict prompt final edit\n';
    const recording = createPublishedRecording('teacher-recording-conflict-prompt-test', finalContent, 3000);

    await seedPublishedRecording(request, recording);
    await signInAsLearner(page);
    await openLearnerSection(page);
    await page.getByRole('button', { name: /open published lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeVisible();
    await page.getByRole('button', { name: /play lesson/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await waitForPlayheadToAdvance(page);
    await page.getByRole('button', { name: /try it yourself/i }).click();
    await expect(page.getByText(/mode:\s*learner-editing/i)).toBeVisible();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await editor.click();
    await page.keyboard.type(`\n${learnerEdit}`);
    await expect(editor).toContainText(learnerEdit);
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /save my work/i }).click();
    await expect(page.getByText(/work status:\s*saved/i)).toBeVisible();
    await expect(page.getByText(/conflict warning:\s*conflict/i)).toBeVisible();
    await expect(page.getByText(/conflicted files:\s*\/example\.js/i)).toBeVisible();
    await expect(page.getByText(/your saved work touches files the teacher changed later/i)).toBeVisible();
    await expect(page.getByRole('region', { name: /conflict resolution/i })).toHaveCount(0);

    await page.getByRole('button', { name: /resume teacher/i }).click();
    await expect(editor).toContainText('// teacher conflict prompt final edit', { timeout: 5000 });
    await expect(editor).not.toContainText(learnerEdit);

    await openConflictResolutionPrompt(page);
    await expect(page.getByRole('button', { name: /restore my work anyway/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /keep teacher version/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /view conflict details/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^cancel$/i })).toBeVisible();
  });

  test('restore anyway applies learner work', async ({ page }) => {
    const learnerEdit = '// learner restore anyway edit';
    const { editor, rawBefore } = await prepareLocalConflictResolutionFlow({
      page,
      recordingId: 'teacher-recording-restore-anyway-test',
      learnerEdit,
    });

    await openConflictResolutionPrompt(page);
    await page.getByRole('button', { name: /restore my work anyway/i }).click();
    await expect(page.getByText(/work status:\s*restored with conflicts/i)).toBeVisible();
    await expect(editor).toContainText(learnerEdit);

    const rawAfterRestore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(rawAfterRestore).toBe(rawBefore);
  });

  test('keep teacher version does not restore learner work', async ({ page }) => {
    const learnerEdit = '// learner keep teacher version edit';
    const { editor } = await prepareLocalConflictResolutionFlow({
      page,
      recordingId: 'teacher-recording-keep-teacher-version-test',
      learnerEdit,
    });

    await openConflictResolutionPrompt(page);
    await page.getByRole('button', { name: /keep teacher version/i }).click();
    await expect(page.getByText(/work status:\s*kept teacher version/i)).toBeVisible();
    await expect(page.getByRole('region', { name: /conflict resolution/i })).toHaveCount(0);
    await expect(editor).toContainText('// teacher conflict resolution final edit');
    await expect(editor).not.toContainText(learnerEdit);

    const deltas = await page.evaluate(() => {
      const raw = localStorage.getItem('interactive-poc.learnerDeltas');
      return raw ? JSON.parse(raw) : [];
    });

    expect(deltas).toHaveLength(1);
    expect(deltas[0].addedOrModified['/example.js']).toContain(learnerEdit);
  });

  test('view conflict details expands event information', async ({ page }) => {
    const learnerEdit = '// learner conflict details edit';
    const { editor } = await prepareLocalConflictResolutionFlow({
      page,
      recordingId: 'teacher-recording-conflict-details-test',
      learnerEdit,
    });

    await openConflictResolutionPrompt(page);
    await page.getByRole('button', { name: /view conflict details/i }).click();
    await expect(page.getByLabel(/conflict details/i)).toBeVisible();
    await expect(page.getByLabel(/conflict details/i)).toContainText('/example.js');
    await expect(page.getByLabel(/conflict details/i)).toContainText('teacher event timestamp ms: 2000');
    await expect(page.getByLabel(/conflict details/i)).toContainText('teacher event id: event-future-change');
    await expect(page.getByLabel(/conflict details/i)).toContainText('teacher event seq: 2');
    await expect(editor).toContainText('// teacher conflict resolution final edit');
    await expect(editor).not.toContainText(learnerEdit);
  });

  test('cancel conflict resolution does nothing', async ({ page }) => {
    const learnerEdit = '// learner cancel conflict edit';
    const { editor } = await prepareLocalConflictResolutionFlow({
      page,
      recordingId: 'teacher-recording-cancel-conflict-test',
      learnerEdit,
    });
    const editorTextBeforeCancel = await editor.textContent();

    await openConflictResolutionPrompt(page);
    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(page.getByRole('region', { name: /conflict resolution/i })).toHaveCount(0);
    await expect(page.getByText(/work status:\s*restore canceled/i)).toBeVisible();
    await expect(editor).toContainText('// teacher conflict resolution final edit');
    await expect(editor).not.toContainText(learnerEdit);
    await expect.poll(async () => editor.textContent()).toBe(editorTextBeforeCancel);
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
    await openLearnerSection(page);
    const playRecording = page.getByRole('button', { name: /play lesson/i });
    const pausePlayback = page.getByRole('button', { name: /try it yourself/i });

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
    await openLearnerSection(page);

    await page.getByRole('button', { name: /play lesson/i }).click();
    await expect(page.getByText(/mode:\s*teacher-playback/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await expect
      .poll(async () => {
        const playheadText = await page.getByText(/playhead ms:\s*\d+/i).textContent();
        return Number(playheadText?.match(/playhead ms:\s*(\d+)/i)?.[1] ?? 0);
      })
      .toBeGreaterThan(0);

    await page.getByRole('button', { name: /try it yourself/i }).click();
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

  test('saves and restores learner delta after pause and edit', async ({ page }) => {
    const baseContent = "export default 'Lesson file example.js content';\n";
    const teacherReplayContent = `${baseContent}// teacher replay overwrite\n`;
    const recording = {
      id: 'teacher-recording-delta-test',
      lessonId: 'lesson-and-solution',
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      durationMs: 2000,
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
          tMs: 2000,
          type: 'file.changed',
          filePath: '/example.js',
          payload: { content: teacherReplayContent },
          origin: 'teacher',
        },
      ],
    };

    await page.evaluate((teacherRecording) => {
      localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(teacherRecording));
    }, recording);

    const rawBefore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));
    await signInAsLearner(page);
    await openLearnerSection(page);
    const saveLearnerDelta = page.getByRole('button', { name: /save my work/i });
    const restoreLearnerDelta = page.getByRole('button', { name: /restore my work/i });

    await expect(saveLearnerDelta).toBeVisible();
    await expect(saveLearnerDelta).toBeDisabled();
    await expect(restoreLearnerDelta).toBeVisible();
    await expect(restoreLearnerDelta).toBeDisabled();

    await page.getByRole('button', { name: /play lesson/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await page.getByRole('button', { name: /try it yourself/i }).click();
    await expect(page.getByText(/mode:\s*learner-editing/i)).toBeVisible();
    await expect(saveLearnerDelta).toBeEnabled();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await editor.click();
    await page.keyboard.type('\n// learner delta edit');
    await expect(editor).toContainText('// learner delta edit');
    await page.waitForTimeout(600);

    await saveLearnerDelta.click();
    await expect(page.getByText(/saved work count:\s*1/i)).toBeVisible();
    await expect(page.getByText(/work status:\s*saved/i)).toBeVisible();
    await expect(page.getByText(/conflict warning:\s*conflict/i)).toBeVisible();
    await expect(page.getByText(/conflicted files:\s*\/example\.js/i)).toBeVisible();
    await expect(restoreLearnerDelta).toBeEnabled();

    const deltas = await page.evaluate(() => {
      const raw = localStorage.getItem('interactive-poc.learnerDeltas');
      return raw ? JSON.parse(raw) : [];
    });
    const rawAfter = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(Array.isArray(deltas)).toBeTruthy();
    expect(deltas).toHaveLength(1);
    expect(deltas[0].userId).toBe(DEV_LEARNER_USER_ID);
    expect(typeof deltas[0].teacherTimestampMs).toBe('number');
    expect(deltas[0].addedOrModified['/example.js']).toContain('// learner delta edit');
    expect(Array.isArray(deltas[0].removed)).toBeTruthy();
    expect(rawAfter).toBe(rawBefore);

    await page.getByRole('button', { name: /resume teacher/i }).click();
    await expect(editor).toContainText('// teacher replay overwrite', { timeout: 5000 });
    await expect(page.getByText(/playback status:\s*finished/i)).toBeVisible();
    await expect(editor).not.toContainText('// learner delta edit');
    await expect(restoreLearnerDelta).toBeEnabled();

    await restoreLearnerDelta.click();
    await expect(page.getByRole('region', { name: /conflict resolution/i })).toBeVisible();
    await page.getByRole('button', { name: /restore my work anyway/i }).click();
    await expect(page.getByText(/work status:\s*restored with conflicts/i)).toBeVisible();
    await expect(page.getByText(/conflict warning:\s*conflict/i)).toBeVisible();
    await expect(editor).toContainText('// learner delta edit');

    const rawAfterRestore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(rawAfterRestore).toBe(rawBefore);
  });

  test('no-conflict restore remains one-click', async ({ page }) => {
    const baseContent = "export default 'Lesson file example.js content';\n";
    const futureHtmlContent = '<h1>Teacher changed unrelated HTML later</h1>\n';
    const recording = {
      id: 'teacher-recording-unrelated-conflict-test',
      lessonId: 'lesson-and-solution',
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      durationMs: 2000,
      baseFiles: {
        '/example.html': '<h1>Teacher unrelated base</h1>\n',
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
          id: 'event-future-html-change',
          seq: 2,
          tMs: 2000,
          type: 'file.changed',
          filePath: '/example.html',
          payload: { content: futureHtmlContent },
          origin: 'teacher',
        },
      ],
    };

    await page.evaluate((teacherRecording) => {
      localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(teacherRecording));
    }, recording);

    const rawBefore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));
    await signInAsLearner(page);
    await openLearnerSection(page);
    const saveLearnerDelta = page.getByRole('button', { name: /save my work/i });
    const restoreLearnerDelta = page.getByRole('button', { name: /restore my work/i });

    await page.getByRole('button', { name: /play lesson/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await page.getByRole('button', { name: /try it yourself/i }).click();
    await expect(page.getByText(/mode:\s*learner-editing/i)).toBeVisible();
    await expect(saveLearnerDelta).toBeEnabled();

    const editor = page.locator('#editor-opened').getByRole('textbox').first();

    await editor.click();
    await page.keyboard.type('\n// learner unrelated edit');
    await expect(editor).toContainText('// learner unrelated edit');
    await page.waitForTimeout(600);

    await saveLearnerDelta.click();
    await expect(page.getByText(/saved work count:\s*1/i)).toBeVisible();
    await expect(page.getByText(/work status:\s*saved/i)).toBeVisible();
    await expect(page.getByText(/conflict warning:\s*none/i)).toBeVisible();
    await expect(page.getByText(/conflicted files:\s*none/i)).toBeVisible();
    await expect(restoreLearnerDelta).toBeEnabled();

    const deltas = await page.evaluate(() => {
      const raw = localStorage.getItem('interactive-poc.learnerDeltas');
      return raw ? JSON.parse(raw) : [];
    });
    const rawAfter = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(Array.isArray(deltas)).toBeTruthy();
    expect(deltas).toHaveLength(1);
    expect(deltas[0].userId).toBe(DEV_LEARNER_USER_ID);
    expect(deltas[0].addedOrModified['/example.js']).toContain('// learner unrelated edit');
    expect(rawAfter).toBe(rawBefore);

    await page.getByRole('button', { name: /resume teacher/i }).click();
    await expect(page.getByText(/playback status:\s*finished/i)).toBeVisible({ timeout: 5000 });

    await restoreLearnerDelta.click();
    await expect(page.getByRole('region', { name: /conflict resolution/i })).toHaveCount(0);
    await expect(page.getByText(/work status:\s*restored/i)).toBeVisible();
    await expect(page.getByText(/conflict warning:\s*none/i)).toBeVisible();
    await expect(editor).toContainText('// learner unrelated edit');

    const rawAfterRestore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(rawAfterRestore).toBe(rawBefore);
  });
});
