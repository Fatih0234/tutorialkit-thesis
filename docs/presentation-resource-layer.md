# Presentation Resource Layer

The immersive workspace presents the real editor, live website preview, lesson explanation, an ordered slide deck, an Excalidraw whiteboard, and an optional recorded instructor camera through one responsive lesson composition. Ordinary resources no longer occupy overlapping floating windows.

## Adaptive composition

The editor and presentation resources occupy semantic roles:

- **Main Stage** — one primary surface;
- **Sidecar** — one optional supporting surface;
- **Tray** — compact controls for other visible resources;
- **Context** — local explanation and terminal panes;
- **Camera overlay** — the only floating resource, constrained to corner anchors and named sizes.

Teachers and learners can select Focus, Side-by-side, or Stage with Sidecar. **Arrange Layout** exposes valid drag targets and explicit Main/Side actions. The split is stored as a bounded ratio from 0.5 to 0.8, not pixel geometry. Below the compact-width threshold, Main Stage and Sidecar stack vertically while retaining the same semantic recording state.

`workspace-editor` is a reserved composition surface, not a `PresentationResource`. Moving it never creates a second editor. Resources keep one stable owner while CSS composition roles change, preserving the preview iframe, whiteboard, terminal, media, and WebContainer state.

The additive composition contract is:

```ts
interface PresentationComposition {
  preset: 'focus' | 'side-by-side' | 'stage-with-sidecar';
  primarySurfaceId: string;
  secondarySurfaceId?: string;
  splitRatio: number;
  cameraAnchor: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  cameraSize: 'small' | 'medium' | 'large';
}
```

Legacy `resources`, `focusedResourceId`, and `deckStates` fields remain. New composition state projects into hidden/minimized/focused values for compatibility. Recordings without `composition` map deterministically to editor/Main Stage, one eligible Sidecar, the Tray, and a bottom-right medium camera.

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
  composition?: PresentationComposition;
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

Every completed teacher layout or deck-progress action appends a complete `presentation.changed` snapshot. Dragging commits on drop; split resizing previews continuously but commits at the pointer/keyboard action boundary. Commands, pointer movement, and raw `x`, `y`, `width`, or `height` values are not persisted. This makes progressive playback and arbitrary backward/forward seeking deterministic.

## Playback and learner control

Playback materializes presentation events alongside editor events. Seeking restores the initial layout and applies ordered snapshots through the target timestamp, immediately producing the correct slide and reveal step.

Learners can navigate slides and reveals, rearrange Main Stage and Sidecar, resize the split, hide or focus resources, move or resize the anchored camera, and interact with the live preview. These actions create a temporary presentation override only: they do not mutate the teacher recording, create a learner file delta, mark the workspace dirty, or write backend state. **Follow teacher** clears the override. A later teacher presentation cue also clears it and applies the teacher's new state.

## Whiteboard

The whiteboard is an embedded React presentation resource, never an iframe. Teachers can use selection, freehand drawing, eraser, arrows, rectangles, ellipses, text, undo/redo, clear, pan, and zoom. Material Preparation updates its application-owned `initialScene` without timeline events. During recording, content-only changes are fingerprinted and committed after a 450 ms trailing action debounce as complete `whiteboard.scene.changed` snapshots. Raw pointer movement and viewport-only changes are never recorded.

Seeking restores `initialScene` and applies ordered scene snapshots through the target timestamp. Normal playback applies the same snapshots under either media time or `TimelinePlaybackClock`. Explicit programmatic update sources and duplicate fingerprints prevent playback application from recording new events.

Learners receive Excalidraw view mode: teacher elements are read-only, while local pan/zoom state is transient. Learner code experiments never include whiteboard data. Whiteboard layout remains separate in `presentation.changed`, can occupy Main Stage, Sidecar, Tray, or hidden state, and follows the composition and Follow Teacher behavior. Excalidraw refreshes after container changes without persisting viewport state.

Scenes are JSON-only, limited to 1,000 elements and 512 KiB. Stable background/grid appearance may persist; selection, active tools, dialogs, pointers, scroll, and zoom do not. Image insertion is disabled in v1 to avoid binary-file persistence. Package format 1 remains compatible because whiteboard resources/events are additive. `@excalidraw/excalidraw` 0.18.x is an MIT-licensed dependency loaded through the client-only adapter.

## Instructor camera

A webcam recording captures camera and microphone together. Its synchronized video is exposed as an **Instructor Camera** resource, initially shown as a medium bottom-right overlay. It is the only floating composition element. Teachers can drag it to one of four corner anchors or use the position selector, and can cycle through small, medium, and large sizes. Learners can apply the same controls as temporary overrides.

The camera `<video>` remains mounted even while hidden so it can continue serving as the authoritative media clock. It deliberately has no native controls or independent pointer interaction: play, pause, restart, and seek belong exclusively to the lecture transport. During recording, the teacher still sees the separate muted live monitor in the recording header.

Older webcam recordings without a camera resource receive this resource and minimized default when loaded. Recordings without webcam media do not expose it.

## Live preview ownership

`PreviewPanel` and its existing WebContainer iframe are reused. The iframe node is embedded in one persistent presentation host and resized between Main Stage, Sidecar, Tray, and hidden roles. Its JavaScript state and user interaction survive these transitions.

Clicks, DOM mutations, form input, and navigation inside the iframe are deliberately not recorded. The timeline records presentation intent around a live preview, not preview internals.

## Compatibility

The recording additions remain optional:

```ts
presentationResources?: PresentationResource[];
initialPresentationLayout?: PresentationLayout;
```

Legacy individual `slide` resources remain renderable for recordings created before deck support. Missing `deckStates` normalize to slide zero, reveal zero. Existing storage adapters and package serialization preserve the additive structures without another API or networking path.
