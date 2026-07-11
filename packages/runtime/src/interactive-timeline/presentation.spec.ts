import { describe, expect, it } from 'vitest';
import {
  createPresentationLayout,
  normalizePresentationLayout,
  setDeckProgress,
  setPresentationMode,
  stepDeckReveal,
  stepDeckSlide,
  type PresentationResource,
} from './presentation.js';

const resources: PresentationResource[] = [
  { id: 'preview', kind: 'preview', title: 'Website preview' },
  {
    id: 'counter-deck', kind: 'deck', title: 'Counter', slides: [
      { id: 'state', title: 'State', elements: [
        { id: 'title', kind: 'heading', text: 'State', revealStep: 0 },
        { id: 'one', kind: 'bullet', text: 'Read', revealStep: 1 },
        { id: 'two', kind: 'bullet', text: 'Write', revealStep: 2 },
      ] },
      { id: 'dom', title: 'DOM', elements: [{ id: 'dom-point', kind: 'bullet', text: 'Update', revealStep: 1 }] },
    ],
  },
];

const emptyDeckState = { 'counter-deck': { slideIndex: 0, revealedStep: 0 } };

describe('presentation layout and decks', () => {
  it('allows only one focused resource', () => {
    let layout = createPresentationLayout(resources);
    layout = setPresentationMode(resources, layout, 'preview', 'focused');
    layout = setPresentationMode(resources, layout, 'counter-deck', 'focused');
    expect(layout).toEqual({ resources: { preview: 'minimized', 'counter-deck': 'focused' }, focusedResourceId: 'counter-deck', deckStates: emptyDeckState });
  });

  it('removes focus when the focused resource is hidden', () => {
    const focused = setPresentationMode(resources, createPresentationLayout(resources), 'preview', 'focused');
    expect(setPresentationMode(resources, focused, 'preview', 'hidden')).toEqual({ resources: { preview: 'hidden', 'counter-deck': 'hidden' }, deckStates: emptyDeckState });
  });

  it('normalizes unknown resources, malformed focus, and deck progress', () => {
    expect(normalizePresentationLayout(resources, {
      resources: { preview: 'focused', 'counter-deck': 'focused', missing: 'focused' },
      focusedResourceId: 'missing', deckStates: { 'counter-deck': { slideIndex: 99, revealedStep: 99 } },
    })).toEqual({ resources: { preview: 'focused', 'counter-deck': 'minimized' }, focusedResourceId: 'preview', deckStates: { 'counter-deck': { slideIndex: 1, revealedStep: 1 } } });
  });

  it('reveals progressively and then advances to the next slide', () => {
    let layout = createPresentationLayout(resources);
    layout = stepDeckReveal(resources, layout, 'counter-deck', 1);
    expect(layout.deckStates?.['counter-deck']).toEqual({ slideIndex: 0, revealedStep: 1 });
    layout = stepDeckReveal(resources, layout, 'counter-deck', 1);
    layout = stepDeckReveal(resources, layout, 'counter-deck', 1);
    expect(layout.deckStates?.['counter-deck']).toEqual({ slideIndex: 1, revealedStep: 0 });
  });

  it('moves backward to the fully revealed previous slide', () => {
    let layout = setDeckProgress(resources, createPresentationLayout(resources), 'counter-deck', { slideIndex: 1 });
    layout = stepDeckReveal(resources, layout, 'counter-deck', -1);
    expect(layout.deckStates?.['counter-deck']).toEqual({ slideIndex: 0, revealedStep: 2 });
  });

  it('normalizes an instructor camera through the shared visibility modes', () => {
    const cameraResources: PresentationResource[] = [{ id: 'camera', kind: 'camera', title: 'Instructor Camera' }];
    const minimized = setPresentationMode(cameraResources, createPresentationLayout(cameraResources), 'camera', 'minimized');
    expect(minimized).toEqual({ resources: { camera: 'minimized' }, deckStates: {} });
    expect(setPresentationMode(cameraResources, minimized, 'camera', 'focused')).toEqual({ resources: { camera: 'focused' }, focusedResourceId: 'camera', deckStates: {} });
  });

  it('supports explicit slide navigation and clamps boundaries', () => {
    let layout = stepDeckSlide(resources, createPresentationLayout(resources), 'counter-deck', 1);
    expect(layout.deckStates?.['counter-deck']).toEqual({ slideIndex: 1, revealedStep: 0 });
    layout = stepDeckSlide(resources, layout, 'counter-deck', 1);
    expect(layout.deckStates?.['counter-deck']).toEqual({ slideIndex: 1, revealedStep: 0 });
  });
});
