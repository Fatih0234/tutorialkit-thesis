import { createHash } from 'node:crypto';
import {
  normalizePath,
  materializeTeacherState,
  type AiTutorSelection,
  type TeacherRecording,
} from '@tutorialkit/runtime';

const SECRET_PATH = /(^|\/)(\.env(?:\..*)?|.*\.(?:pem|key)|id_rsa|id_ed25519)$/i;
const SECRET_TEXT =
  /(sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[^\s"']+)/gi;
export const MAX_CONTEXT_BYTES = 80 * 1024;
export const MAX_SELECTION_BYTES = 12 * 1024;
export function isSensitivePath(filePath: string) {
  return SECRET_PATH.test(normalizePath(filePath));
}
export function redactSecrets(text: string) {
  return text.replaceAll(SECRET_TEXT, '[REDACTED_SECRET]');
}
export function validateAndRedactSelection(
  selection: AiTutorSelection | null,
  learnerFiles: Record<string, string>,
  includeSelection: boolean,
): AiTutorSelection | null {
  if (!selection || !includeSelection) {
    return null;
  }

  const filePath = normalizePath(selection.filePath);

  if (isSensitivePath(filePath)) {
    throw new Error('The selected file is sensitive.');
  }

  const content = learnerFiles[filePath];

  if (typeof content !== 'string') {
    throw new Error('The selected file is not in the learner workspace.');
  }

  if (
    !Number.isInteger(selection.startLine) ||
    !Number.isInteger(selection.endLine) ||
    selection.startLine < 1 ||
    selection.endLine < selection.startLine
  ) {
    throw new Error('The selected line range is invalid.');
  }

  if (!selection.text || Buffer.byteLength(selection.text, 'utf8') > MAX_SELECTION_BYTES) {
    throw new Error('The selected code is empty or too large.');
  }

  const lines = content.split('\n');

  if (selection.endLine > lines.length) {
    throw new Error('The selected line range is outside the file.');
  }

  const declaredRange = lines.slice(selection.startLine - 1, selection.endLine).join('\n');

  if (!declaredRange.includes(selection.text)) {
    throw new Error('The selected code no longer matches the learner workspace.');
  }

  return {
    filePath,
    startLine: selection.startLine,
    endLine: selection.endLine,
    text: redactSecrets(selection.text),
  };
}

export function hashFiles(files: Record<string, string>) {
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}
export interface WorkspaceDifference {
  added: string[];
  modified: string[];
  removed: string[];
}
export function compareWorkspaces(
  teacher: Record<string, string>,
  learner: Record<string, string>,
): WorkspaceDifference {
  const added = Object.keys(learner).filter((p) => !teacher[p]);
  const removed = Object.keys(teacher).filter((p) => !learner[p]);
  const modified = Object.keys(learner).filter((p) => teacher[p] !== undefined && teacher[p] !== learner[p]);

  return { added, modified, removed };
}
export function buildTrustedContext(
  recording: TeacherRecording,
  timestampMs: number,
  learnerFiles: Record<string, string>,
) {
  const timestamp = Math.min(recording.durationMs, Math.max(0, timestampMs));
  const teacherFiles = materializeTeacherState(recording, timestamp);
  const difference = compareWorkspaces(teacherFiles, learnerFiles);
  const files: Record<string, string> = {};
  const relevant = new Set([...difference.added, ...difference.modified, ...difference.removed]);

  for (const p of Object.keys(teacherFiles)) {
    if (relevant.has(p) || Object.keys(files).length === 0) {
      if (!isSensitivePath(p)) {
        files[p] = redactSecrets(teacherFiles[p]).slice(0, 40_000);
      }
    }
  }

  return {
    timestampMs: timestamp,
    teacherFiles: files,
    learnerFiles: Object.fromEntries(
      Object.entries(learnerFiles)
        .filter(([p]) => !isSensitivePath(p))
        .map(([p, v]) => [p, redactSecrets(v).slice(0, 40_000)]),
    ),
    difference,
    teacherFilesHash: hashFiles(teacherFiles),
  };
}
export function summarizeTeacherEvents(recording: TeacherRecording, timestampMs: number) {
  return [...recording.events]
    .sort((a, b) => a.tMs - b.tMs || a.seq - b.seq)
    .filter((e) => e.tMs <= timestampMs && timestampMs - e.tMs <= 30_000)
    .slice(-20)
    .map((e) => ({ timestampMs: e.tMs, type: e.type, filePath: e.filePath ?? null }));
}
