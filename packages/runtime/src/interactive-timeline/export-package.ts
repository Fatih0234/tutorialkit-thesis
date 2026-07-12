import { normalizeEditorSelectionPayload } from './editor-selection.js';
import { getRecordingMediaAssetMetadata, type RecordingMediaAsset, type RecordingMediaAssetMetadata } from './media.js';
import { normalizeFiles, normalizePath } from './path.js';
import { normalizeTeacherPointerClickPayload, normalizeTeacherPointerPayload } from './pointer.js';
import type { InteractiveTimelineStorage, LearnerDeltaQuery } from './storage-adapter.js';
import type { LearnerDelta, TeacherRecording, TimelineEvent } from './types.js';
import { MAX_WHITEBOARD_TITLE_LENGTH, sanitizeWhiteboardScene } from './whiteboard.js';
import type { PresentationResource } from './presentation.js';

export interface InteractiveRecordingPackageMediaAsset {
  metadata: RecordingMediaAssetMetadata;
  blob?: Blob;
  dataBase64?: string;
}

export interface InteractiveRecordingPackage {
  formatVersion: 1;
  exportedAt: string;
  teacherRecording: TeacherRecording;
  mediaAssets: InteractiveRecordingPackageMediaAsset[];
  learnerDeltas?: LearnerDelta[];
  packageMetadata?: {
    title?: string;
    description?: string;
    exportedByUserId?: string;
  };
}

export interface ExportRecordingPackageOptions {
  storage: InteractiveTimelineStorage;
  includeLearnerDeltas?: boolean;
  learnerDeltaQuery?: LearnerDeltaQuery;
  packageMetadata?: InteractiveRecordingPackage['packageMetadata'];
}

export interface DownloadRecordingPackageOptions {
  filename?: string;
}

export type ImportRecordingPackageMode = 'local-draft' | 'published';

export interface ImportRecordingPackageTarget {
  storage: InteractiveTimelineStorage;
  mode: ImportRecordingPackageMode;
  importAsCopy?: boolean;
  importedByUserId?: string;
  includeLearnerDeltas?: boolean;
  now?: () => Date;
}

export interface ImportedRecordingPackageResult {
  teacherRecording: TeacherRecording;
  mediaAssets: RecordingMediaAsset[];
  learnerDeltas: LearnerDelta[];
  warnings: string[];
}

const SUPPORTED_FORMAT_VERSION = 1;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;

function assertObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function assertSafeId(id: unknown, label: string): string {
  if (typeof id !== 'string' || !SAFE_ID_PATTERN.test(id)) {
    throw new Error(`Unsafe ${label}.`);
  }

  return id;
}

function optionalSafeId(id: unknown, label: string): string | undefined {
  return id === undefined || id === null || id === '' ? undefined : assertSafeId(id, label);
}

function sanitizeIdSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+/, '') || 'recording';

  return sanitized.slice(0, 72);
}

function createCopyId(sourceId: string): string {
  const randomSuffix = Math.random().toString(36).slice(2, 8);

  return `${sanitizeIdSegment(sourceId)}-import-${Date.now().toString(36)}-${randomSuffix}`.slice(0, 121);
}

function normalizeTimelinePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.filePath !== 'string') {
    return payload;
  }

  return {
    ...candidate,
    filePath: normalizePath(candidate.filePath),
  };
}

function normalizePresentationResources(value: unknown): PresentationResource[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error('Presentation resources must be an array.');
  return value.map((item) => {
    const resource = assertObject(item, 'Expected presentation resource object.') as Partial<PresentationResource>;
    const id = assertSafeId(resource.id, 'presentation resource id');
    if (typeof resource.title !== 'string' || !resource.title.trim() || resource.title.length > MAX_WHITEBOARD_TITLE_LENGTH) throw new Error('Presentation resource title is invalid.');
    if (resource.kind === 'whiteboard') return { id, kind: 'whiteboard', title: resource.title, initialScene: sanitizeWhiteboardScene(resource.initialScene) };
    if (resource.kind !== 'preview' && resource.kind !== 'explanation' && resource.kind !== 'camera' && resource.kind !== 'slide' && resource.kind !== 'deck') throw new Error('Presentation resource kind is invalid.');
    return { ...resource, id, title: resource.title } as PresentationResource;
  });
}

