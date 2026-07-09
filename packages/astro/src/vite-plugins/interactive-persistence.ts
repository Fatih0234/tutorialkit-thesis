import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import {
  INTERACTIVE_DEFAULT_LEARNER_USER_ID,
  INTERACTIVE_DEFAULT_TEACHER_USER_ID,
  INTERACTIVE_DEV_LEARNER_TWO_USER_ID,
  INTERACTIVE_DEV_LEARNER_USER_ID,
  INTERACTIVE_DEV_TEACHER_USER_ID,
  INTERACTIVE_LEGACY_LOCAL_LEARNER_USER_ID,
  type InteractiveSession,
  type InteractiveUser,
} from '@tutorialkit/runtime';
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
const SESSION_COOKIE_NAME = 'interactive_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEV_USERS: readonly InteractiveUser[] = [
  {
    id: INTERACTIVE_DEV_TEACHER_USER_ID,
    displayName: 'Teacher Demo',
    role: 'teacher',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: INTERACTIVE_DEV_LEARNER_USER_ID,
    displayName: 'Learner Demo',
    role: 'learner',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: INTERACTIVE_DEV_LEARNER_TWO_USER_ID,
    displayName: 'Learner Two',
    role: 'learner',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

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
  ownerUserId?: string;
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
  createdByUserId?: string;
  ownerUserId?: string;
  publishedByUserId?: string;
  publishedAt?: string;
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
    sessions: path.join(root, 'sessions'),
  };
}

function createHttpError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function getDevUser(userId: string | undefined): InteractiveUser | undefined {
  return DEV_USERS.find((user) => user.id === userId);
}

function canTeach(user: InteractiveUser | undefined): boolean {
  return user?.role === 'teacher' || user?.role === 'both';
}

function canLearn(user: InteractiveUser | undefined): boolean {
  return user?.role === 'learner' || user?.role === 'both';
}

function createSessionId(): string {
  return `session-${randomBytes(32).toString('base64url')}`;
}

function parseCookies(req: IncomingMessage): Map<string, string> {
  const cookies = new Map<string, string>();
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return cookies;
  }

  for (const entry of cookieHeader.split(';')) {
    const separatorIndex = entry.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const name = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();

    if (name) {
      cookies.set(name, decodeURIComponent(value));
    }
  }

  return cookies;
}

function isHttpsRequest(req: IncomingMessage): boolean {
  return Boolean((req.socket as any).encrypted) || req.headers['x-forwarded-proto'] === 'https';
}

function serializeSessionCookie(req: IncomingMessage, value: string, options: { expires?: Date; maxAgeSeconds?: number } = {}) {
  const segments = [`${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`, 'HttpOnly', 'SameSite=Lax', 'Path=/'];

  if (isHttpsRequest(req)) {
    segments.push('Secure');
  }

  if (options.expires) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.maxAgeSeconds !== undefined) {
    segments.push(`Max-Age=${options.maxAgeSeconds}`);
  }

  return segments.join('; ');
}

function setSessionCookie(req: IncomingMessage, res: ServerResponse, session: InteractiveSession) {
  res.setHeader('Set-Cookie', serializeSessionCookie(req, session.id, { expires: new Date(session.expiresAt) }));
}

function clearSessionCookie(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Set-Cookie', serializeSessionCookie(req, '', { expires: new Date(0), maxAgeSeconds: 0 }));
}

async function deleteSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) {
    return;
  }

  const dataPaths = await ensureDataDirectories();
  await rm(getJsonFilePath(dataPaths.sessions, sessionId), { force: true });
}

async function readCurrentSession(req: IncomingMessage): Promise<InteractiveSession | undefined> {
  const sessionId = parseCookies(req).get(SESSION_COOKIE_NAME);

  if (!sessionId) {
    return undefined;
  }

  const dataPaths = await ensureDataDirectories();
  const session = await readJsonFile<InteractiveSession>(getJsonFilePath(dataPaths.sessions, sessionId));

  if (!session || session.id !== sessionId) {
    return undefined;
  }

  if (Date.parse(session.expiresAt) <= Date.now()) {
    await deleteSession(sessionId);
    return undefined;
  }

  return session;
}

