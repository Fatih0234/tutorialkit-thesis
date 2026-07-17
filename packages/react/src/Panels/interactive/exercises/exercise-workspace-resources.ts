import {
  createPresentationLayout,
  type PresentationLayout,
  type PresentationResource,
} from '@tutorialkit/runtime';

export function getExercisePresentationResources(
  resources: PresentationResource[],
  hasWebPreview: boolean,
): PresentationResource[] {
  return hasWebPreview ? resources.filter((resource) => resource.kind === 'preview') : [];
}

export function createExercisePresentationLayout(resources: PresentationResource[]): PresentationLayout {
  return createPresentationLayout(resources);
}
