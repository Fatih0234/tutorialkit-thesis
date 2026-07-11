# Immersive interactive experience

The interactive POC now separates management from the editor playback surface. Storage, recording, playback, and learner checkpoint contracts remain unchanged.

## Product shells

`MainContainer.astro` now provides a dedicated `#interactive-experience-root` outside the normal TutorialKit resizable layout. The React application portals into that named mount instead of `document.body`. While active, the standard TutorialKit layout stays mounted for store/WebContainer continuity but is marked `inert` and `aria-hidden`, so its legacy controls cannot receive focus or appear to assistive technology.

The full-viewport product root has two kinds of screens:

- **management screens**: Teacher Studio and Interactive Lessons;
- **immersive workspace screens**: material preparation, recording, recording review, and learner playback.

The normal TutorialKit lesson remains the source of files, explanation content, terminal configuration, and the real editor. Management screens are rendered only in `InteractiveManagementShell`; the persistently mounted editor and terminal live only in `InteractiveWorkspaceShell`. Management controls are unmounted during an active workspace, while the workspace is hidden and inaccessible during management.

## Optional context panels

The immersive workspace remains editor-first, with two optional and resizable context panels:

- **Explanation** opens trusted Markdown from a lesson-specific Astro `<template>` bridge as a collapsible left pane;
- **Terminal** has one stable `TerminalPanel` owner portaled into a persistent pane below the editor, without a management-screen fallback or a second terminal/WebContainer.

Both are closed by default. Their visibility and last sizes are stored under `interactive-poc.workspaceLayout`. This preference is UI-only: toggling or resizing panels never creates teacher events, learner deltas, or dirty-work state. A short layout guard prevents CodeMirror resize-induced scroll callbacks from becoming teacher events. The terminal stays mounted while collapsed and while management is visible, so output and process attachment survive. Terminal activity is live context and remains outside the recording and replay schema.

A presentation layer above the workspace can independently minimize, focus, hide, and reopen the existing live website preview, lesson explanation, and a snapshot-safe multi-slide deck with progressive reveals. Teacher actions during recording become deterministic `presentation.changed` cues. Learner controls create temporary local overrides; **Follow teacher** or the next teacher cue restores teacher direction. The same TutorialKit preview iframe remains mounted and interactive across presentation modes. See `docs/presentation-resource-layer.md`.

## Session lifecycle

`interactive-session.ts` owns explicit screen transitions:

```text
teacher-dashboard → teacher-materials → teacher-recording → teacher-review
learner-library → learner-player
```

Selected and active recording identifiers are separate. A library selection does not become the active player recording until the learner opens it. Exiting an active player pauses playback. Exiting learner edit mode still uses the existing dirty-work confirmation and deterministic teacher restoration.

## Learner player

The learner player uses the real TutorialKit explanation, file tree, editor, and terminal as its visual frame. Explanation and terminal are opt-in, while a full-width bottom control bar remains visible and contains:

- play/pause;
- restart;
- elapsed and total time;
- deterministic seek;
- optional audio controls or floating webcam playback;
- timestamped violet experiment markers;
- Pause and Experiment, Save Experiment, and Return to Lecture actions;
- a My Experiments drawer.

The accessible range input is layered over a custom video-style progress track. Experiment markers remain independently clickable above that range.

Keyboard commands outside editable controls are:

- Space: play/pause;
- Left/Right: seek five seconds;
- Home: restart.

## Teacher flow

Teacher Studio contains focused lecture setup plus product-facing draft and published-lesson cards. It does not expose technical status, package, demo, or duplicate persistence controls. Material preparation opens the isolated editor without recording. Recording uses the minimal red studio HUD. Review reuses the same bottom video controls and exclusively owns Dashboard, Save Draft, and Publish for unsaved/local-draft sources. Published review is read-only. Publishing consumes the matching draft; confirmed owner-only publication deletion remains a contextual management-card action.

## Preserved invariants

- teacher recordings are immutable during learner activity;
- learner checkpoints remain user-scoped `LearnerDelta` records;
- normal playback never applies learner markers;
- resuming reconstructs teacher truth;
- seeking rematerializes deterministic teacher state;
- media and structured timeline events share one playhead;
- compatibility localStorage keys and storage adapters are unchanged;
- networking remains isolated to the remote storage adapter.