function normalizeTimelineEvent(event: unknown): TimelineEvent {
  const candidate = assertObject(event, 'Expected timeline event object.') as Partial<TimelineEvent>;

  if (typeof candidate.seq !== 'number' || !Number.isFinite(candidate.seq)) {
    throw new Error('Timeline event seq must be a number.');
  }

  if (typeof candidate.tMs !== 'number' || !Number.isFinite(candidate.tMs)) {
    throw new Error('Timeline event tMs must be a number.');
  }

  if (!candidate.type || typeof candidate.type !== 'string') {
    throw new Error('Timeline event type is required.');
  }

  if (candidate.origin !== 'teacher' && candidate.origin !== 'playback' && candidate.origin !== 'system') {
    throw new Error('Timeline event origin is invalid.');
  }

  let payload = normalizeTimelinePayload(candidate.payload);
  if (candidate.type === 'editor.selection.changed') {
    payload = normalizeEditorSelectionPayload(candidate.payload);
  } else if (candidate.type === 'whiteboard.scene.changed') {
    const whiteboardPayload = assertObject(candidate.payload, 'Whiteboard event payload must be an object.');
    payload = { resourceId: assertSafeId(whiteboardPayload.resourceId, 'whiteboard resource id'), scene: sanitizeWhiteboardScene(whiteboardPayload.scene) };
  } else if (candidate.type === 'pointer.changed') {
    payload = normalizeTeacherPointerPayload(candidate.payload);
  } else if (candidate.type === 'pointer.clicked') {
    payload = normalizeTeacherPointerClickPayload(candidate.payload);
  }

  return {
    ...candidate,
    id: assertSafeId(candidate.id, 'timeline event id'),
    seq: candidate.seq,
    tMs: candidate.tMs,
    type: candidate.type,
    filePath: candidate.filePath ? normalizePath(candidate.filePath) : undefined,
    payload,
    origin: candidate.origin,
  };
}

function normalizeMediaMetadata(value: unknown, fallbackRecordingId: string): RecordingMediaAssetMetadata {
  const candidate = assertObject(value, 'Expected media asset metadata object.') as Partial<RecordingMediaAssetMetadata>;
  const recordingId = candidate.recordingId ?? fallbackRecordingId;

  if (candidate.kind !== 'audio' && candidate.kind !== 'webcam') {
    throw new Error('Media asset kind must be audio or webcam.');
  }

  if (!candidate.mimeType || typeof candidate.mimeType !== 'string') {
    throw new Error('Media asset mimeType is required.');
  }

  if (typeof candidate.durationMs !== 'number' || !Number.isFinite(candidate.durationMs) || candidate.durationMs < 0) {
    throw new Error('Media asset durationMs must be non-negative.');
  }

  if (!candidate.createdAt || typeof candidate.createdAt !== 'string') {
    throw new Error('Media asset createdAt is required.');
  }

  return {
    id: assertSafeId(candidate.id, 'media asset id'),
    recordingId: assertSafeId(recordingId, 'media recording id'),
    kind: candidate.kind,
    mimeType: candidate.mimeType,
    durationMs: candidate.durationMs,
    createdAt: candidate.createdAt,
    ownerUserId: optionalSafeId(candidate.ownerUserId, 'media owner user id'),
  };
}

