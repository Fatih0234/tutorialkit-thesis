import type { FilesSnapshot, LearnerDelta, TeacherRecording } from './types.js';
import { normalizeFiles, normalizePath } from './path.js';

export interface FilesDiff {
  addedOrModified: FilesSnapshot;
  removed: string[];
}

export interface LearnerDeltaConflictEvent {
  filePath: string;
  eventId: string;
  eventSeq?: number;
  teacherTimestampMs: number;
}

export interface LearnerDeltaConflictDetail {
  filePath: string;
  learnerChangedFile: true;
  teacherChangedSameFileAfterLearnerTimestamp: true;
  teacherEventId: string;
  teacherEventSeq?: number;
  teacherEventTimestampMs: number;
}

export interface LearnerDeltaConflicts {
  filePaths: string[];
  events: LearnerDeltaConflictEvent[];
  details: LearnerDeltaConflictDetail[];
}

export function diffFiles(beforeInput: FilesSnapshot, afterInput: FilesSnapshot): FilesDiff {
  const before = normalizeFiles(beforeInput);
  const after = normalizeFiles(afterInput);
  const addedOrModified: FilesSnapshot = {};
  const removed: string[] = [];

  for (const filePath of Object.keys(before)) {
    if (!(filePath in after)) {
      removed.push(filePath);
    } else if (before[filePath] !== after[filePath]) {
      addedOrModified[filePath] = after[filePath];
    }
  }

  for (const filePath of Object.keys(after)) {
    if (!(filePath in before)) {
      addedOrModified[filePath] = after[filePath];
    }
  }

  return { addedOrModified, removed };
}

export function applyLearnerDelta(baseInput: FilesSnapshot, delta: LearnerDelta): FilesSnapshot {
  const result: FilesSnapshot = { ...normalizeFiles(baseInput) };

  for (const filePath of delta.removed) {
    delete result[normalizePath(filePath)];
  }

  for (const [filePath, content] of Object.entries(delta.addedOrModified)) {
    result[normalizePath(filePath)] = content;
  }

  return result;
}

export function getLearnerDeltaConflicts(recording: TeacherRecording, delta: LearnerDelta): LearnerDeltaConflicts {
  const learnerChangedFiles = new Set([
    ...Object.keys(delta.addedOrModified).map((filePath) => normalizePath(filePath)),
    ...delta.removed.map((filePath) => normalizePath(filePath)),
  ]);
  const conflictedFiles = new Set<string>();
  const events: LearnerDeltaConflictEvent[] = [];
  const details: LearnerDeltaConflictDetail[] = [];

  if (learnerChangedFiles.size === 0) {
    return { filePaths: [], events: [], details: [] };
  }

  for (const event of recording.events) {
    if (event.type !== 'file.changed' || event.tMs <= delta.teacherTimestampMs || !event.filePath) {
      continue;
    }

    const filePath = normalizePath(event.filePath);

    if (!learnerChangedFiles.has(filePath)) {
      continue;
    }

    conflictedFiles.add(filePath);
    events.push({ filePath, eventId: event.id, eventSeq: event.seq, teacherTimestampMs: event.tMs });
    details.push({
      filePath,
      learnerChangedFile: true,
      teacherChangedSameFileAfterLearnerTimestamp: true,
      teacherEventId: event.id,
      teacherEventSeq: event.seq,
      teacherEventTimestampMs: event.tMs,
    });
  }

  const sortConflictEvents = (a: LearnerDeltaConflictEvent, b: LearnerDeltaConflictEvent) => {
    if (a.teacherTimestampMs !== b.teacherTimestampMs) {
      return a.teacherTimestampMs - b.teacherTimestampMs;
    }

    return a.filePath.localeCompare(b.filePath);
  };
  const detailToConflictEvent = (detail: LearnerDeltaConflictDetail): LearnerDeltaConflictEvent => ({
    filePath: detail.filePath,
    eventId: detail.teacherEventId,
    eventSeq: detail.teacherEventSeq,
    teacherTimestampMs: detail.teacherEventTimestampMs,
  });

  return {
    filePaths: [...conflictedFiles].sort((a, b) => a.localeCompare(b)),
    events: events.sort(sortConflictEvents),
    details: details.sort((a, b) => sortConflictEvents(detailToConflictEvent(a), detailToConflictEvent(b))),
  };
}

export function simpleHashFiles(filesInput: FilesSnapshot): string {
  const files = normalizeFiles(filesInput);
  const serialized = JSON.stringify(
    Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
  );

  let hash = 0;

  for (let i = 0; i < serialized.length; i++) {
    hash = (hash * 31 + serialized.charCodeAt(i)) | 0;
  }

  return Math.abs(hash).toString(36);
}
