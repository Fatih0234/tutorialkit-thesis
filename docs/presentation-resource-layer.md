# Presentation Resource Layer

The immersive workspace presents the live website preview, lesson explanation, and an ordered slide deck as timeline-directed resources. A resource has one canonical layout mode: `hidden`, `minimized`, or `focused`; only one resource may be focused.

## Deck model

A lecture deck is one resource in the resource bar, regardless of slide count:

```ts
interface DeckPresentationResource {
  id: string;
  kind: 'deck';
  title: string;
  slides: PresentationSlide[];
}

interface PresentationSlide {
  id: string;
  title: string;
  eyebrow?: string;
  elements: PresentationSlideElement[];
}
```

Slide elements support headings, paragraphs, bullets, code, and self-contained images. Every element has a non-negative `revealStep`. Step zero is visible when the slide opens; elements sharing a later step appear together when that step is revealed.

The layout stores deck progress separately from immutable deck content:

```ts
interface PresentationLayout {
  resources: Record<string, 'hidden' | 'minimized' | 'focused'>;
  focusedResourceId?: string;
  deckStates?: Record<string, {
    slideIndex: number;
    revealedStep: number;
  }>;
}
```

Normalization clamps malformed slide indexes and reveal steps and preserves the one-focus invariant.

## Teacher authoring

In **Prepare materials**, focus the deck and expand **Edit presentation**. The visual builder supports:

- editing deck and slide titles;
- adding, duplicating, deleting, and reordering slides;
- adding headings, paragraphs, reveal bullets, code, and local image data;
- editing and deleting elements;
- reordering elements;
- assigning reveal steps;
- selecting slides from the slide indicators and previewing the reveal sequence.

The prepared structured deck is copied into the recording at recording start. It is therefore preserved by draft storage, publication, import, and export. Local image uploads are represented as data URLs in the structured snapshot for this POC; a production asset service can replace that representation without changing deck state.

## Teacher cues

During recording, the teacher can use explicit previous/next slide and previous/next reveal controls. Arrow Left/Right traverses reveals, Page Up/Down traverses slides, and Escape minimizes the focused deck. Presentation shortcuts do not run while focus is in CodeMirror, xterm, a form control, or editable content.

Every teacher layout or deck-progress action appends a complete `presentation.changed` snapshot. Commands such as “toggle” or “next” are not persisted. This makes progressive playback and arbitrary backward/forward seeking deterministic.

## Playback and learner control

Playback materializes presentation events alongside editor events. Seeking restores the initial layout and applies ordered snapshots through the target timestamp, immediately producing the correct slide and reveal step.

Learners can navigate slides and reveals, hide or focus resources, and interact with the live preview. These actions create a temporary presentation override only: they do not mutate the teacher recording, create a learner file delta, mark the workspace dirty, or write backend state. **Follow teacher** clears the override. A later teacher presentation cue also clears it and applies the teacher's new state.

## Live preview ownership

`PreviewPanel` and its existing WebContainer iframe are reused. The iframe node is embedded in one persistent presentation host and resized between hidden, minimized, and focused geometry. Its JavaScript state and user interaction survive these transitions.

Clicks, DOM mutations, form input, and navigation inside the iframe are deliberately not recorded. The timeline records presentation intent around a live preview, not preview internals.

## Compatibility

The recording additions remain optional:

```ts
presentationResources?: PresentationResource[];
initialPresentationLayout?: PresentationLayout;
```

Legacy individual `slide` resources remain renderable for recordings created before deck support. Missing `deckStates` normalize to slide zero, reveal zero. Existing storage adapters and package serialization preserve the additive structures without another API or networking path.
