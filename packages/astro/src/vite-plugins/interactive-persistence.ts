import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import type { VitePlugin } from '../types.js';

const API_PREFIX = '/api/interactive';
const JSON_LIMIT_BYTES = 5 * 1024 * 1024;
const MEDIA_LIMIT_BYTES = 25 * 1024 * 1024;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;
const ALLOWED_MEDIA_MIME_TYPES = new Map([
  ['audio/webm', '.webm'],
  ['video/webm', '.webm'],
  ['audio/ogg', '.ogg'],
  ['audio/wav', '.wav'],
  ['audio/x-wav', '.wav'],
]);

type FilesSnapshot = Record<string, string>;

interface TimelineEvent {
  id: string;
  seq: number;
  tMs: number;
  type: string;
  filePath?: string;
  payload?: unknown;
  origin: string;
}

interface RecordingMediaAssetMetadata {
  id: string;
  recordingId: string;
  kind: 'audio' | 'webcam';
  mimeType: string;
  durationMs: number;
  createdAt: string;
}

interface StoredMediaAssetMetadata extends RecordingMediaAssetMetadata {
  storedFileName: string;
  sizeBytes: number;
}

interface TeacherRecording {
  id: string;
  lessonId: string;
  version: number;
  startedAt: string;
  durationMs: number;
  baseFiles: FilesSnapshot;
  events: TimelineEvent[];
  mediaAssets?: RecordingMediaAssetMetadata[];
}

interface LearnerDelta {
  id: string;
  userId: string;
  lessonId: string;
  teacherRecordingId: string;
  teacherRecordingVersion: number;
  teacherTimestampMs: number;
  baseTeacherFilesHash: string;
  addedOrModified: FilesSnapshot;
  removed: string[];
  selectedFile?: string;
  createdAt: string;
}

interface MultipartFile {
  filename: string;
  contentType: string;
  buffer: Buffer;
}

interface MultipartBody {
  fields: Map<string, string>;
  files: Map<string, MultipartFile>;
}

function findRepositoryRoot(startDirectory = process.cwd()): string {
  let currentDirectory = startDirectory;

  while (true) {
    try {
      const workspaceFile = path.join(currentDirectory, 'pnpm-workspace.yaml');
      const packageFile = path.join(currentDirectory, 'package.json');

      if (fileExistsSync(workspaceFile) && fileExistsSync(packageFile)) {
        return currentDirectory;
      }
    } catch {
      // Continue walking upward.
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return startDirectory;
    }

    currentDirectory = parentDirectory;
  }
}

function fileExistsSync(filePath: string): boolean {
  return existsSync(filePath);
}

function getDataRoot(): string {
  return process.env.TUTORIALKIT_INTERACTIVE_DATA_DIR ?? path.join(findRepositoryRoot(), '.interactive-data');
}

function getDataPaths() {
  const root = getDataRoot();

  return {
    root,
    teacherRecordings: path.join(root, 'teacher-recordings'),
    learnerDeltas: path.join(root, 'learner-deltas'),
    mediaAssets: path.join(root, 'media-assets'),
  };
}

function normalizePath(filePath: string): string {
  if (!filePath) {
    return '/';
  }

  const normalized = filePath.replaceAll('\\', '/');

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function normalizeFiles(files: unknown): FilesSnapshot {
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw new Error('Expected files object.');
  }

  const normalized: FilesSnapshot = {};

  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content !== 'string') {
      throw new Error(`Expected string content for ${filePath}.`);
    }

    normalized[normalizePath(filePath)] = content;
  }

  return normalized;
}

function normalizeTimelineEvent(event: unknown): TimelineEvent {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('Expected event object.');
  }

  const candidate = event as Partial<TimelineEvent>;

  if (!candidate.id || typeof candidate.id !== 'string') {
    throw new Error('Event id is required.');
  }

  if (typeof candidate.seq !== 'number') {
    throw new Error('Event seq must be a number.');
  }

  if (typeof candidate.tMs !== 'number') {
    throw new Error('Event tMs must be a number.');
  }

  if (!candidate.type || typeof candidate.type !== 'string') {
    throw new Error('Event type is required.');
  }

  if (!candidate.origin || typeof candidate.origin !== 'string') {
    throw new Error('Event origin is required.');
  }

  return {
    ...candidate,
    id: candidate.id,
    seq: candidate.seq,
    tMs: candidate.tMs,
    type: candidate.type,
    filePath: candidate.filePath ? normalizePath(candidate.filePath) : undefined,
    origin: candidate.origin,
  };
}

