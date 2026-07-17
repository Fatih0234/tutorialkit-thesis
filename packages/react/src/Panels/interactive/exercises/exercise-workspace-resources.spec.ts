import type { PresentationResource } from '@tutorialkit/runtime';
import { describe, expect, it } from 'vitest';
import {
  createExercisePresentationLayout,
  getExercisePresentationResources,
} from './exercise-workspace-resources.js';

const resources: PresentationResource[] = [
  { id: 'preview', kind: 'preview', title: 'Website Preview' },
  { id: 'explanation', kind: 'explanation', title: 'Lesson Explanation' },
  { id: 'whiteboard', kind: 'whiteboard', title: 'Whiteboard', initialScene: { elements: [] } },
  { id: 'camera', kind: 'camera', title: 'Camera' },
];

describe('exercise workspace resources', () => {
  it('keeps only the website preview in an independent layout', () => {
    const exerciseResources = getExercisePresentationResources(resources, true);
    const layout = createExercisePresentationLayout(exerciseResources);

    expect(exerciseResources.map((resource) => resource.kind)).toEqual(['preview']);
    expect(layout.resources).toEqual({ preview: 'hidden' });
  });

  it('provides no presentation resources when web preview is unavailable', () => {
    const exerciseResources = getExercisePresentationResources(resources, false);

    expect(exerciseResources).toEqual([]);
    expect(createExercisePresentationLayout(exerciseResources).resources).toEqual({});
  });
});
