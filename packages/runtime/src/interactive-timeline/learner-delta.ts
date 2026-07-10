import type { FilesSnapshot, LearnerDelta } from './types.js';
import { normalizeFiles, normalizePath } from './path.js';

export interface FilesDiff {
  addedOrModified: FilesSnapshot;
  removed: string[];
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
