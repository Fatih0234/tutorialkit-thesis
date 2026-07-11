export type PresentationMode = 'hidden' | 'minimized' | 'focused';
export type PresentationResourceKind = 'preview' | 'slide' | 'explanation';

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

export interface SlidePresentationResource {
  id: string;
  kind: 'slide';
  title: string;
  eyebrow?: string;
  body: string;
  accent?: string;
}

export type PresentationResource = PreviewPresentationResource | ExplanationPresentationResource | SlidePresentationResource;

export interface PresentationLayout {
  resources: Record<string, PresentationMode>;
  focusedResourceId?: string;
}

export interface PresentationChangedPayload {
  layout: PresentationLayout;
}

export function createPresentationLayout(
  resources: PresentationResource[],
  initialMode: PresentationMode = 'hidden',
): PresentationLayout {
  return normalizePresentationLayout(
    resources,
    { resources: Object.fromEntries(resources.map((resource) => [resource.id, initialMode])) },
  );
}

export function normalizePresentationLayout(
  resources: PresentationResource[],
  layout: PresentationLayout | undefined,
): PresentationLayout {
  const resourceIds = new Set(resources.map((resource) => resource.id));
  const normalized: PresentationLayout = { resources: {} };
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
  }

  const requestedFocus = layout?.focusedResourceId;

  if (requestedFocus && resourceIds.has(requestedFocus) && normalized.resources[requestedFocus] !== 'hidden') {
    if (focusedResourceId && focusedResourceId !== requestedFocus) {
      normalized.resources[focusedResourceId] = 'minimized';
    }

    focusedResourceId = requestedFocus;
    normalized.resources[requestedFocus] = 'focused';
  }

  if (focusedResourceId) {
    normalized.focusedResourceId = focusedResourceId;
  }

  return normalized;
}

export function setPresentationMode(
  resources: PresentationResource[],
  layout: PresentationLayout,
  resourceId: string,
  mode: PresentationMode,
): PresentationLayout {
  if (!resources.some((resource) => resource.id === resourceId)) {
    return normalizePresentationLayout(resources, layout);
  }

  const nextResources = { ...layout.resources };

  if (mode === 'focused') {
    for (const [id, currentMode] of Object.entries(nextResources)) {
      if (currentMode === 'focused' && id !== resourceId) {
        nextResources[id] = 'minimized';
      }
    }
  }

  nextResources[resourceId] = mode;

  return normalizePresentationLayout(resources, {
    resources: nextResources,
    focusedResourceId: mode === 'focused' ? resourceId : layout.focusedResourceId === resourceId ? undefined : layout.focusedResourceId,
  });
}

export function clonePresentationLayout(layout: PresentationLayout): PresentationLayout {
  return {
    resources: { ...layout.resources },
    ...(layout.focusedResourceId ? { focusedResourceId: layout.focusedResourceId } : {}),
  };
}