async function getAuthenticatedUser(req: IncomingMessage): Promise<InteractiveUser | undefined> {
  const session = await readCurrentSession(req);

  return session ? getDevUser(session.userId) : undefined;
}

async function requireTeacherUser(req: IncomingMessage): Promise<InteractiveUser> {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    throw createHttpError('Sign in as a teacher to publish recordings.', 401);
  }

  if (!canTeach(user)) {
    throw createHttpError('Teacher role is required.', 403);
  }

  return user;
}

async function requireLearnerUser(req: IncomingMessage): Promise<InteractiveUser> {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    throw createHttpError('Sign in as a learner to save work.', 401);
  }

  if (!canLearn(user)) {
    throw createHttpError('Learner role is required.', 403);
  }

  return user;
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
    ownerUserId: candidate.ownerUserId ? assertSafeId(candidate.ownerUserId, 'media owner user id') : undefined,
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
    createdByUserId: candidate.createdByUserId ? assertSafeId(candidate.createdByUserId, 'createdBy user id') : undefined,
    ownerUserId: candidate.ownerUserId ? assertSafeId(candidate.ownerUserId, 'owner user id') : undefined,
    publishedByUserId: candidate.publishedByUserId ? assertSafeId(candidate.publishedByUserId, 'publishedBy user id') : undefined,
    publishedAt: candidate.publishedAt && typeof candidate.publishedAt === 'string' ? candidate.publishedAt : undefined,
  };
}

function normalizeLearnerDelta(value: unknown, fallbackUserId?: string): LearnerDelta {
  const input = value && typeof value === 'object' && 'learnerDelta' in value ? (value as any).learnerDelta : value;

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected learner delta object.');
  }

  const candidate = input as Partial<LearnerDelta>;

  if (!candidate.id || typeof candidate.id !== 'string') {
    throw new Error('Learner delta id is required.');
  }

  const userId = typeof candidate.userId === 'string' ? candidate.userId : fallbackUserId;

  if (!userId) {
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
    userId: assertSafeId(userId, 'learner user id'),
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
    ownerUserId: metadata.ownerUserId,
  };
}

function withTeacherOwnershipDefaults(recording: TeacherRecording): TeacherRecording {
  const ownerUserId = recording.ownerUserId ?? recording.createdByUserId ?? INTERACTIVE_DEFAULT_TEACHER_USER_ID;
  const createdByUserId = recording.createdByUserId ?? ownerUserId;

  return {
    ...recording,
    ownerUserId,
    createdByUserId,
    mediaAssets: recording.mediaAssets?.map((asset) => ({ ...asset, ownerUserId: asset.ownerUserId ?? ownerUserId })),
  };
}

function withPublishedTeacherOwnership(
  recording: TeacherRecording,
  user: InteractiveUser,
  existingRecording?: TeacherRecording,
): TeacherRecording {
  const publishedAt = existingRecording?.publishedAt ?? recording.publishedAt ?? new Date().toISOString();

  return {
    ...recording,
    ownerUserId: user.id,
    createdByUserId: user.id,
    publishedByUserId: user.id,
    publishedAt,
    mediaAssets: recording.mediaAssets?.map((asset) => ({ ...asset, ownerUserId: user.id })),
  };
}

