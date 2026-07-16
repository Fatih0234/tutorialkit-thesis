import type { EditorSelectionChangedPayload } from './types.js';

export function normalizeEditorSelectionPayload(value: unknown): EditorSelectionChangedPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {throw new Error('Editor selection payload must be an object.');}
  const candidate = value as Partial<EditorSelectionChangedPayload>;
  if (typeof candidate.anchor !== 'number' || !Number.isSafeInteger(candidate.anchor) || candidate.anchor < 0) {throw new Error('Editor selection anchor must be a non-negative integer.');}
  if (typeof candidate.head !== 'number' || !Number.isSafeInteger(candidate.head) || candidate.head < 0) {throw new Error('Editor selection head must be a non-negative integer.');}
  return { anchor: candidate.anchor, head: candidate.head };
}

export function clampEditorSelection(selection: EditorSelectionChangedPayload, documentLength: number): EditorSelectionChangedPayload {
  const length = Math.max(0, Math.floor(documentLength));
  return {
    anchor: Math.min(length, selection.anchor),
    head: Math.min(length, selection.head),
  };
}