function normalizeTeacherRecording(value: unknown): TeacherRecording {
  const candidate = assertObject(value, 'Expected teacher recording object.') as Partial<TeacherRecording>;

  if (!candidate.lessonId || typeof candidate.lessonId !== 'string') {
    throw new Error('Teacher recording lessonId is required.');
  }

  if (typeof candidate.version !== 'number' || !Number.isFinite(candidate.version)) {
    throw new Error('Teacher recording version must be a number.');
  }

  if (!candidate.startedAt || typeof candidate.startedAt !== 'string') {
    throw new Error('Teacher recording startedAt is required.');
  }

  if (typeof candidate.durationMs !== 'number' || !Number.isFinite(candidate.durationMs) || candidate.durationMs < 0) {
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
    baseFiles: normalizeFiles(candidate.baseFiles ?? {}),
    events: candidate.events
      .map(normalizeTimelineEvent)
      .sort((a, b) => (a.tMs === b.tMs ? a.seq - b.seq : a.tMs - b.tMs)),
    presentationResources: normalizePresentationResources(candidate.presentationResources),
    mediaAssets: candidate.mediaAssets?.map((asset) => normalizeMediaMetadata(asset, recordingId)),
    createdByUserId: optionalSafeId(candidate.createdByUserId, 'createdBy user id'),
    ownerUserId: optionalSafeId(candidate.ownerUserId, 'owner user id'),
    publishedByUserId: optionalSafeId(candidate.publishedByUserId, 'publishedBy user id'),
    publishedAt: typeof candidate.publishedAt === 'string' ? candidate.publishedAt : undefined,
  };
}

function normalizeLearnerDelta(value: unknown): LearnerDelta {
  const candidate = assertObject(value, 'Expected learner delta object.') as Partial<LearnerDelta>;

  if (!candidate.lessonId || typeof candidate.lessonId !== 'string') {
    throw new Error('Learner delta lessonId is required.');
  }

  if (typeof candidate.teacherRecordingVersion !== 'number' || !Number.isFinite(candidate.teacherRecordingVersion)) {
    throw new Error('Learner delta teacherRecordingVersion must be a number.');
  }

  if (typeof candidate.teacherTimestampMs !== 'number' || !Number.isFinite(candidate.teacherTimestampMs) || candidate.teacherTimestampMs < 0) {
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
    userId: assertSafeId(candidate.userId, 'learner user id'),
    lessonId: candidate.lessonId,
    teacherRecordingId: assertSafeId(candidate.teacherRecordingId, 'learner delta teacher recording id'),
    teacherRecordingVersion: candidate.teacherRecordingVersion,
    teacherTimestampMs: candidate.teacherTimestampMs,
    baseTeacherFilesHash: candidate.baseTeacherFilesHash,
    addedOrModified: normalizeFiles(candidate.addedOrModified ?? {}),
    removed: candidate.removed.map((filePath) => normalizePath(String(filePath))),
    selectedFile: candidate.selectedFile ? normalizePath(candidate.selectedFile) : undefined,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
  };
}

function normalizePackageMetadata(value: unknown): InteractiveRecordingPackage['packageMetadata'] {
  if (!value) {
    return undefined;
  }

  const candidate = assertObject(value, 'Expected package metadata object.');

  return {
    title: typeof candidate.title === 'string' ? candidate.title : undefined,
    description: typeof candidate.description === 'string' ? candidate.description : undefined,
    exportedByUserId: optionalSafeId(candidate.exportedByUserId, 'exportedBy user id'),
  };
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function validateMediaPackageEntry(value: unknown, recordingId: string): InteractiveRecordingPackageMediaAsset {
  const candidate = assertObject(value, 'Expected package media asset object.') as Partial<InteractiveRecordingPackageMediaAsset>;
  const metadata = normalizeMediaMetadata(candidate.metadata, recordingId);

  if (metadata.recordingId !== recordingId) {
    throw new Error('Media asset recordingId must match the teacher recording id.');
  }

  if (candidate.dataBase64 !== undefined && typeof candidate.dataBase64 !== 'string') {
    throw new Error('Media dataBase64 must be a string.');
  }

  if (candidate.blob !== undefined && !isBlob(candidate.blob)) {
    throw new Error('Media blob must be a Blob.');
  }

  return {
    metadata,
    blob: candidate.blob,
    dataBase64: candidate.dataBase64,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof btoa !== 'function') {
    throw new Error('Base64 serialization requires btoa.');
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);

    for (const byte of chunk) {
      binary += String.fromCharCode(byte);
    }
  }

  return btoa(binary);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return arrayBufferToBase64(await blob.arrayBuffer());
}

