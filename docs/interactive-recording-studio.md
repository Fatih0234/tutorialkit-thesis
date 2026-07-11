# Interactive recording studio workflow

## Purpose

The recording studio makes a structured editor timeline feel like video without turning the editor into pixels. The teacher manages a lecture separately, records in a focused full-screen editor, and reviews the result in the same seekable editor player used by learners.

No editor screen video is produced. Optional microphone or webcam media remains an attachment synchronized to the structured timeline.

## Teacher stages

The workspace-level UI uses four explicit teacher stages:

```ts
type InteractiveTeacherStage = 'setup' | 'materials' | 'recording' | 'review';
```

### Lecture Setup

The editor is hidden. The teacher sees the current TutorialKit lesson, normalized file paths, starting file, and recording mode:

- editor only;
- editor plus microphone;
- editor plus camera and microphone.

Draft libraries, publishing, package tools, and deterministic demo controls remain management concerns in this stage.

### Preparing Lecture Materials

**Edit Materials** reveals the real TutorialKit editor with an explicit **Recording is off** status. **Use This Workspace** returns to setup. The recorder takes its base snapshot from both the workspace snapshot and loaded editor documents, so unsaved in-editor preparation is included in `baseFiles` without becoming a teacher timeline event.

### Recording Studio

**Start Recording** validates lesson readiness, requests optional media permission, captures normalized base files, records the selected initial file at `tMs: 0`, and enters a fixed full-viewport editor surface. The editor remains the existing TutorialKit editor; it is not duplicated in another browser window.

The studio HUD exposes only recording-critical state:

- animated red recording indicator;
- elapsed time;
- event count;
- draft and media state;
- live webcam preview when a real webcam stream exists;
- prominent **Stop Recording**.

A `beforeunload` guard warns before refresh/navigation while recording. Playback-origin changes retain the explicit recording guard and cannot become teacher events.

### Recording Review

Stopping finalizes the timeline and optional media, then opens Recording Review. The review player provides:

- play;
- pause;
- restart;
- current time and duration;
- a seekable editor timeline;
- optional recorded audio playback;
- optional synchronized Instructor Camera presentation resource without independent media controls;
- save, publish, export, and return-to-setup actions.

Seeking pauses playback, restores `baseFiles`, reapplies ordered events through the chosen timestamp, restores file/scroll state, and aligns loaded media to the same timestamp. Play after seeking continues from the materialized state.

## Structured event fidelity

The current recording schema captures:

- `recording.started`;
- `file.opened`;
- `file.created` when the existing file-tree callback creates a file;
- `file.changed` with full file content and opaque selection data;
- `editor.scrolled`;
- `playback.marker` for schema compatibility.

`TutorialStore.restoreFile()` is a trusted programmatic path used by playback to deterministically restore base files and teacher-created files. It does not bypass the playback-origin guard.

File remove/rename capture remains unavailable because the current rendered file-tree product UI does not expose those operations through the integrated callback path.

## Learner player

Learner Lesson uses the shared `InteractiveVideoControls` inside a full-viewport editor shell. A custom video-style track spans the bottom of the viewport while an accessible range control supplies keyboard and assistive-technology seek behavior. A learner may play, pause, restart, or seek before selecting **Pause and Experiment**. Entering learner mode captures the current teacher timestamp and keeps learner deltas keyed to that materialized teacher state.

Teacher recordings remain immutable. Saved learner experiments appear as timestamped markers. Selecting a marker reconstructs teacher state at that exact timestamp and applies the learner delta; **Return to Lecture** reconstructs teacher truth and continues playback. Later teacher edits do not produce a normal conflict because experiments are historical branches, not merges. See [`learner-timeline-experiments.md`](./learner-timeline-experiments.md).

## Main implementation files

```text
packages/react/src/Panels/WorkspacePanel.tsx
packages/react/src/Panels/InteractivePocControls.tsx
packages/react/src/Panels/InteractiveTeacherDashboard.tsx
packages/react/src/Panels/InteractiveMaterialPreparation.tsx
packages/react/src/Panels/InteractiveRecordingStudio.tsx
packages/react/src/Panels/InteractiveImmersiveHeader.tsx
packages/react/src/Panels/InteractiveVideoControls.tsx
packages/react/src/Panels/InteractiveLearnerLibrary.tsx
packages/react/src/Panels/interactive-session.ts
packages/react/src/Panels/useInteractivePoc.ts
packages/runtime/src/interactive-timeline/types.ts
packages/runtime/src/interactive-timeline/recorder.ts
packages/runtime/src/interactive-timeline/materialize.ts
```

## Explicit non-goals

- screen capture;
- a separate browser popup/window;
- terminal recording;
- preview iframe-internal recording;
- automatic merge;
- production media processing or persistence.
