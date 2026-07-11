import type { WhiteboardScene } from './whiteboard.js';

export type PresentationMode = 'hidden' | 'minimized' | 'focused';
export const WORKSPACE_EDITOR_SURFACE_ID = 'workspace-editor';
export type PresentationCompositionPreset = 'focus' | 'side-by-side' | 'stage-with-sidecar';
export type CameraAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type CameraSize = 'small' | 'medium' | 'large';

export interface PresentationComposition {
  preset: PresentationCompositionPreset;
  primarySurfaceId: string;
  secondarySurfaceId?: string;
  splitRatio: number;
  cameraAnchor: CameraAnchor;
  cameraSize: CameraSize;
}

export type PresentationResourceKind = 'preview' | 'slide' | 'deck' | 'explanation' | 'camera' | 'whiteboard';

export interface PreviewPresentationResource {
  id: string;
  kind: 'preview';
  title: string;
}
export interface ExplanationPresentationResource {
  id: string;
  kind: 'explanation';
  title: string;
}
export interface CameraPresentationResource {
  id: string;
  kind: 'camera';
  title: string;
}
export interface WhiteboardPresentationResource {
  id: string;
  kind: 'whiteboard';
  title: string;
  initialScene: WhiteboardScene;
}

/** @deprecated Kept so recordings made before deck support remain playable. */
export interface SlidePresentationResource {
  id: string;
  kind: 'slide';
  title: string;
  eyebrow?: string;
  body: string;
  accent?: string;
}

export type PresentationSlideElement =
  | { id: string; kind: 'heading' | 'paragraph' | 'bullet'; text: string; revealStep: number }
  | { id: string; kind: 'code'; code: string; language?: string; revealStep: number }
  | { id: string; kind: 'image'; src: string; alt: string; caption?: string; revealStep: number };

export interface PresentationSlide {
  id: string;
  title: string;
  eyebrow?: string;
  elements: PresentationSlideElement[];
}

export interface DeckPresentationResource {
  id: string;
  kind: 'deck';
  title: string;
  slides: PresentationSlide[];
  accent?: string;
}

export type PresentationResource =
  | PreviewPresentationResource
  | ExplanationPresentationResource
  | CameraPresentationResource
  | WhiteboardPresentationResource
  | SlidePresentationResource
  | DeckPresentationResource;
export interface DeckPlaybackState {
  slideIndex: number;
  revealedStep: number;
}

export interface PresentationLayout {
  resources: Record<string, PresentationMode>;
  focusedResourceId?: string;
  deckStates?: Record<string, DeckPlaybackState>;
  composition?: PresentationComposition;
}

export interface PresentationChangedPayload {
  layout: PresentationLayout;
}

export function createPresentationLayout(
  resources: PresentationResource[],
  initialMode: PresentationMode = 'hidden',
): PresentationLayout {
  return normalizePresentationLayout(resources, {
    resources: Object.fromEntries(resources.map((resource) => [resource.id, initialMode])),
  });
}

export function normalizePresentationLayout(
  resources: PresentationResource[],
  layout: PresentationLayout | undefined,
): PresentationLayout {
  const resourceIds = new Set(resources.map((resource) => resource.id));
  const normalized: PresentationLayout = { resources: {}, deckStates: {} };
  let focusedResourceId: string | undefined;

  for (const resource of resources) {
    const requestedMode = layout?.resources[resource.id];
    const mode: PresentationMode =
      requestedMode === 'minimized' || requestedMode === 'focused' ? requestedMode : 'hidden';
    if (mode === 'focused' && !focusedResourceId) {
      focusedResourceId = resource.id;
      normalized.resources[resource.id] = 'focused';
    } else {
      normalized.resources[resource.id] = mode === 'focused' ? 'minimized' : mode;
    }

    if (resource.kind === 'deck') {
      normalized.deckStates![resource.id] = normalizeDeckState(resource, layout?.deckStates?.[resource.id]);
    }
  }

  const requestedFocus = layout?.focusedResourceId;
  if (requestedFocus && resourceIds.has(requestedFocus) && normalized.resources[requestedFocus] !== 'hidden') {
    if (focusedResourceId && focusedResourceId !== requestedFocus)
      normalized.resources[focusedResourceId] = 'minimized';
    focusedResourceId = requestedFocus;
    normalized.resources[requestedFocus] = 'focused';
  }
  if (focusedResourceId) normalized.focusedResourceId = focusedResourceId;
  if (layout?.composition)
    normalized.composition = normalizePresentationComposition(resources, layout, layout.composition);
  return normalized;
}

export function resolvePresentationComposition(
  resources: PresentationResource[],
  layout: PresentationLayout,
): PresentationComposition {
  return normalizePresentationComposition(resources, layout, layout.composition);
}