function normalizeMediaMetadata(value: unknown, fallbackRecordingId?: string): RecordingMediaAssetMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected media asset metadata object.');
  }

  const candidate = value as Partial<RecordingMediaAssetMetadata>;
  const recordingId = candidate.recordingId ?? fallbackRecordingId;

  if (!candidate.id || typeof candidate.id !== 'string') {
    throw new Error('Media asset id is required.');
  }

  if (!recordingId || typeof recordingId !== 'string') {
    throw new Error('Media asset recordingId is required.');
  }

  if (candidate.kind !== 'audio' && candidate.kind !== 'webcam') {
    throw new Error('Media asset kind must be audio or webcam.');
  }

  if (!candidate.mimeType || typeof candidate.mimeType !== 'string') {
    throw new Error('Media asset mimeType is required.');
  }

  if (typeof candidate.durationMs !== 'number' || candidate.durationMs < 0) {
    throw new Error('Media asset durationMs must be non-negative.');
  }

  if (!candidate.createdAt || typeof candidate.createdAt !== 'string') {
    throw new Error('Media asset createdAt is required.');
  }

  return {
    id: assertSafeId(candidate.id, 'media asset id'),
    recordingId: assertSafeId(recordingId, 'recording id'),
    kind: candidate.kind,
    mimeType: candidate.mimeType,
    durationMs: candidate.durationMs,
    createdAt: candidate.createdAt,
  };
}

function normalizeTeacherRecording(value: unknown): TeacherRecording {
  const input = value && typeof value === 'object' && 'teacherRecording' in value ? (value as any).teacherRecording : value;

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected teacher recording object.');
  }

  const candidate = input as Partial<TeacherRecording>;

  if (!candidate.id || typeof candidate.id !== 'string') {
    throw new Error('Teacher recording id is required.');
  }

  if (!candidate.lessonId || typeof candidate.lessonId !== 'string') {
    throw new Error('Teacher recording lessonId is required.');
  }

  if (typeof candidate.version !== 'number') {
    throw new Error('Teacher recording version is required.');
  }

  if (!candidate.startedAt || typeof candidate.startedAt !== 'string') {
    throw new Error('Teacher recording startedAt is required.');
  }

  if (typeof candidate.durationMs !== 'number' || candidate.durationMs < 0) {
    throw new Error('Teacher recording durationMs must be non-negative.');
  }

  if (!Array.isArray(candidate.events)) {
    throw new Error('Teacher recording events must be an array.');
  }

  const recordingId = assertSafeId(candidate.id, 'teacher recording id');

  return {
    ...candidate,
    id: recordingId,
    lessonId: candidate.lessonId,
    version: candidate.version,
    startedAt: candidate.startedAt,
    durationMs: candidate.durationMs,
    baseFiles: normalizeFiles(candidate.baseFiles),
    events: candidate.events.map(normalizeTimelineEvent).sort((a, b) => (a.tMs === b.tMs ? a.seq - b.seq : a.tMs - b.tMs)),
    mediaAssets: candidate.mediaAssets?.map((asset) => normalizeMediaMetadata(asset, recordingId)),
  };
}

function normalizeLearnerDelta(value: unknown): LearnerDelta {
  const input = value && typeof value === 'object' && 'learnerDelta' in value ? (value as any).learnerDelta : value;

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected learner delta object.');
  }

  const candidate = input as Partial<LearnerDelta>;

  if (!candidate.id || typeof candidate.id !== 'string') {
    throw new Error('Learner delta id is required.');
  }

  if (!candidate.userId || typeof candidate.userId !== 'string') {
    throw new Error('Learner delta userId is required.');
  }

  if (!candidate.lessonId || typeof candidate.lessonId !== 'string') {
    throw new Error('Learner delta lessonId is required.');
  }

  if (!candidate.teacherRecordingId || typeof candidate.teacherRecordingId !== 'string') {
    throw new Error('Learner delta teacherRecordingId is required.');
  }

  if (typeof candidate.teacherRecordingVersion !== 'number') {
    throw new Error('Learner delta teacherRecordingVersion is required.');
  }

  if (typeof candidate.teacherTimestampMs !== 'number' || candidate.teacherTimestampMs < 0) {
    throw new Error('Learner delta teacherTimestampMs must be non-negative.');
  }

  if (!candidate.baseTeacherFilesHash || typeof candidate.baseTeacherFilesHash !== 'string') {
    throw new Error('Learner delta baseTeacherFilesHash is required.');
  }

  if (!Array.isArray(candidate.removed)) {
    throw new Error('Learner delta removed must be an array.');
  }

  return {
    id: assertSafeId(candidate.id, 'learner delta id'),
    userId: candidate.userId,
    lessonId: candidate.lessonId,
    teacherRecordingId: assertSafeId(candidate.teacherRecordingId, 'teacher recording id'),
    teacherRecordingVersion: candidate.teacherRecordingVersion,
    teacherTimestampMs: candidate.teacherTimestampMs,
    baseTeacherFilesHash: candidate.baseTeacherFilesHash,
    addedOrModified: normalizeFiles(candidate.addedOrModified ?? {}),
    removed: candidate.removed.map((filePath) => normalizePath(String(filePath))),
    selectedFile: candidate.selectedFile ? normalizePath(candidate.selectedFile) : undefined,
    createdAt: candidate.createdAt && typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
  };
}

