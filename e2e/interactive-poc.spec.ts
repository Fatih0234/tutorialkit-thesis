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
  await clickRoleTabUntilVisible(page, 'Learner Lesson', /interactive lessons/i);
}

async function openTeacherSection(page: Page) {
  await clickRoleTabUntilVisible(page, 'Teacher Studio', /teacher studio/i);
}

async function enterLoadedLearnerPlayer(page: Page) {
  const continueButton = page.getByRole('button', { name: /continue loaded lesson/i });
  await expect(continueButton).toBeVisible();
  await continueButton.click();
  await expect(page.getByLabel(/interactive lesson controls/i)).toBeVisible();
}

async function startTeacherRecording(page: Page, mode: 'timeline' | 'audio' | 'camera' = 'timeline') {
  const backToSetup = page.getByRole('button', { name: /back to lecture setup|dashboard/i });

  if (await backToSetup.isVisible().catch(() => false)) {
    await backToSetup.click();
  }

  const modeName =
    mode === 'audio' ? /editor \+ microphone/i : mode === 'camera' ? /editor \+ camera/i : /editor timeline only/i;

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

  await signInAsLearner(page);
  await openLearnerSection(page);
  await enterLoadedLearnerPlayer(page);
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
    });
    await expect(page.locator('[data-interactive-hydrated="true"]')).toBeAttached();
  });

  test('primary UI uses thesis-demo product wording', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /interactive thesis demo/i })).toBeVisible();
    await expandDetails(page, 'Thesis demo walkthrough');
    await expect(page.getByText(/seed a lesson or create a recording/i)).toBeVisible();
    await expect(page.getByText(/save a timeline experiment, resume the lecture, and reopen its marker/i)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /teacher studio/i })).toBeVisible();
    await expect(page.getByLabel(/choose demo identity/i)).toBeVisible();
    await expect(page.getByRole('option', { name: /sign in as teacher demo/i })).toBeAttached();
    await expect(page.getByRole('option', { name: /sign in as learner demo/i })).toBeAttached();
    await expect(page.getByRole('option', { name: /sign in as learner two/i })).toBeAttached();
    await openLearnerSection(page);

    await expect(page.getByRole('heading', { name: /interactive lessons/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /start lesson/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /save experiment/i })).toHaveCount(0);
    await expect(page.getByLabel(/lesson timeline/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /pause & try it/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /save learner delta/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /restore learner delta/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /teacher dashboard/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /learner playback/i })).toHaveCount(0);
    await expect(page.getByText(/raw debug controls/i)).toHaveCount(0);
    await expect(page.getByText(/compatibility localStorage keys/i)).toBeHidden();
    await expect(page.locator('#interactive-experience-root > [data-interactive-experience-root]')).toBeVisible();
    await expect(page.locator('[data-tutorialkit-standard-layout]')).toHaveAttribute('inert', '');
    await expect(page.locator('[data-tutorialkit-standard-layout]')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('[data-interactive-management-shell]')).toBeVisible();
    await expect(page.locator('[data-interactive-workspace-shell]')).toBeHidden();
    await expect(page.getByRole('tab', { name: /output|terminal/i })).toHaveCount(0);
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

    const savedLayout = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.workspaceLayout') || 'null'));
    expect(savedLayout).toMatchObject({ explanationOpen: false, terminalOpen: false });
    expect(savedLayout.explanationSize).toBeGreaterThanOrEqual(18);
    expect(savedLayout.terminalSize).toBeGreaterThanOrEqual(18);
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

  test('teacher presentation cues record and seek deterministic slide layouts', async ({ page }) => {
    await startTeacherRecording(page);

    const slide = page.locator('[data-presentation-resource="slide-javascript-runtime"]');
    await expect(slide).toHaveAttribute('data-presentation-mode', 'minimized');
    const website = page.frameLocator('[data-presentation-preview-host] iframe').first();
    await website.getByRole('button', { name: /click the live preview/i }).click({ timeout: 20000 });
    await expect(website.getByText(/clicked 1 time/i)).toBeVisible();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /focus javascript runs in the browser/i }).click();
    await expect(slide).toHaveAttribute('data-presentation-mode', 'focused');
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: /minimize javascript runs in the browser/i }).click();
    await expect(slide).toHaveAttribute('data-presentation-mode', 'minimized');

    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();

    const recording = await page.evaluate(() => JSON.parse(localStorage.getItem('interactive-poc.teacherRecording') || 'null'));
    const presentationEvents = recording.events.filter((event: any) => event.type === 'presentation.changed');

    expect(recording.presentationResources.some((resource: any) => resource.id === 'slide-javascript-runtime')).toBeTruthy();
    expect(recording.initialPresentationLayout.resources['slide-javascript-runtime']).toBe('minimized');
    expect(presentationEvents).toHaveLength(2);
    expect(recording.events.some((event: any) => event.type === 'file.changed')).toBeFalsy();
    expect(presentationEvents[0].payload.layout.resources['slide-javascript-runtime']).toBe('focused');
    expect(presentationEvents[1].payload.layout.resources['slide-javascript-runtime']).toBe('minimized');

    await page.getByLabel(/lesson timeline/i).fill(String(presentationEvents[0].tMs));
    await expect(slide).toHaveAttribute('data-presentation-mode', 'focused');
    await page.getByLabel(/lesson timeline/i).fill(String(presentationEvents[1].tMs));
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
        id: 'slide-javascript-runtime',
        kind: 'slide',
        title: 'JavaScript runs in the browser',
        eyebrow: 'Demo slide 1',
        body: 'A deterministic learner presentation test.',
      },
    ];
    recording.initialPresentationLayout = {
      resources: { 'website-preview': 'minimized', 'lesson-explanation': 'hidden', 'slide-javascript-runtime': 'minimized' },
    };
    recording.events.splice(2, 0,
      {
        id: 'event-presentation-focus',
        seq: 2,
        tMs: 500,
        type: 'presentation.changed',
        payload: {
          layout: {
            resources: { 'website-preview': 'minimized', 'lesson-explanation': 'hidden', 'slide-javascript-runtime': 'focused' },
            focusedResourceId: 'slide-javascript-runtime',
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
            resources: { 'website-preview': 'minimized', 'lesson-explanation': 'hidden', 'slide-javascript-runtime': 'minimized' },
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

    const slide = page.locator('[data-presentation-resource="slide-javascript-runtime"]');
    await expect(slide).toHaveAttribute('data-presentation-mode', 'focused', { timeout: 1800 });
    await page.getByRole('button', { name: /hide javascript runs in the browser/i }).click();
    await expect(slide).toHaveCount(0);
    await expect(page.getByRole('button', { name: /follow teacher/i })).toBeVisible();
    await page.waitForTimeout(400);
    await expect(slide).toHaveCount(0);

    await page.getByRole('button', { name: /follow teacher/i }).click();
    await expect(slide).toHaveAttribute('data-presentation-mode', 'focused');
    await page.getByRole('button', { name: /minimize javascript runs in the browser/i }).click();
    await page.getByRole('button', { name: /focus javascript runs in the browser/i }).click();
    await expect(page.getByRole('button', { name: /follow teacher/i })).toBeVisible();

    await expect(slide).toHaveAttribute('data-presentation-mode', 'minimized', { timeout: 7000 });
    await expect(page.getByRole('button', { name: /follow teacher/i })).toHaveCount(0);
    expect(readFileSync(getPublishedRecordingFile(recording.id), 'utf8')).toBe(rawBefore);
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

    await startTeacherRecording(page);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await expect(page.getByText(/draft status:\s*unsaved/i)).toBeAttached();
    await page.getByRole('button', { name: /^dashboard$/i }).click();
    await openRecordingLibrary(page);
    await page.getByRole('button', { name: /^discard draft$/i }).click();
    await expect(page.getByRole('button', { name: /^confirm discard draft$/i })).toBeVisible();
    await expect(page.getByText(/are you sure\? this clears the current draft/i)).toBeVisible();
    await expect(page.getByText(/draft status:\s*unsaved/i)).toBeAttached();
    await page.getByRole('button', { name: /^confirm discard draft$/i }).click();
    await expect(page.getByText(/draft status:\s*discarded/i)).toBeAttached();

    await startTeacherRecording(page);
    await page.getByRole('button', { name: /stop recording/i }).click();
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();
    await page.getByRole('button', { name: /^dashboard$/i }).click();
    await openRecordingLibrary(page);
    await page.getByRole('button', { name: /^delete draft$/i }).click();
    await expect(page.getByRole('button', { name: /^confirm delete draft$/i }).first()).toBeVisible();
    await expect(page.getByText(/are you sure\? this deletes the selected local draft/i).first()).toBeVisible();
    await expect(page.getByText(/draft status:\s*saved/i)).toBeAttached();
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
    await page.getByRole('button', { name: /^dashboard$/i }).click();

    await signInAsTeacher(page);
    await expect(page.getByRole('button', { name: /publish recording/i })).toBeEnabled();
    await page.getByRole('button', { name: /publish recording/i }).click();
    await expect(page.getByText(/published status:\s*published/i)).toBeAttached();
    await expect(page.getByText(/publish identity:\s*teacher allowed/i)).toBeVisible();

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
    await expect(saveDraft).toBeVisible();

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
    await expect(editor).toContainText('// progressive first step', { timeout: 1000 });
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

    await expect(page.getByRole('heading', { name: /local drafts/i })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: savedRecording.id })).toBeVisible();

    const loadDraft = page.getByRole('button', { name: /load draft/i });

    await expect(loadDraft).toBeVisible();
    await expect(loadDraft).toBeEnabled();
    await loadDraft.click();
    await expect(page.getByText(/draft status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(/current draft id:\s*teacher-recording-/i)).toBeAttached();

    const previewDraft = page.getByRole('button', { name: /preview draft/i });

    await expect(previewDraft).toBeEnabled();
    await previewDraft.click();
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
    await page.getByRole('button', { name: /load draft/i }).click();
    await expect(page.getByText(/draft status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(/media kind:\s*audio/i)).toBeAttached();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /preview draft/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();

    const reloadedEditor = page.getByRole('textbox', { name: 'Editor' }).first();

    await expect(reloadedEditor).toContainText('// teacher fake audio draft edit', { timeout: 5000 });
    await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached({ timeout: 5000 });
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
    await expect(page.getByText(/draft status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeAttached();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /preview draft/i }).click();
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
    await openTeacherSection(page);
    await openRecordingLibrary(page);
    await page.getByRole('button', { name: /refresh recordings/i }).click();
    await expect(page.getByRole('heading', { name: /published lessons/i })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: recording.id })).toBeVisible();

    await page.getByRole('button', { name: /load selected published lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeAttached();
    await page.getByRole('button', { name: /preview selected published lesson/i }).click();
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText(
      '// teacher studio listed published edit',
      { timeout: 5000 },
    );
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
    await expect(page.getByLabel(/select published lesson/i)).toHaveValue(publishedId!);

    await page.getByRole('button', { name: /load published lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(new RegExp(`published recording id:\\s*${publishedId}`, 'i'))).toBeVisible();
    await page.getByRole('button', { name: /preview published lesson/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText(
      '// teacher backend publish edit',
      { timeout: 5000 },
    );
    await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached({ timeout: 5000 });
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
    await expect(page.getByLabel(/select published lesson/i)).toHaveValue(publishedId!);

    await page.getByRole('button', { name: /load published lesson/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(/media kind:\s*audio/i)).toBeAttached();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /preview published lesson/i }).click();
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText(
      '// teacher backend media publish edit',
      { timeout: 5000 },
    );
    await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached({ timeout: 5000 });
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
    expect(exportedPackage.teacherRecording.events).toHaveLength(8);
    expect(exportedPackage.teacherRecording.presentationResources).toHaveLength(4);
    expect(exportedPackage.teacherRecording.events.filter((event: any) => event.type === 'presentation.changed')).toHaveLength(5);
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
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText('// teacher demo final edit', {
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
    await page.getByRole('button', { name: /start lesson/i }).click();
    await expect(page.getByText(new RegExp(`published recording id:\\s*${importedId}`, 'i'))).toBeAttached();
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText('// teacher demo final edit', {
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
    await expect(page.getByText(/media status:\s*loaded/i)).toBeAttached();
    await expect(page.getByText(/media kind:\s*audio/i)).toBeAttached();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /^preview draft$/i }).click();
    await expect(page.getByText(/playback status:\s*playing/i)).toBeAttached();
    await waitForPlayheadToAdvance(page);
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText('// teacher demo final edit', {
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
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText('// teacher demo final edit', {
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
    await expect(page.getByText(/demo data status:\s*reset/i)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /teacher studio/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^start recording$/i })).toBeVisible();

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

  test('learner work is scoped by signed-in user', async ({ page, request }) => {
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

  test('published teacher recording remains immutable after remote learner delta save', async ({ page, request }) => {
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

  test('later teacher edits do not conflict with a timestamped learner experiment', async ({ page, request }) => {
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

  test('multiple saves at one lecture timestamp remain one marker with versions', async ({ page }) => {
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

  test('resume lecture protects unsaved experiment changes', async ({ page }) => {
    const recording = createConflictResolutionRecording({ recordingId: 'teacher-recording-unsaved-warning-test' });

    await page.evaluate((teacherRecording) => {
      localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(teacherRecording));
    }, recording);
    await signInAsLearner(page);
    await openLearnerSection(page);
    await enterLoadedLearnerPlayer(page);
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

  test('save and resume creates a marker before restoring lecture truth', async ({ page }) => {
    const recording = createConflictResolutionRecording({ recordingId: 'teacher-recording-save-resume-test' });

    await page.evaluate((teacherRecording) => {
      localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(teacherRecording));
    }, recording);
    await signInAsLearner(page);
    await openLearnerSection(page);
    await enterLoadedLearnerPlayer(page);
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

  test('opening a checkpoint preserves the immutable teacher recording', async ({ page }) => {
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
    await enterLoadedLearnerPlayer(page);
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
    await openLearnerSection(page);
    await enterLoadedLearnerPlayer(page);
    await page.getByRole('button', { name: /^play$/i }).click();

    await expect(page.getByRole('button', { name: 'created-during-lecture.js', pressed: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText('// created during lecture');
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
    await enterLoadedLearnerPlayer(page);

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
    expect(learnerDeltasDuringLearnerEdit).toBeNull();

    await page.getByRole('button', { name: /return to lecture/i }).click();
    await page.getByRole('button', { name: /resume without saving/i }).click();
    await expect(page.getByText(/teacher lecture/i)).toBeVisible();
    await expect(page.getByText(/playback status:\s*playing/i)).toBeAttached();
    await expect(editor).toContainText('// teacher resumed final edit', { timeout: 5000 });
    await expect(page.getByText(/playback status:\s*finished/i)).toBeAttached();

    const rawAfter = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));
    const learnerDeltasAfterResume = await page.evaluate(() => localStorage.getItem('interactive-poc.learnerDeltas'));

    expect(rawAfter).toBe(rawBefore);
    expect(learnerDeltasAfterResume).toBeNull();
  });

  test('saves a learner experiment marker and reopens its exact historical branch', async ({ page }) => {
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
    await signInAsLearner(page);
    await openLearnerSection(page);
    await enterLoadedLearnerPlayer(page);
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

    await signInAsLearner(page);
    await page.evaluate(
      ({ teacherRecording, learnerDelta }) => {
        localStorage.setItem('interactive-poc.teacherRecording', JSON.stringify(teacherRecording));
        localStorage.setItem('interactive-poc.learnerDeltas', JSON.stringify([learnerDelta]));
      },
      { teacherRecording: recording, learnerDelta: delta },
    );
    await page.reload();
    await openLearnerSection(page);
    await enterLoadedLearnerPlayer(page);
    await expect(page.getByRole('button', { name: /open my experiment at/i })).toBeVisible();
    await page.getByRole('button', { name: /open my experiment at/i }).click();

    await expect(page.getByRole('button', { name: 'learner-experiment.js', pressed: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'example.html' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Editor' }).first()).toContainText('// learner-created checkpoint file');
  });

});
