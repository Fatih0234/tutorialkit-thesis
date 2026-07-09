import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const FALLBACK_POC_URL = 'http://localhost:4321';
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

async function seedPublishedRecording(request: APIRequestContext, recording: ReturnType<typeof createPublishedRecording>) {
  const response = await request.post('/api/interactive/teacher-recordings', { data: recording });

  expect(response.ok()).toBeTruthy();
}

async function openLearnerSection(page: Page) {
  await page.getByRole('button', { name: 'Learner', exact: true }).click();
  await expect(page.getByRole('heading', { name: /learner playback/i })).toBeVisible();
}

async function openTeacherSection(page: Page) {
  await page.getByRole('button', { name: 'Teacher', exact: true }).click();
  await expect(page.getByRole('heading', { name: /teacher dashboard/i })).toBeVisible();
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

  test('product labels replace debug-only learner flow', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /teacher dashboard/i })).toBeVisible();
    await openLearnerSection(page);

    await expect(page.getByRole('button', { name: /try it yourself/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /save my work/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /restore my work/i })).toBeVisible();
    await expect(page.getByText(/work status:/i)).toBeVisible();
    await expect(page.getByText(/conflict warning:/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /pause & try it/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /save learner delta/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /restore learner delta/i })).toHaveCount(0);
  });

  test('records one editor edit into a saved teacher draft localStorage mirror', async ({ page }) => {
    const startRecording = page.getByRole('button', { name: /record timeline only/i });
    const stopRecording = page.getByRole('button', { name: /stop recording/i });
    const saveDraft = page.getByRole('button', { name: /save draft/i });

    await expect(startRecording).toBeVisible();
    await expect(stopRecording).toBeVisible();
    await expect(saveDraft).toBeVisible();

    await startRecording.click();
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

  test('teacher dashboard lists a published recording', async ({ page, request }) => {
    const finalContent = 'console.log("remote learner base");\n// teacher dashboard listed published edit\n';
    const recording = createPublishedRecording('teacher-recording-dashboard-list-test', finalContent, 25);

    await seedPublishedRecording(request, recording);
    await openTeacherSection(page);
    await page.getByRole('button', { name: /refresh recordings/i }).click();
    await expect(page.getByRole('heading', { name: /published recordings/i })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: recording.id })).toBeVisible();

    await page.getByRole('button', { name: /load selected published/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeVisible();
    await page.getByRole('button', { name: /preview selected published/i }).click();
    await expect(page.locator('#editor-opened').getByRole('textbox').first()).toContainText(
      '// teacher dashboard listed published edit',
      { timeout: 5000 },
    );
  });

  test('teacher can publish and reload recording from backend', async ({ page }) => {
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

    await page.getByRole('button', { name: /load published recording/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(new RegExp(`published recording id:\\s*${publishedId}`, 'i'))).toBeVisible();
    await page.getByRole('button', { name: /preview published recording/i }).click();
    await expect(page.getByRole('button', { name: 'example.js', pressed: true })).toBeVisible();
    await expect(page.locator('#editor-opened').getByRole('textbox').first()).toContainText(
      '// teacher backend publish edit',
      { timeout: 5000 },
    );
    await expect(page.getByText(/playback status:\s*finished/i)).toBeVisible({ timeout: 5000 });
  });

  test('teacher can publish media recording and load media from backend', async ({ page }) => {
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

    await page.evaluate(() => {
      localStorage.removeItem('interactive-poc.teacherRecording');
      localStorage.removeItem('interactive-poc.learnerDeltas');
      localStorage.removeItem('interactive-poc.fakeMediaRecorder');
    });
    await page.reload();

    await page.getByRole('button', { name: /load published recording/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(/media status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(/media kind:\s*audio/i)).toBeVisible();
    await expect(page.getByLabel(/recorded audio preview/i)).toBeVisible();

    await page.getByRole('button', { name: /preview published recording/i }).click();
    await expect(page.locator('#editor-opened').getByRole('textbox').first()).toContainText(
      '// teacher backend media publish edit',
      { timeout: 5000 },
    );
    await expect(page.getByText(/playback status:\s*finished/i)).toBeVisible({ timeout: 5000 });
  });

  test('learner can open a published recording and save work remotely', async ({ page, request }) => {
    const finalContent = 'console.log("remote learner base");\n// remote teacher final edit\n';
    const recording = createPublishedRecording('teacher-recording-remote-delta-test', finalContent);

    await seedPublishedRecording(request, recording);
    await openLearnerSection(page);
    await page.getByRole('button', { name: /open recording/i }).click();
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
    await page.getByRole('button', { name: /open recording/i }).click();
    await expect(page.getByText(/published status:\s*loaded/i)).toBeVisible();
    await expect(page.getByText(/saved work count:\s*1/i)).toBeVisible();

    await page.getByRole('button', { name: /restore my work/i }).click();
    await expect(page.getByText(/work status:\s*restored/i)).toBeVisible();
    await expect(page.locator('#editor-opened').getByRole('textbox').first()).toContainText('// remote learner delta edit');
  });

  test('published teacher recording remains immutable after remote learner delta save', async ({ page, request }) => {
    const finalContent = 'console.log("remote learner base");\n// immutable teacher final edit\n';
    const recording = createPublishedRecording('teacher-recording-remote-immutable-test', finalContent);

    await seedPublishedRecording(request, recording);

    const rawBefore = readFileSync(getPublishedRecordingFile(recording.id), 'utf8');

    await openLearnerSection(page);
    await page.getByRole('button', { name: /open recording/i }).click();
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
    await expect(page.getByText(/work status:\s*restored/i)).toBeVisible();
    await expect(page.getByText(/conflict warning:\s*conflict/i)).toBeVisible();
    await expect(editor).toContainText('// learner delta edit');

    const rawAfterRestore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(rawAfterRestore).toBe(rawBefore);
  });

  test('does not flag unrelated future teacher changes as learner delta conflicts', async ({ page }) => {
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
    expect(deltas[0].addedOrModified['/example.js']).toContain('// learner unrelated edit');
    expect(rawAfter).toBe(rawBefore);

    await page.getByRole('button', { name: /resume teacher/i }).click();
    await expect(page.getByText(/playback status:\s*finished/i)).toBeVisible({ timeout: 5000 });

    await restoreLearnerDelta.click();
    await expect(page.getByText(/work status:\s*restored/i)).toBeVisible();
    await expect(page.getByText(/conflict warning:\s*none/i)).toBeVisible();
    await expect(editor).toContainText('// learner unrelated edit');

    const rawAfterRestore = await page.evaluate(() => localStorage.getItem('interactive-poc.teacherRecording'));

    expect(rawAfterRestore).toBe(rawBefore);
  });
});
