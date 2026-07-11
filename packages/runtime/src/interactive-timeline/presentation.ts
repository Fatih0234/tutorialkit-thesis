import type { WhiteboardScene } from './whiteboard.js';

export type PresentationMode = 'hidden' | 'minimized' | 'focused';
export type PresentationResourceKind = 'preview' | 'slide' | 'deck' | 'explanation' | 'camera' | 'whiteboard';
export type PresentationWindowSide = 'left' | 'right';

export interface PreviewPresentationResource { id: string; kind: 'preview'; title: string; }
export interface ExplanationPresentationResource { id: string; kind: 'explanation'; title: string; }
export interface CameraPresentationResource { id: string; kind: 'camera'; title: string; }
export interface WhiteboardPresentationResource { id: string; kind: 'whiteboard'; title: string; initialScene: WhiteboardScene; }

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

export type PresentationResource = PreviewPresentationResource | ExplanationPresentationResource | CameraPresentationResource | WhiteboardPresentationResource | SlidePresentationResource | DeckPresentationResource;
export interface DeckPlaybackState { slideIndex: number; revealedStep: number; }

export interface PresentationLayout {
  resources: Record<string, PresentationMode>;
  focusedResourceId?: string;
  deckStates?: Record<string, DeckPlaybackState>;
  frontmostBySide?: Partial<Record<PresentationWindowSide, string>>;
}

export interface PresentationChangedPayload { layout: PresentationLayout; }

export function createPresentationLayout(resources: PresentationResource[], initialMode: PresentationMode = 'hidden'): PresentationLayout {
  return normalizePresentationLayout(resources, {
    resources: Object.fromEntries(resources.map((resource) => [resource.id, initialMode])),
  });
}

export function normalizePresentationLayout(resources: PresentationResource[], layout: PresentationLayout | undefined): PresentationLayout {
  const resourceIds = new Set(resources.map((resource) => resource.id));
  const normalized: PresentationLayout = { resources: {}, deckStates: {} };
  let focusedResourceId: string | undefined;

  for (const resource of resources) {
    const requestedMode = layout?.resources[resource.id];
    const mode: PresentationMode = requestedMode === 'minimized' || requestedMode === 'focused' ? requestedMode : 'hidden';
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
    if (focusedResourceId && focusedResourceId !== requestedFocus) normalized.resources[focusedResourceId] = 'minimized';
    focusedResourceId = requestedFocus;
    normalized.resources[requestedFocus] = 'focused';
  }
  if (focusedResourceId) normalized.focusedResourceId = focusedResourceId;
  const frontmostBySide: Partial<Record<PresentationWindowSide, string>> = {};
  for (const side of ['left', 'right'] as const) {
    const requestedId = layout?.frontmostBySide?.[side];
    const fallbackId = [...resources].reverse().find((resource) => presentationWindowSide(resource) === side && normalized.resources[resource.id] === 'minimized')?.id;
    const frontmostId = requestedId && resources.some((resource) => resource.id === requestedId && presentationWindowSide(resource) === side && normalized.resources[resource.id] === 'minimized') ? requestedId : fallbackId;
    if (frontmostId) frontmostBySide[side] = frontmostId;
  }
  if (Object.keys(frontmostBySide).length) normalized.frontmostBySide = frontmostBySide;
  return normalized;
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

export function setPresentationMode(resources: PresentationResource[], layout: PresentationLayout, resourceId: string, mode: PresentationMode): PresentationLayout {
  if (!resources.some((resource) => resource.id === resourceId)) return normalizePresentationLayout(resources, layout);
  const nextResources = { ...layout.resources };
  if (mode === 'focused') {
    for (const [id, currentMode] of Object.entries(nextResources)) if (currentMode === 'focused' && id !== resourceId) nextResources[id] = 'minimized';
  }
  nextResources[resourceId] = mode;
  const resource = resources.find((item) => item.id === resourceId)!;
  const side = presentationWindowSide(resource);
  const frontmostBySide = { ...layout.frontmostBySide };
  if (side && mode !== 'hidden') frontmostBySide[side] = resourceId;
  if (side && mode === 'hidden' && frontmostBySide[side] === resourceId) delete frontmostBySide[side];
  return normalizePresentationLayout(resources, {
    resources: nextResources,
    deckStates: layout.deckStates,
    frontmostBySide,
    focusedResourceId: mode === 'focused' ? resourceId : layout.focusedResourceId === resourceId ? undefined : layout.focusedResourceId,
  });
}

export function setDeckProgress(resources: PresentationResource[], layout: PresentationLayout, deckId: string, progress: Partial<DeckPlaybackState>): PresentationLayout {
  const deck = resources.find((resource): resource is DeckPresentationResource => resource.id === deckId && resource.kind === 'deck');
  if (!deck) return normalizePresentationLayout(resources, layout);
  const current = normalizeDeckState(deck, layout.deckStates?.[deckId]);
  return normalizePresentationLayout(resources, {
    ...layout,
    deckStates: { ...layout.deckStates, [deckId]: normalizeDeckState(deck, { ...current, ...progress }) },
  });
}

export function stepDeckReveal(resources: PresentationResource[], layout: PresentationLayout, deckId: string, direction: 1 | -1): PresentationLayout {
  const deck = resources.find((resource): resource is DeckPresentationResource => resource.id === deckId && resource.kind === 'deck');
  if (!deck) return normalizePresentationLayout(resources, layout);
  const current = normalizeDeckState(deck, layout.deckStates?.[deckId]);
  const maxStep = getSlideMaxRevealStep(deck.slides[current.slideIndex]);
  if (direction === 1 && current.revealedStep >= maxStep && current.slideIndex < deck.slides.length - 1) {
    return setDeckProgress(resources, layout, deckId, { slideIndex: current.slideIndex + 1, revealedStep: 0 });
  }
  if (direction === -1 && current.revealedStep === 0 && current.slideIndex > 0) {
    const previousIndex = current.slideIndex - 1;
    return setDeckProgress(resources, layout, deckId, { slideIndex: previousIndex, revealedStep: getSlideMaxRevealStep(deck.slides[previousIndex]) });
  }
  return setDeckProgress(resources, layout, deckId, { revealedStep: current.revealedStep + direction });
}

export function stepDeckSlide(resources: PresentationResource[], layout: PresentationLayout, deckId: string, direction: 1 | -1): PresentationLayout {
  const current = layout.deckStates?.[deckId] ?? { slideIndex: 0, revealedStep: 0 };
  return setDeckProgress(resources, layout, deckId, { slideIndex: current.slideIndex + direction, revealedStep: 0 });
}

export function presentationWindowSide(resource: PresentationResource): PresentationWindowSide | undefined {
  if (resource.kind === 'camera') return undefined;
  return resource.kind === 'preview' ? 'right' : 'left';
}

export function clonePresentationLayout(layout: PresentationLayout): PresentationLayout {
  return {
    resources: { ...layout.resources },
    ...(layout.focusedResourceId ? { focusedResourceId: layout.focusedResourceId } : {}),
    deckStates: Object.fromEntries(Object.entries(layout.deckStates ?? {}).map(([id, state]) => [id, { ...state }])),
    ...(layout.frontmostBySide ? { frontmostBySide: { ...layout.frontmostBySide } } : {}),
  };
}
