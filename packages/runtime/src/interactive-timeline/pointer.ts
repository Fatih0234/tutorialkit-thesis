import { normalizePath } from './path.js';
import type { TeacherPointerAnchor, TeacherPointerChangedPayload, TeacherPointerClickedPayload, TeacherRecording } from './types.js';

export const TEACHER_POINTER_BRIDGE_CHANNEL = 'tutorialkit:pointer-bridge';
export const TEACHER_POINTER_BRIDGE_VERSION = 1;
export const HIDDEN_TEACHER_POINTER: TeacherPointerChangedPayload = {
  surface: 'workspace',
  x: 0,
  y: 0,
  visible: false,
  coordinateSpaceVersion: 2,
};

export function normalizeTeacherPointerPayload(value: unknown): TeacherPointerChangedPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Pointer event payload must be an object.');
  const candidate = value as Partial<TeacherPointerChangedPayload>;
  if (candidate.surface !== 'experience' && candidate.surface !== 'workspace' && candidate.surface !== 'preview') throw new Error('Pointer event surface is invalid.');
  if (typeof candidate.x !== 'number' || !Number.isFinite(candidate.x) || candidate.x < 0 || candidate.x > 1) throw new Error('Pointer event x must be between 0 and 1.');
  if (typeof candidate.y !== 'number' || !Number.isFinite(candidate.y) || candidate.y < 0 || candidate.y > 1) throw new Error('Pointer event y must be between 0 and 1.');
  if (typeof candidate.visible !== 'boolean') throw new Error('Pointer event visible must be a boolean.');
  if (candidate.coordinateSpaceVersion !== undefined && candidate.coordinateSpaceVersion !== 2 && candidate.coordinateSpaceVersion !== 3) throw new Error('Pointer coordinate-space version is invalid.');
  const anchor = candidate.coordinateSpaceVersion === 3 && candidate.anchor ? normalizeTeacherPointerAnchor(candidate.anchor) : undefined;
  return { surface: candidate.surface, x: candidate.x, y: candidate.y, visible: candidate.visible, ...(candidate.coordinateSpaceVersion ? { coordinateSpaceVersion: candidate.coordinateSpaceVersion } : {}), ...(anchor ? { anchor } : {}) };
}

export function normalizeTeacherPointerClickPayload(value: unknown): TeacherPointerClickedPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Pointer click payload must be an object.');
  const candidate = value as Partial<TeacherPointerClickedPayload>;
  const position = normalizeTeacherPointerPayload({ ...candidate, visible: true });
  if (candidate.button !== 'left' && candidate.button !== 'right') throw new Error('Pointer click button is invalid.');
  return { surface: position.surface, x: position.x, y: position.y, button: candidate.button, ...(position.coordinateSpaceVersion ? { coordinateSpaceVersion: position.coordinateSpaceVersion } : {}), ...(position.anchor ? { anchor: position.anchor } : {}) };
}

function normalizeTeacherPointerAnchor(value: unknown): TeacherPointerAnchor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Pointer anchor must be an object.');
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'editor') {
    if (typeof candidate.filePath !== 'string') throw new Error('Editor pointer anchor filePath is required.');
    if (typeof candidate.documentOffset !== 'number' || !Number.isSafeInteger(candidate.documentOffset) || candidate.documentOffset < 0) throw new Error('Editor pointer documentOffset is invalid.');
    if (typeof candidate.offsetX !== 'number' || !Number.isFinite(candidate.offsetX) || typeof candidate.offsetY !== 'number' || !Number.isFinite(candidate.offsetY)) throw new Error('Editor pointer offsets are invalid.');
    return { kind: 'editor', filePath: normalizePath(candidate.filePath), documentOffset: candidate.documentOffset, offsetX: candidate.offsetX, offsetY: candidate.offsetY };
  }
  if (candidate.kind === 'element') {
    if (typeof candidate.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,160}$/.test(candidate.id)) throw new Error('Element pointer anchor id is invalid.');
    if (typeof candidate.xWithinElement !== 'number' || !Number.isFinite(candidate.xWithinElement) || candidate.xWithinElement < 0 || candidate.xWithinElement > 1 || typeof candidate.yWithinElement !== 'number' || !Number.isFinite(candidate.yWithinElement) || candidate.yWithinElement < 0 || candidate.yWithinElement > 1) throw new Error('Element pointer anchor position is invalid.');
    return { kind: 'element', id: candidate.id, xWithinElement: candidate.xWithinElement, yWithinElement: candidate.yWithinElement };
  }
  throw new Error('Pointer anchor kind is invalid.');
}

export function materializeTeacherPointer(recording: TeacherRecording, untilMs: number): TeacherPointerChangedPayload {
  let pointer = HIDDEN_TEACHER_POINTER;
  for (const event of [...recording.events].sort((a, b) => a.tMs === b.tMs ? a.seq - b.seq : a.tMs - b.tMs)) {
    if (event.tMs > untilMs) break;
    if (event.type === 'pointer.changed') pointer = normalizeTeacherPointerPayload(event.payload);
    if (event.type === 'pointer.clicked') pointer = { ...normalizeTeacherPointerClickPayload(event.payload), visible: true };
  }
  return { ...pointer };
}
