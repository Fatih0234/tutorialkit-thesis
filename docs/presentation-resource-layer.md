# Presentation Resource Layer

The immersive workspace presents the live website preview, lesson explanation, an ordered slide deck, an Excalidraw whiteboard, and an optional recorded instructor camera as timeline-directed resources. A resource has one canonical layout mode: `hidden`, `minimized`, or `focused`; only one resource may be focused.

## Simple layered windows

The **Resources** toolbar remains the only window launcher. It occupies a dedicated normal-flow row below the Workspace toolbar and scrolls horizontally when space is limited; it never overlaps the editor header or code. The focused and minimized presentation layer is bounded to the content region below both permanent toolbar rows. Website Preview uses the fixed right window. Whiteboard, deck, legacy slides, and presentation explanation use the same fixed left window position. Multiple left resources may remain minimized and mounted, but they overlap rather than stacking vertically. The most recently selected resource is placed in front while covered resources preserve their content and state.

A toolbar click opens a hidden resource, brings a covered minimized resource forward, or hides the already-frontmost resource. Window headers retain Focus, Minimize, and Hide. Instructor Camera remains its own small corner overlay rather than joining the left window layer. There are no draggable windows, freeform coordinates, responsive composition presets, Main Stage, Sidecar, or split controls.

`PresentationLayout.frontmostBySide` stores only the semantic front window for `left` and `right`. Teacher changes are included in complete `presentation.changed` snapshots; learner changes remain temporary overrides. Toolbar overflow, z-index values, and pixel geometry are UI-only and are not persisted.

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
  frontmostBySide?: {
    left?: string;
    right?: string;
  };
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

## Whiteboard

The whiteboard is an embedded React presentation resource, never an iframe. Teachers can use selection, freehand drawing, eraser, arrows, rectangles, ellipses, text, undo/redo, clear, pan, and zoom. Material Preparation updates its application-owned `initialScene` without timeline events. During recording, content-only changes are fingerprinted and committed after a 450 ms trailing action debounce as complete `whiteboard.scene.changed` snapshots. Raw pointer movement and viewport-only changes are never recorded.

Seeking restores `initialScene` and applies ordered scene snapshots through the target timestamp. Normal playback applies the same snapshots under either media time or `TimelinePlaybackClock`. Explicit programmatic update sources and duplicate fingerprints prevent playback application from recording new events.

Learners receive Excalidraw view mode: teacher elements are read-only, while local pan/zoom state is transient. Learner code experiments never include whiteboard data. Whiteboard layout remains separate in `presentation.changed`, supports hidden/minimized/focused, and follows the existing one-focus and Follow Teacher behavior.

Scenes are JSON-only, limited to 1,000 elements and 512 KiB. Stable background/grid appearance may persist; selection, active tools, dialogs, pointers, scroll, and zoom do not. Image insertion is disabled in v1 to avoid binary-file persistence. Package format 1 remains compatible because whiteboard resources/events are additive. `@excalidraw/excalidraw` 0.18.x is an MIT-licensed dependency loaded through the client-only adapter.

## Instructor camera

A webcam recording captures camera and microphone together. Its synchronized video is exposed as an **Instructor Camera** resource, initially minimized in a safe lower-left slot while the website preview remains lower-right. Learners can hide, minimize, focus, and reopen it using the same temporary override behavior as other resources.

The camera `<video>` remains mounted even while hidden so it can continue serving as the authoritative media clock. It deliberately has no native controls or independent pointer interaction: play, pause, restart, and seek belong exclusively to the lecture transport. During recording, the teacher still sees the separate muted live monitor in the recording header.

Older webcam recordings without a camera resource receive this resource and minimized default when loaded. Recordings without webcam media do not expose it.

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