function getAllowedLearnerUserIds(user: InteractiveUser): string[] {
  const userIds = [user.id];

  if (user.id === INTERACTIVE_DEFAULT_LEARNER_USER_ID) {
    userIds.push(INTERACTIVE_LEGACY_LOCAL_LEARNER_USER_ID);
  }

  return userIds;
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
    mkdir(dataPaths.sessions, { recursive: true }),
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

async function handleAuth(req: IncomingMessage, res: ServerResponse, routeParts: string[]) {
  if (req.method === 'GET' && routeParts[1] === 'me') {
    sendJson(res, { user: (await getAuthenticatedUser(req)) ?? null });
    return;
  }

  if (req.method === 'POST' && routeParts[1] === 'dev-login') {
    const body = await readJsonRequest(req);
    const userId = body && typeof body === 'object' && 'userId' in body ? String((body as { userId?: unknown }).userId) : '';
    const user = getDevUser(userId);

    if (!user) {
      sendJson(res, { error: 'Unknown dev user.' }, 400);
      return;
    }

    await deleteSession(parseCookies(req).get(SESSION_COOKIE_NAME));

    const now = Date.now();
    const session: InteractiveSession = {
      id: createSessionId(),
      userId: user.id,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    };
    const dataPaths = await ensureDataDirectories();

    await writeJsonFile(getJsonFilePath(dataPaths.sessions, session.id), session);
    setSessionCookie(req, res, session);
    sendJson(res, { user });
    return;
  }

  if (req.method === 'POST' && routeParts[1] === 'logout') {
    await deleteSession(parseCookies(req).get(SESSION_COOKIE_NAME));
    clearSessionCookie(req, res);
    sendJson(res, { ok: true });
    return;
  }

  sendJson(res, { error: 'Not found.' }, 404);
}

async function handleDevUsers(req: IncomingMessage, res: ServerResponse, routeParts: string[]) {
  if (req.method === 'GET' && routeParts[1] === 'dev') {
    sendJson(res, { users: DEV_USERS });
    return;
  }

  sendJson(res, { error: 'Not found.' }, 404);
}

async function handleTeacherRecordings(req: IncomingMessage, res: ServerResponse, url: URL, routeParts: string[]) {
  const dataPaths = await ensureDataDirectories();

  if (req.method === 'GET' && routeParts.length === 1) {
    const recordings = await readAllJsonFiles<TeacherRecording>(dataPaths.teacherRecordings);
    const lessonId = url.searchParams.get('lessonId');
    const recordingsWithOwners = recordings.map(withTeacherOwnershipDefaults);
    const filteredRecordings = lessonId
      ? recordingsWithOwners.filter((recording) => recording.lessonId === lessonId)
      : recordingsWithOwners;

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

    sendJson(res, { teacherRecording: withTeacherOwnershipDefaults(recording) });
    return;
  }

  if (req.method === 'POST' && routeParts.length === 1) {
    const user = await requireTeacherUser(req);
    const inputRecording = normalizeTeacherRecording(await readJsonRequest(req));
    const filePath = getJsonFilePath(dataPaths.teacherRecordings, inputRecording.id);
    const existingRecordingRaw = await readJsonFile<TeacherRecording>(filePath);
    const existingRecording = existingRecordingRaw ? withTeacherOwnershipDefaults(existingRecordingRaw) : undefined;
    const recording = withPublishedTeacherOwnership(inputRecording, user, existingRecording);

    if (existingRecording) {
      if (existingRecording.ownerUserId !== user.id) {
        sendJson(res, { error: 'Teacher recording belongs to a different teacher.' }, 403);
        return;
      }

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
    const user = await getAuthenticatedUser(req);

    if (!user || !canLearn(user)) {
      sendJson(res, { learnerDeltas: [] });
      return;
    }

    const deltas = await readAllJsonFiles<LearnerDelta>(dataPaths.learnerDeltas);
    const filteredDeltas = filterLearnerDeltas(deltas, url, user);

    sendJson(res, { learnerDeltas: filteredDeltas });
    return;
  }

  if (req.method === 'GET' && routeParts[1] === 'latest') {
    const user = await getAuthenticatedUser(req);

    if (!user || !canLearn(user)) {
      sendJson(res, { learnerDelta: null });
      return;
    }

    const deltas = await readAllJsonFiles<LearnerDelta>(dataPaths.learnerDeltas);
    const [latestDelta] = filterLearnerDeltas(deltas, url, user);

    sendJson(res, { learnerDelta: latestDelta ?? null });
    return;
  }

  if (req.method === 'POST' && routeParts.length === 1) {
    const user = await requireLearnerUser(req);
    let delta = { ...normalizeLearnerDelta(await readJsonRequest(req), user.id), userId: user.id };
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

function filterLearnerDeltas(deltas: LearnerDelta[], url: URL, user: InteractiveUser): LearnerDelta[] {
  const lessonId = url.searchParams.get('lessonId');
  const teacherRecordingId = url.searchParams.get('teacherRecordingId');
  const teacherRecordingVersion = url.searchParams.get('teacherRecordingVersion');
  const allowedUserIds = new Set(getAllowedLearnerUserIds(user));

  return deltas
    .filter((delta) => allowedUserIds.has(delta.userId))
    .filter((delta) => !lessonId || delta.lessonId === lessonId)
    .filter((delta) => !teacherRecordingId || delta.teacherRecordingId === teacherRecordingId)
    .filter((delta) => !teacherRecordingVersion || delta.teacherRecordingVersion === Number(teacherRecordingVersion))
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
    const user = await requireTeacherUser(req);
    const id = assertSafeId(decodeURIComponent(routeParts[1] ?? ''), 'media asset id');
    const metadata = await readJsonFile<StoredMediaAssetMetadata>(getJsonFilePath(dataPaths.mediaAssets, id));

    if (metadata) {
      const linkedRecording = await readJsonFile<TeacherRecording>(
        getJsonFilePath(dataPaths.teacherRecordings, metadata.recordingId),
      );
      const ownerUserId = metadata.ownerUserId ?? (linkedRecording ? withTeacherOwnershipDefaults(linkedRecording).ownerUserId : undefined);

      if (ownerUserId !== user.id) {
        sendJson(res, { error: 'Media asset belongs to a different teacher.' }, 403);
        return;
      }

      await rm(path.join(dataPaths.mediaAssets, metadata.storedFileName), { force: true });
      await rm(getJsonFilePath(dataPaths.mediaAssets, id), { force: true });
    }

    sendJson(res, { ok: true });
    return;
  }

  if (req.method === 'POST' && routeParts.length === 1) {
    const user = await requireTeacherUser(req);
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
    const linkedRecordingRaw = await readJsonFile<TeacherRecording>(
      getJsonFilePath(dataPaths.teacherRecordings, metadata.recordingId),
    );

    if (!linkedRecordingRaw) {
      sendJson(res, { error: 'Linked teacher recording was not found.' }, 400);
      return;
    }

    const linkedRecording = withTeacherOwnershipDefaults(linkedRecordingRaw);

    if (linkedRecording.ownerUserId !== user.id) {
      sendJson(res, { error: 'Media asset recording belongs to a different teacher.' }, 403);
      return;
    }

    const metadataWithOwner: RecordingMediaAssetMetadata = { ...metadata, ownerUserId: user.id };
    const file = multipart.files.get('file');

    if (!file) {
      sendJson(res, { error: 'Media file field is required.' }, 400);
      return;
    }

    const extension = getAllowedMediaExtension(metadataWithOwner.mimeType);
    const uploadMimeType = file.contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    const metadataMimeType = metadataWithOwner.mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';

    if (uploadMimeType && uploadMimeType !== metadataMimeType && uploadMimeType !== 'application/octet-stream') {
      sendJson(res, { error: 'Media upload Content-Type does not match metadata.' }, 415);
      return;
    }

    if (file.buffer.length === 0 || file.buffer.length > MEDIA_LIMIT_BYTES) {
      sendJson(res, { error: 'Media upload size is invalid.' }, 413);
      return;
    }

    if (!hasExpectedMediaSignature(file.buffer, metadataWithOwner.mimeType)) {
      sendJson(res, { error: 'Media upload does not match the expected file signature.' }, 415);
      return;
    }

    const existingMetadata = await readJsonFile<StoredMediaAssetMetadata>(getJsonFilePath(dataPaths.mediaAssets, metadataWithOwner.id));

    if (existingMetadata) {
      if ((existingMetadata.ownerUserId ?? linkedRecording.ownerUserId) !== user.id) {
        sendJson(res, { error: 'Media asset belongs to a different teacher.' }, 403);
        return;
      }

      sendJson(res, { mediaAsset: stripMediaStorageFields(existingMetadata) });
      return;
    }

    const storedFileName = `${metadataWithOwner.id}-${randomUUID()}${extension}`;
    const storedMetadata: StoredMediaAssetMetadata = {
      ...metadataWithOwner,
      storedFileName,
      sizeBytes: file.buffer.length,
    };

    await writeFile(path.join(dataPaths.mediaAssets, storedFileName), file.buffer);
    await writeJsonFile(getJsonFilePath(dataPaths.mediaAssets, metadataWithOwner.id), storedMetadata);
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
    if (routeParts[0] === 'auth') {
      await handleAuth(req, res, routeParts);
      return;
    }

    if (routeParts[0] === 'users') {
      await handleDevUsers(req, res, routeParts);
      return;
    }

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
