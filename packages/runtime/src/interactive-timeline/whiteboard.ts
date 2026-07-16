import type { TeacherRecording } from './types.js';

export const MAX_WHITEBOARD_ELEMENTS = 1_000;
export const MAX_WHITEBOARD_SCENE_BYTES = 512 * 1024;
export const MAX_WHITEBOARD_TITLE_LENGTH = 120;

export type WhiteboardJsonPrimitive = string | number | boolean | null;
export type WhiteboardJsonValue = WhiteboardJsonPrimitive | WhiteboardJsonValue[] | { [key: string]: WhiteboardJsonValue };
export type WhiteboardElementData = Record<string, WhiteboardJsonValue>;
export type WhiteboardAppStateData = Record<string, WhiteboardJsonValue>;

export interface WhiteboardScene {
  elements: readonly WhiteboardElementData[];
  appState?: WhiteboardAppStateData;
}

export interface WhiteboardSceneChangedPayload {
  resourceId: string;
  scene: WhiteboardScene;
}

const PERSISTED_APP_STATE_KEYS = new Set(['viewBackgroundColor', 'gridSize', 'gridStep', 'gridModeEnabled']);

export function createEmptyWhiteboardScene(): WhiteboardScene {
  return { elements: [] };
}

export function sanitizeWhiteboardScene(value: unknown): WhiteboardScene {
  if (!isRecord(value) || !Array.isArray(value.elements)) {throw new Error('Whiteboard scene elements must be an array.');}
  if (value.elements.length > MAX_WHITEBOARD_ELEMENTS) {throw new Error(`Whiteboard scene exceeds ${MAX_WHITEBOARD_ELEMENTS} elements.`);}

  const elements = value.elements.map((element) => sanitizeJsonRecord(element, 'Whiteboard element'));
  if (value.appState !== undefined && !isRecord(value.appState)) {throw new Error('Whiteboard appState must be an object.');}
  const appState = isRecord(value.appState)
    ? Object.fromEntries(Object.entries(value.appState).filter(([key, item]) => PERSISTED_APP_STATE_KEYS.has(key) && item !== undefined).map(([key, item]) => [key, sanitizeJsonValue(item, 'Whiteboard appState')]))
    : undefined;
  const scene: WhiteboardScene = { elements, ...(appState && Object.keys(appState).length ? { appState } : {}) };

  if (whiteboardSceneSizeBytes(scene) > MAX_WHITEBOARD_SCENE_BYTES) {
    throw new Error(`Whiteboard scene exceeds ${MAX_WHITEBOARD_SCENE_BYTES} serialized bytes.`);
  }
  return scene;
}

export function cloneWhiteboardScene(scene: WhiteboardScene): WhiteboardScene {
  return sanitizeWhiteboardScene(structuredClone(scene));
}

export function whiteboardSceneFingerprint(scene: WhiteboardScene): string {
  return JSON.stringify(sanitizeWhiteboardScene(scene));
}

export function whiteboardSceneSizeBytes(scene: WhiteboardScene): number {
  return new TextEncoder().encode(JSON.stringify(scene)).byteLength;
}

export function materializeWhiteboardScene(recording: TeacherRecording, resourceId: string, untilMs: number): WhiteboardScene {
  const resource = recording.presentationResources?.find((item) => item.kind === 'whiteboard' && item.id === resourceId);
  let scene = resource?.kind === 'whiteboard' ? cloneWhiteboardScene(resource.initialScene) : createEmptyWhiteboardScene();
  const events = [...recording.events].sort((a, b) => a.tMs === b.tMs ? a.seq - b.seq : a.tMs - b.tMs);

  for (const event of events) {
    if (event.tMs > untilMs) {break;}
    if (event.type !== 'whiteboard.scene.changed') {continue;}
    const payload = event.payload as Partial<WhiteboardSceneChangedPayload> | undefined;
    if (payload?.resourceId === resourceId && payload.scene) {scene = sanitizeWhiteboardScene(payload.scene);}
  }
  return scene;
}

function sanitizeJsonRecord(value: unknown, label: string): Record<string, WhiteboardJsonValue> {
  if (!isRecord(value)) {throw new Error(`${label} must be an object.`);}
  return sanitizeJsonValue(value, label) as Record<string, WhiteboardJsonValue>;
}

function sanitizeJsonValue(value: unknown, label: string, depth = 0): WhiteboardJsonValue {
  if (depth > 20) {throw new Error(`${label} is nested too deeply.`);}
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {return value;}
  if (typeof value === 'number' && Number.isFinite(value)) {return value;}
  if (Array.isArray(value)) {return value.map((item) => sanitizeJsonValue(item, label, depth + 1));}
  if (isRecord(value)) {return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, sanitizeJsonValue(item, label, depth + 1)]));}
  throw new Error(`${label} contains non-serializable data.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