export function normalizePresentationComposition(
  resources: PresentationResource[],
  layout: PresentationLayout,
  composition?: Partial<PresentationComposition>,
): PresentationComposition {
  const surfaceIds = new Set([
    WORKSPACE_EDITOR_SURFACE_ID,
    ...resources.filter((resource) => resource.kind !== 'camera').map((resource) => resource.id),
  ]);
  const legacyFocused =
    layout.focusedResourceId && surfaceIds.has(layout.focusedResourceId) ? layout.focusedResourceId : undefined;
  const legacySecondary = resources.find(
    (resource) => resource.kind !== 'camera' && layout.resources[resource.id] === 'minimized',
  )?.id;
  const primarySurfaceId =
    composition?.primarySurfaceId && surfaceIds.has(composition.primarySurfaceId)
      ? composition.primarySurfaceId
      : (legacyFocused ?? WORKSPACE_EDITOR_SURFACE_ID);
  const requestedSecondary =
    composition?.secondarySurfaceId &&
    surfaceIds.has(composition.secondarySurfaceId) &&
    composition.secondarySurfaceId !== primarySurfaceId
      ? composition.secondarySurfaceId
      : undefined;
  const secondarySurfaceId = requestedSecondary ?? (legacySecondary !== primarySurfaceId ? legacySecondary : undefined);
  const preset =
    composition?.preset === 'focus' ||
    composition?.preset === 'side-by-side' ||
    composition?.preset === 'stage-with-sidecar'
      ? composition.preset
      : legacyFocused
        ? 'focus'
        : secondarySurfaceId
          ? 'stage-with-sidecar'
          : 'focus';
  const cameraAnchor: CameraAnchor =
    composition?.cameraAnchor === 'top-left' ||
    composition?.cameraAnchor === 'top-right' ||
    composition?.cameraAnchor === 'bottom-left'
      ? composition.cameraAnchor
      : 'bottom-right';
  const cameraSize: CameraSize =
    composition?.cameraSize === 'small' || composition?.cameraSize === 'large' ? composition.cameraSize : 'medium';
  const ratio =
    typeof composition?.splitRatio === 'number' && Number.isFinite(composition.splitRatio)
      ? composition.splitRatio
      : preset === 'side-by-side'
        ? 0.5
        : 0.7;
  return {
    preset,
    primarySurfaceId,
    ...(secondarySurfaceId ? { secondarySurfaceId } : {}),
    splitRatio: Math.round(Math.min(0.8, Math.max(0.5, ratio)) * 100) / 100,
    cameraAnchor,
    cameraSize,
  };
}

export function setPresentationComposition(
  resources: PresentationResource[],
  layout: PresentationLayout,
  update: Partial<PresentationComposition>,
): PresentationLayout {
  const current = resolvePresentationComposition(resources, layout);
  const composition = normalizePresentationComposition(resources, layout, { ...current, ...update });
  const nextResources = { ...layout.resources };
  for (const resource of resources) {
    if (resource.kind === 'camera') continue;
    if (resource.id === composition.primarySurfaceId) nextResources[resource.id] = 'focused';
    else if (resource.id === composition.secondarySurfaceId || nextResources[resource.id] !== 'hidden')
      nextResources[resource.id] = 'minimized';
  }
  return normalizePresentationLayout(resources, {
    resources: nextResources,
    deckStates: layout.deckStates,
    focusedResourceId:
      composition.primarySurfaceId === WORKSPACE_EDITOR_SURFACE_ID ? undefined : composition.primarySurfaceId,
    composition,
  });
}

export function movePresentationSurface(
  resources: PresentationResource[],
  layout: PresentationLayout,
  surfaceId: string,
  target: 'primary' | 'secondary' | 'tray',
): PresentationLayout {
  const current = resolvePresentationComposition(resources, layout);
  const valid =
    surfaceId === WORKSPACE_EDITOR_SURFACE_ID ||
    resources.some((resource) => resource.id === surfaceId && resource.kind !== 'camera');
  if (!valid) return normalizePresentationLayout(resources, layout);
  let primarySurfaceId = current.primarySurfaceId;
  let secondarySurfaceId = current.secondarySurfaceId;
  if (target === 'primary') {
    if (surfaceId === secondarySurfaceId) secondarySurfaceId = primarySurfaceId;
    primarySurfaceId = surfaceId;
  } else if (target === 'secondary') {
    if (surfaceId === primarySurfaceId) primarySurfaceId = secondarySurfaceId ?? WORKSPACE_EDITOR_SURFACE_ID;
    secondarySurfaceId = surfaceId === primarySurfaceId ? undefined : surfaceId;
  } else {
    if (surfaceId === primarySurfaceId) primarySurfaceId = secondarySurfaceId ?? WORKSPACE_EDITOR_SURFACE_ID;
    if (surfaceId === secondarySurfaceId) secondarySurfaceId = undefined;
  }
  const next = setPresentationComposition(resources, layout, {
    ...current,
    primarySurfaceId,
    secondarySurfaceId,
    preset:
      target === 'primary' && current.preset === 'focus'
        ? 'focus'
        : secondarySurfaceId
          ? current.preset === 'focus'
            ? 'stage-with-sidecar'
            : current.preset
          : 'focus',
  });
  if (surfaceId !== WORKSPACE_EDITOR_SURFACE_ID && target === 'tray') {
    return normalizePresentationLayout(resources, {
      ...next,
      resources: { ...next.resources, [surfaceId]: 'minimized' },
      composition: next.composition,
    });
  }
  return next;
}