function base64ToBlob(dataBase64: string, mimeType: string): Blob {
  if (typeof atob !== 'function') {
    throw new Error('Base64 parsing requires atob.');
  }

  const binary = atob(dataBase64);
  const chunkSize = 0x8000;
  const chunks: Uint8Array[] = [];

  for (let offset = 0; offset < binary.length; offset += chunkSize) {
    const slice = binary.slice(offset, offset + chunkSize);
    const bytes = new Uint8Array(slice.length);

    for (let index = 0; index < slice.length; index += 1) {
      bytes[index] = slice.charCodeAt(index);
    }

    chunks.push(bytes);
  }

  return new Blob(chunks, { type: mimeType });
}

export async function exportRecordingPackage(
  recordingId: string,
  options: ExportRecordingPackageOptions,
): Promise<InteractiveRecordingPackage> {
  const teacherRecording = await options.storage.loadTeacherRecording(recordingId);

  if (!teacherRecording) {
    throw new Error('Teacher recording was not found for export.');
  }

  const recordingMediaMetadata = teacherRecording.mediaAssets ?? [];
  const mediaAssets: InteractiveRecordingPackageMediaAsset[] = [];

  for (const metadata of recordingMediaMetadata) {
    const loadedAsset = await options.storage.loadMediaAsset(metadata.id);
    const assetMetadata = getRecordingMediaAssetMetadata(loadedAsset ?? metadata);

    mediaAssets.push({
      metadata: assetMetadata,
      blob: loadedAsset?.blob,
    });
  }

  const learnerDeltas = options.includeLearnerDeltas
    ? await options.storage.loadLearnerDeltas({
        lessonId: teacherRecording.lessonId,
        teacherRecordingId: teacherRecording.id,
        teacherRecordingVersion: teacherRecording.version,
        ...options.learnerDeltaQuery,
      })
    : undefined;

  return validateRecordingPackage({
    formatVersion: SUPPORTED_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    teacherRecording,
    mediaAssets,
    learnerDeltas,
    packageMetadata: options.packageMetadata,
  });
}

export async function serializeRecordingPackage(recordingPackage: InteractiveRecordingPackage): Promise<string> {
  const validatedPackage = validateRecordingPackage(recordingPackage);
  const mediaAssets = await Promise.all(
    validatedPackage.mediaAssets.map(async (asset) => ({
      metadata: asset.metadata,
      dataBase64: asset.dataBase64 ?? (asset.blob ? await blobToBase64(asset.blob) : undefined),
    })),
  );

  return `${JSON.stringify(
    {
      ...validatedPackage,
      mediaAssets,
    },
    null,
    2,
  )}\n`;
}

