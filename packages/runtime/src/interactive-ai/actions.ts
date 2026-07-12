import { normalizePath } from '../interactive-timeline/path.js';
import type { AiTutorAction } from './types.js';

export function normalizeAiAction(action: AiTutorAction): AiTutorAction {
  if (action.type === 'seek-lecture') {
    return { ...action, timestampMs: Math.max(0, Math.round(action.timestampMs)) };
  }

  if (action.type === 'open-file') {
    return { ...action, filePath: normalizePath(action.filePath) };
  }

  if (action.type === 'highlight-code') {
    return {
      ...action,
      filePath: normalizePath(action.filePath),
      startLine: Math.max(1, Math.floor(action.startLine)),
      endLine: Math.max(1, Math.floor(action.endLine)),
    };
  }

  return { ...action, filePath: action.filePath ? normalizePath(action.filePath) : null };
}
export function validateAiAction(action: AiTutorAction, files: Record<string, string>, durationMs: number): boolean {
  const normalized = normalizeAiAction(action);

  if (normalized.type === 'seek-lecture') {
    return normalized.timestampMs <= Math.max(0, durationMs);
  }

  if (
    normalized.type === 'open-file' ||
    normalized.type === 'highlight-code' ||
    normalized.type === 'show-workspace-diff'
  ) {
    return normalized.filePath === null || Object.prototype.hasOwnProperty.call(files, normalized.filePath);
  }

  return false;
}
export function nextHintLevel(level: 1 | 2 | 3 | 4 | null): 1 | 2 | 3 | 4 {
  return level === null ? 1 : (Math.min(4, level + 1) as 1 | 2 | 3 | 4);
}
