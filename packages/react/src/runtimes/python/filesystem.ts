import { normalizeFiles, normalizePath, type RuntimeFileDiff } from '@tutorialkit/runtime';

export function diffRuntimeFiles(previous: Record<string, string>, current: Record<string, string>): RuntimeFileDiff {
  const before = normalizeFiles(previous);
  const after = normalizeFiles(current);
  const addedOrModified: Record<string, string> = {};
  const removed: string[] = [];

  for (const [path, value] of Object.entries(after)) {
    if (before[path] !== value) {
      addedOrModified[path] = value;
    }
  }

  for (const path of Object.keys(before)) {
    if (!(path in after)) {
      removed.push(path);
    }
  }

  return { addedOrModified, removed: removed.sort() };
}

export function toWorkspacePath(path: string): string {
  const normalized = normalizePath(path);

  if (normalized.includes('\0')) {
    throw new Error('Runtime paths cannot contain null bytes.');
  }

  const segments = normalized.split('/').filter(Boolean);

  if (segments.some((segment) => segment === '..')) {
    throw new Error(`Runtime path escapes workspace: ${path}`);
  }

  return `/workspace/${segments.join('/')}`;
}
