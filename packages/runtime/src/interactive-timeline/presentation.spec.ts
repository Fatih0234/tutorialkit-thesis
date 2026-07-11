import { describe, expect, it } from 'vitest';
import {
  createPresentationLayout,
  normalizePresentationLayout,
  setPresentationMode,
  type PresentationResource,
} from './presentation.js';

const resources: PresentationResource[] = [
  { id: 'preview', kind: 'preview', title: 'Website preview' },
  { id: 'slide-1', kind: 'slide', title: 'Slide', body: 'Hello' },
];

describe('presentation layout', () => {
  it('allows only one focused resource', () => {
    let layout = createPresentationLayout(resources);
    layout = setPresentationMode(resources, layout, 'preview', 'focused');
    layout = setPresentationMode(resources, layout, 'slide-1', 'focused');

    expect(layout).toEqual({
      resources: { preview: 'minimized', 'slide-1': 'focused' },
      focusedResourceId: 'slide-1',
    });
  });

  it('removes focus when the focused resource is hidden', () => {
    const focused = setPresentationMode(resources, createPresentationLayout(resources), 'preview', 'focused');
    expect(setPresentationMode(resources, focused, 'preview', 'hidden')).toEqual({
      resources: { preview: 'hidden', 'slide-1': 'hidden' },
    });
  });

  it('normalizes unknown resources and malformed multiple focus', () => {
    expect(normalizePresentationLayout(resources, {
      resources: { preview: 'focused', 'slide-1': 'focused', missing: 'focused' },
      focusedResourceId: 'missing',
    })).toEqual({
      resources: { preview: 'focused', 'slide-1': 'minimized' },
      focusedResourceId: 'preview',
    });
  });
});