function assertSafeId(id: string, label: string): string {
  if (!SAFE_ID_PATTERN.test(id)) {
    throw new Error(`Unsafe ${label}.`);
  }

  return id;
}

function createSafeId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function stripMediaStorageFields(metadata: StoredMediaAssetMetadata): RecordingMediaAssetMetadata {
  return {
    id: metadata.id,
    recordingId: metadata.recordingId,
    kind: metadata.kind,
    mimeType: metadata.mimeType,
    durationMs: metadata.durationMs,
    createdAt: metadata.createdAt,
  };
}

function getJsonFilePath(directory: string, id: string): string {
  return path.join(directory, `${assertSafeId(id, 'id')}.json`);
}

async function ensureDataDirectories() {
  const dataPaths = getDataPaths();

  await Promise.all([
    mkdir(dataPaths.teacherRecordings, { recursive: true }),
    mkdir(dataPaths.learnerDeltas, { recursive: true }),
    mkdir(dataPaths.mediaAssets, { recursive: true }),
  ]);

  return dataPaths;
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

async function readAllJsonFiles<T>(directory: string): Promise<T[]> {
  try {
    const names = await readdir(directory);
    const records = await Promise.all(
      names.filter((name) => name.endsWith('.json')).map((name) => readJsonFile<T>(path.join(directory, name))),
    );

    return records.reduce<T[]>((allRecords, record) => {
      if (record) {
        allRecords.push(record as T);
      }

      return allRecords;
    }, []);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readRequestBody(req: IncomingMessage, limitBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    totalBytes += buffer.length;

    if (totalBytes > limitBytes) {
      throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

async function readJsonRequest(req: IncomingMessage): Promise<unknown> {
  const body = await readRequestBody(req, JSON_LIMIT_BYTES);

  if (body.length === 0) {
    return undefined;
  }

  return JSON.parse(body.toString('utf8')) as unknown;
}

function parseMultipartBody(buffer: Buffer, contentType: string): MultipartBody {
  const boundaryMatch = contentType.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];

  if (!boundary) {
    throw new Error('Multipart boundary is required.');
  }

  const fields = new Map<string, string>();
  const files = new Map<string, MultipartFile>();
  const raw = buffer.toString('latin1');
  const segments = raw.split(`--${boundary}`);

  for (let segment of segments) {
    if (!segment || segment === '--\r\n' || segment === '--') {
      continue;
    }

    if (segment.startsWith('\r\n')) {
      segment = segment.slice(2);
    }

    if (segment.endsWith('--\r\n')) {
      segment = segment.slice(0, -4);
    } else if (segment.endsWith('\r\n')) {
      segment = segment.slice(0, -2);
    }

    const separatorIndex = segment.indexOf('\r\n\r\n');

    if (separatorIndex === -1) {
      continue;
    }

    const rawHeaders = segment.slice(0, separatorIndex);
    const rawBody = segment.slice(separatorIndex + 4);
    const headers = new Map<string, string>();

    for (const headerLine of rawHeaders.split('\r\n')) {
      const colonIndex = headerLine.indexOf(':');

      if (colonIndex === -1) {
        continue;
      }

      headers.set(headerLine.slice(0, colonIndex).toLowerCase(), headerLine.slice(colonIndex + 1).trim());
    }

    const disposition = headers.get('content-disposition') ?? '';
    const name = disposition.match(/name="([^"]+)"/)?.[1];

    if (!name) {
      continue;
    }

    const filename = disposition.match(/filename="([^"]*)"/)?.[1];

    if (filename !== undefined) {
      files.set(name, {
        filename,
        contentType: headers.get('content-type') ?? 'application/octet-stream',
        buffer: Buffer.from(rawBody, 'latin1'),
      });
    } else {
      fields.set(name, Buffer.from(rawBody, 'latin1').toString('utf8'));
    }
  }

  return { fields, files };
}

function getAllowedMediaExtension(mimeType: string): string {
  const normalizedMimeType = mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const extension = ALLOWED_MEDIA_MIME_TYPES.get(normalizedMimeType);

  if (!extension) {
    throw new Error(`Unsupported media MIME type: ${mimeType}.`);
  }

  return extension;
}

function hasExpectedMediaSignature(buffer: Buffer, mimeType: string): boolean {
  const normalizedMimeType = mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';

  if (normalizedMimeType === 'audio/webm' || normalizedMimeType === 'video/webm') {
    return buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  }

  if (normalizedMimeType === 'audio/wav' || normalizedMimeType === 'audio/x-wav') {
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE';
  }

  if (normalizedMimeType === 'audio/ogg') {
    return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS';
  }

  return false;
}

async function handleTeacherRecordings(req: IncomingMessage, res: ServerResponse, url: URL, routeParts: string[]) {
  const dataPaths = await ensureDataDirectories();

  if (req.method === 'GET' && routeParts.length === 1) {
    const recordings = await readAllJsonFiles<TeacherRecording>(dataPaths.teacherRecordings);
    const lessonId = url.searchParams.get('lessonId');
    const filteredRecordings = lessonId ? recordings.filter((recording) => recording.lessonId === lessonId) : recordings;

    filteredRecordings.sort((a, b) => {
      const startedAtOrder = b.startedAt.localeCompare(a.startedAt);

      if (startedAtOrder !== 0) {
        return startedAtOrder;
      }

      return b.id.localeCompare(a.id);
    });

    sendJson(res, { teacherRecordings: filteredRecordings });
    return;
  }

  if (req.method === 'GET' && routeParts.length === 2) {
    const id = assertSafeId(decodeURIComponent(routeParts[1] ?? ''), 'teacher recording id');
    const recording = await readJsonFile<TeacherRecording>(getJsonFilePath(dataPaths.teacherRecordings, id));

    if (!recording) {
      sendJson(res, { teacherRecording: null }, 404);
      return;
    }

    sendJson(res, { teacherRecording: recording });
    return;
  }

  if (req.method === 'POST' && routeParts.length === 1) {
    const recording = normalizeTeacherRecording(await readJsonRequest(req));
    const filePath = getJsonFilePath(dataPaths.teacherRecordings, recording.id);
    const existingRecording = await readJsonFile<TeacherRecording>(filePath);

    if (existingRecording) {
      if (hashStableJson(existingRecording) !== hashStableJson(recording)) {
        sendJson(res, { error: 'Teacher recording already exists and is immutable.' }, 409);
        return;
      }

      sendJson(res, { teacherRecording: existingRecording });
      return;
    }

    await writeJsonFile(filePath, recording);
    sendJson(res, { teacherRecording: recording }, 201);
    return;
  }

  sendJson(res, { error: 'Not found.' }, 404);
}

async function handleLearnerDeltas(req: IncomingMessage, res: ServerResponse, url: URL, routeParts: string[]) {
  const dataPaths = await ensureDataDirectories();

  if (req.method === 'GET' && routeParts.length === 1) {
    const deltas = await readAllJsonFiles<LearnerDelta>(dataPaths.learnerDeltas);
    const filteredDeltas = filterLearnerDeltas(deltas, url);

    sendJson(res, { learnerDeltas: filteredDeltas });
    return;
  }

  if (req.method === 'GET' && routeParts[1] === 'latest') {
    const deltas = await readAllJsonFiles<LearnerDelta>(dataPaths.learnerDeltas);
    const [latestDelta] = filterLearnerDeltas(deltas, url);

    sendJson(res, { learnerDelta: latestDelta ?? null });
    return;
  }

  if (req.method === 'POST' && routeParts.length === 1) {
    let delta = normalizeLearnerDelta(await readJsonRequest(req));
    const linkedRecording = await readJsonFile<TeacherRecording>(
      getJsonFilePath(dataPaths.teacherRecordings, delta.teacherRecordingId),
    );

    if (!linkedRecording) {
      sendJson(res, { error: 'Linked teacher recording was not found.' }, 400);
      return;
    }

    if (linkedRecording.version !== delta.teacherRecordingVersion) {
      sendJson(res, { error: 'Learner delta teacher recording version does not match.' }, 400);
      return;
    }

    let deltaPath = getJsonFilePath(dataPaths.learnerDeltas, delta.id);

    if (await readJsonFile<LearnerDelta>(deltaPath)) {
      delta = { ...delta, id: createSafeId('learner-delta') };
      deltaPath = getJsonFilePath(dataPaths.learnerDeltas, delta.id);
    }

    await writeJsonFile(deltaPath, delta);
    sendJson(res, { learnerDelta: delta }, 201);
    return;
  }

  sendJson(res, { error: 'Not found.' }, 404);
}

function filterLearnerDeltas(deltas: LearnerDelta[], url: URL): LearnerDelta[] {
  const lessonId = url.searchParams.get('lessonId');
  const teacherRecordingId = url.searchParams.get('teacherRecordingId');
  const teacherRecordingVersion = url.searchParams.get('teacherRecordingVersion');
  const userId = url.searchParams.get('userId');

  return deltas
    .filter((delta) => !lessonId || delta.lessonId === lessonId)
    .filter((delta) => !teacherRecordingId || delta.teacherRecordingId === teacherRecordingId)
    .filter((delta) => !teacherRecordingVersion || delta.teacherRecordingVersion === Number(teacherRecordingVersion))
    .filter((delta) => !userId || delta.userId === userId)
    .sort((a, b) => {
      const createdAtOrder = b.createdAt.localeCompare(a.createdAt);

      if (createdAtOrder !== 0) {
        return createdAtOrder;
      }

      return b.id.localeCompare(a.id);
    });
}

async function handleMediaAssets(req: IncomingMessage, res: ServerResponse, url: URL, routeParts: string[]) {
  const dataPaths = await ensureDataDirectories();

  if (req.method === 'GET' && routeParts.length === 1) {
    const recordingId = url.searchParams.get('recordingId');
    const assets = await readAllJsonFiles<StoredMediaAssetMetadata>(dataPaths.mediaAssets);
    const mediaAssets = assets
      .filter((asset) => !recordingId || asset.recordingId === recordingId)
      .sort((a, b) => {
        const createdAtOrder = a.createdAt.localeCompare(b.createdAt);

        if (createdAtOrder !== 0) {
          return createdAtOrder;
        }

        return a.id.localeCompare(b.id);
      })
      .map(stripMediaStorageFields);

    sendJson(res, { mediaAssets });
    return;
  }

  if (req.method === 'GET' && routeParts.length === 2) {
    const id = assertSafeId(decodeURIComponent(routeParts[1] ?? ''), 'media asset id');
    const metadata = await readJsonFile<StoredMediaAssetMetadata>(getJsonFilePath(dataPaths.mediaAssets, id));

    if (!metadata) {
      sendJson(res, { mediaAsset: null }, 404);
      return;
    }

    if (url.searchParams.get('blob') === '1') {
      const mediaFile = await readFile(path.join(dataPaths.mediaAssets, metadata.storedFileName));

      res.statusCode = 200;
      res.setHeader('Content-Type', metadata.mimeType);
      res.setHeader('Content-Length', String(mediaFile.length));
      res.setHeader('Cache-Control', 'no-store');
      res.end(mediaFile);
      return;
    }

    sendJson(res, {
      mediaAsset: stripMediaStorageFields(metadata),
      downloadUrl: `${API_PREFIX}/media-assets/${encodeURIComponent(metadata.id)}?blob=1`,
    });
    return;
  }

  if (req.method === 'DELETE' && routeParts.length === 2) {
    const id = assertSafeId(decodeURIComponent(routeParts[1] ?? ''), 'media asset id');
    const metadata = await readJsonFile<StoredMediaAssetMetadata>(getJsonFilePath(dataPaths.mediaAssets, id));

    if (metadata) {
      await rm(path.join(dataPaths.mediaAssets, metadata.storedFileName), { force: true });
      await rm(getJsonFilePath(dataPaths.mediaAssets, id), { force: true });
    }

    sendJson(res, { ok: true });
    return;
  }

  if (req.method === 'POST' && routeParts.length === 1) {
    const contentType = req.headers['content-type'] ?? '';

    if (!contentType.includes('multipart/form-data')) {
      sendJson(res, { error: 'Expected multipart/form-data media upload.' }, 415);
      return;
    }

    const multipart = parseMultipartBody(await readRequestBody(req, MEDIA_LIMIT_BYTES), contentType);
    const metadataFromField = multipart.fields.get('metadata');
    const metadata = normalizeMediaMetadata(
      metadataFromField
        ? JSON.parse(metadataFromField)
        : {
            id: multipart.fields.get('id'),
            recordingId: multipart.fields.get('recordingId'),
            kind: multipart.fields.get('kind'),
            mimeType: multipart.fields.get('mimeType'),
            durationMs: Number(multipart.fields.get('durationMs')),
            createdAt: multipart.fields.get('createdAt'),
          },
    );
    const linkedRecording = await readJsonFile<TeacherRecording>(
      getJsonFilePath(dataPaths.teacherRecordings, metadata.recordingId),
    );

    if (!linkedRecording) {
      sendJson(res, { error: 'Linked teacher recording was not found.' }, 400);
      return;
    }

    const file = multipart.files.get('file');

    if (!file) {
      sendJson(res, { error: 'Media file field is required.' }, 400);
      return;
    }

    const extension = getAllowedMediaExtension(metadata.mimeType);
    const uploadMimeType = file.contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    const metadataMimeType = metadata.mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';

    if (uploadMimeType && uploadMimeType !== metadataMimeType && uploadMimeType !== 'application/octet-stream') {
      sendJson(res, { error: 'Media upload Content-Type does not match metadata.' }, 415);
      return;
    }

    if (file.buffer.length === 0 || file.buffer.length > MEDIA_LIMIT_BYTES) {
      sendJson(res, { error: 'Media upload size is invalid.' }, 413);
      return;
    }

    if (!hasExpectedMediaSignature(file.buffer, metadata.mimeType)) {
      sendJson(res, { error: 'Media upload does not match the expected file signature.' }, 415);
      return;
    }

    const existingMetadata = await readJsonFile<StoredMediaAssetMetadata>(getJsonFilePath(dataPaths.mediaAssets, metadata.id));

    if (existingMetadata) {
      sendJson(res, { mediaAsset: stripMediaStorageFields(existingMetadata) });
      return;
    }

    const storedFileName = `${metadata.id}-${randomUUID()}${extension}`;
    const storedMetadata: StoredMediaAssetMetadata = {
      ...metadata,
      storedFileName,
      sizeBytes: file.buffer.length,
    };

    await writeFile(path.join(dataPaths.mediaAssets, storedFileName), file.buffer);
    await writeJsonFile(getJsonFilePath(dataPaths.mediaAssets, metadata.id), storedMetadata);
    sendJson(res, { mediaAsset: stripMediaStorageFields(storedMetadata) }, 201);
    return;
  }

  sendJson(res, { error: 'Not found.' }, 404);
}

function hashStableJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sendJson(res: ServerResponse, value: unknown, statusCode = 200) {
  const body = JSON.stringify(value);

  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function sendError(res: ServerResponse, error: unknown) {
  const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number((error as any).statusCode) : 400;
  const message = error instanceof Error ? error.message : 'Interactive persistence request failed.';

  sendJson(res, { error: message }, Number.isFinite(statusCode) ? statusCode : 400);
}

export async function handleInteractivePersistenceRequest(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (!url.pathname.startsWith(API_PREFIX)) {
    next();
    return;
  }

  const routeParts = url.pathname
    .slice(API_PREFIX.length)
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);

  try {
    if (routeParts[0] === 'teacher-recordings') {
      await handleTeacherRecordings(req, res, url, routeParts);
      return;
    }

    if (routeParts[0] === 'learner-deltas') {
      await handleLearnerDeltas(req, res, url, routeParts);
      return;
    }

    if (routeParts[0] === 'media-assets') {
      await handleMediaAssets(req, res, url, routeParts);
      return;
    }

    sendJson(res, { error: 'Not found.' }, 404);
  } catch (error) {
    sendError(res, error);
  }
}

export function createInteractivePersistenceMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    void handleInteractivePersistenceRequest(req, res, next);
  };
}

export const interactivePersistence: VitePlugin = {
  name: 'tutorialkit-interactive-persistence',
  configureServer(server) {
    server.middlewares.use(createInteractivePersistenceMiddleware());
  },
  configurePreviewServer(server) {
    server.middlewares.use(createInteractivePersistenceMiddleware());
  },
};