export async function downloadRecordingPackage(
  recordingPackage: InteractiveRecordingPackage,
  options: DownloadRecordingPackageOptions = {},
): Promise<string> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('Recording package download requires a browser document.');
  }

  const filename = options.filename ?? `${recordingPackage.teacherRecording.id}.interactive-recording.json`;
  const serializedPackage = await serializeRecordingPackage(recordingPackage);
  const blob = new Blob([serializedPackage], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  try {
    link.href = objectUrl;
    link.download = filename;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  return filename;
}

export async function parseRecordingPackage(fileOrText: Blob | string): Promise<InteractiveRecordingPackage> {
  const text = typeof fileOrText === 'string' ? fileOrText : await fileOrText.text();

  return validateRecordingPackage(JSON.parse(text) as unknown);
}

export function validateRecordingPackage(value: unknown): InteractiveRecordingPackage {
  const candidate = assertObject(value, 'Expected interactive recording package object.');

  if (candidate.formatVersion !== SUPPORTED_FORMAT_VERSION) {
    throw new Error('Unsupported recording package formatVersion.');
  }

  if (!candidate.exportedAt || typeof candidate.exportedAt !== 'string') {
    throw new Error('Recording package exportedAt is required.');
  }

  const teacherRecording = normalizeTeacherRecording(candidate.teacherRecording);
  const rawMediaAssets = Array.isArray(candidate.mediaAssets) ? candidate.mediaAssets : [];
  const mediaAssets = rawMediaAssets
    .map((asset) => validateMediaPackageEntry(asset, teacherRecording.id))
    .filter((asset) => Boolean(asset.blob || asset.dataBase64));
  const teacherMediaAssets = teacherRecording.mediaAssets ?? mediaAssets.map((asset) => asset.metadata);

  const learnerDeltas = Array.isArray(candidate.learnerDeltas) ? candidate.learnerDeltas.map(normalizeLearnerDelta) : undefined;

  return {
    formatVersion: SUPPORTED_FORMAT_VERSION,
    exportedAt: candidate.exportedAt,
    teacherRecording: {
      ...teacherRecording,
      mediaAssets: teacherMediaAssets.length > 0 ? teacherMediaAssets : undefined,
    },
    mediaAssets,
    learnerDeltas,
    packageMetadata: normalizePackageMetadata(candidate.packageMetadata),
  };
}

export async function importRecordingPackage(
  recordingPackage: InteractiveRecordingPackage,
  target: ImportRecordingPackageTarget,
): Promise<ImportedRecordingPackageResult> {
  const validatedPackage = validateRecordingPackage(recordingPackage);
  const shouldImportAsCopy = target.importAsCopy ?? true;
  const now = (target.now ?? (() => new Date()))().toISOString();
  const sourceRecording = validatedPackage.teacherRecording;
  const recordingId = shouldImportAsCopy ? createCopyId(sourceRecording.id) : sourceRecording.id;
  const mediaIdMap = new Map<string, string>();

  const availableMediaIds = new Set(validatedPackage.mediaAssets.map((asset) => asset.metadata.id));
  const sourceMediaReferences = sourceRecording.mediaAssets ?? [];
  const missingMediaCount = sourceMediaReferences.filter((metadata) => !availableMediaIds.has(metadata.id)).length;
  const warnings = missingMediaCount > 0 ? [`${missingMediaCount} media asset(s) were skipped because package data was missing.`] : [];

  for (const asset of validatedPackage.mediaAssets) {
    mediaIdMap.set(asset.metadata.id, shouldImportAsCopy ? createCopyId(asset.metadata.id) : asset.metadata.id);
  }

  const mediaAssets: RecordingMediaAsset[] = validatedPackage.mediaAssets.map((asset) => {
    const mediaId = mediaIdMap.get(asset.metadata.id) ?? asset.metadata.id;

    return {
      ...asset.metadata,
      id: mediaId,
      recordingId,
      ownerUserId: target.importedByUserId ?? asset.metadata.ownerUserId,
      blob: asset.blob ?? base64ToBlob(asset.dataBase64 ?? '', asset.metadata.mimeType),
    };
  });
  const importedRecording: TeacherRecording = {
    ...sourceRecording,
    id: recordingId,
    mediaAssets:
      sourceMediaReferences.length > 0
        ? sourceMediaReferences
            .filter((metadata) => availableMediaIds.has(metadata.id))
            .map((metadata) => ({
              ...metadata,
              id: mediaIdMap.get(metadata.id) ?? metadata.id,
              recordingId,
              ownerUserId: target.importedByUserId ?? metadata.ownerUserId,
            }))
        : undefined,
    createdByUserId: target.importedByUserId ?? sourceRecording.createdByUserId,
    ownerUserId: target.importedByUserId ?? sourceRecording.ownerUserId,
    publishedByUserId: target.mode === 'published' ? target.importedByUserId ?? sourceRecording.publishedByUserId : undefined,
    publishedAt: target.mode === 'published' ? now : undefined,
  };

  if (target.mode === 'published') {
    await target.storage.saveTeacherRecording(importedRecording);
  } else {
    await target.storage.saveTeacherRecordingDraft(importedRecording);
  }

  for (const asset of mediaAssets) {
    await target.storage.saveMediaAsset(asset);
  }

  const learnerDeltas = target.includeLearnerDeltas
    ? (validatedPackage.learnerDeltas ?? []).map((delta) => ({
        ...delta,
        id: shouldImportAsCopy ? createCopyId(delta.id) : delta.id,
        userId: target.importedByUserId ?? delta.userId,
        teacherRecordingId: importedRecording.id,
      }))
    : [];

  for (const delta of learnerDeltas) {
    await target.storage.saveLearnerDelta(delta);
  }

  return {
    teacherRecording: importedRecording,
    mediaAssets,
    learnerDeltas,
    warnings,
  };
}