export function normalizeDeckState(deck: DeckPresentationResource, state?: DeckPlaybackState): DeckPlaybackState {
  const lastSlide = Math.max(0, deck.slides.length - 1);
  const slideIndex = Math.min(lastSlide, Math.max(0, Math.round(state?.slideIndex ?? 0)));
  const maxStep = getSlideMaxRevealStep(deck.slides[slideIndex]);
  return { slideIndex, revealedStep: Math.min(maxStep, Math.max(0, Math.round(state?.revealedStep ?? 0))) };
}

export function getSlideMaxRevealStep(slide?: PresentationSlide): number {
  return Math.max(0, ...(slide?.elements.map((element) => element.revealStep) ?? [0]));
}

export function setPresentationMode(
  resources: PresentationResource[],
  layout: PresentationLayout,
  resourceId: string,
  mode: PresentationMode,
): PresentationLayout {
  if (!resources.some((resource) => resource.id === resourceId)) return normalizePresentationLayout(resources, layout);
  if (layout.composition && !resources.some((resource) => resource.id === resourceId && resource.kind === 'camera')) {
    if (mode === 'focused')
      return setPresentationComposition(resources, movePresentationSurface(resources, layout, resourceId, 'primary'), {
        preset: 'focus',
      });
    if (mode === 'minimized' && layout.composition.primarySurfaceId === resourceId)
      return movePresentationSurface(resources, layout, resourceId, 'tray');
    if (mode === 'hidden') {
      const moved = movePresentationSurface(resources, layout, resourceId, 'tray');
      return normalizePresentationLayout(resources, {
        ...moved,
        resources: { ...moved.resources, [resourceId]: 'hidden' },
        composition: moved.composition,
      });
    }
  }
  const nextResources = { ...layout.resources };
  if (mode === 'focused') {
    for (const [id, currentMode] of Object.entries(nextResources))
      if (currentMode === 'focused' && id !== resourceId) nextResources[id] = 'minimized';
  }
  nextResources[resourceId] = mode;
  return normalizePresentationLayout(resources, {
    resources: nextResources,
    deckStates: layout.deckStates,
    focusedResourceId:
      mode === 'focused' ? resourceId : layout.focusedResourceId === resourceId ? undefined : layout.focusedResourceId,
  });
}

export function setDeckProgress(
  resources: PresentationResource[],
  layout: PresentationLayout,
  deckId: string,
  progress: Partial<DeckPlaybackState>,
): PresentationLayout {
  const deck = resources.find(
    (resource): resource is DeckPresentationResource => resource.id === deckId && resource.kind === 'deck',
  );
  if (!deck) return normalizePresentationLayout(resources, layout);
  const current = normalizeDeckState(deck, layout.deckStates?.[deckId]);
  return normalizePresentationLayout(resources, {
    ...layout,
    deckStates: { ...layout.deckStates, [deckId]: normalizeDeckState(deck, { ...current, ...progress }) },
  });
}

export function stepDeckReveal(
  resources: PresentationResource[],
  layout: PresentationLayout,
  deckId: string,
  direction: 1 | -1,
): PresentationLayout {
  const deck = resources.find(
    (resource): resource is DeckPresentationResource => resource.id === deckId && resource.kind === 'deck',
  );
  if (!deck) return normalizePresentationLayout(resources, layout);
  const current = normalizeDeckState(deck, layout.deckStates?.[deckId]);
  const maxStep = getSlideMaxRevealStep(deck.slides[current.slideIndex]);
  if (direction === 1 && current.revealedStep >= maxStep && current.slideIndex < deck.slides.length - 1) {
    return setDeckProgress(resources, layout, deckId, { slideIndex: current.slideIndex + 1, revealedStep: 0 });
  }
  if (direction === -1 && current.revealedStep === 0 && current.slideIndex > 0) {
    const previousIndex = current.slideIndex - 1;
    return setDeckProgress(resources, layout, deckId, {
      slideIndex: previousIndex,
      revealedStep: getSlideMaxRevealStep(deck.slides[previousIndex]),
    });
  }
  return setDeckProgress(resources, layout, deckId, { revealedStep: current.revealedStep + direction });
}

export function stepDeckSlide(
  resources: PresentationResource[],
  layout: PresentationLayout,
  deckId: string,
  direction: 1 | -1,
): PresentationLayout {
  const current = layout.deckStates?.[deckId] ?? { slideIndex: 0, revealedStep: 0 };
  return setDeckProgress(resources, layout, deckId, { slideIndex: current.slideIndex + direction, revealedStep: 0 });
}

export function clonePresentationLayout(layout: PresentationLayout): PresentationLayout {
  return {
    resources: { ...layout.resources },
    ...(layout.focusedResourceId ? { focusedResourceId: layout.focusedResourceId } : {}),
    deckStates: Object.fromEntries(Object.entries(layout.deckStates ?? {}).map(([id, state]) => [id, { ...state }])),
    ...(layout.composition ? { composition: { ...layout.composition } } : {}),
  };
}
