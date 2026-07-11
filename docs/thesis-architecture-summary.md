# Thesis architecture summary

## Purpose and system boundary

The thesis prototype adds an interactivity layer to TutorialKit. A teacher records structured editor/file actions and optional narration or webcam media. A learner replays the recording, pauses to edit a separate workspace, and saves file-level work that remains recoverable after teacher playback resumes. The design deliberately keeps immutable teacher artifacts separate from learner-owned state.

The React integration wraps existing workspace/editor callbacks rather than modifying CodeMirror internals. `WorkspacePanel.tsx` connects TutorialKit state to `useInteractivePoc`, while runtime modules under `packages/runtime/src/interactive-timeline/` own recording, materialization, playback timing, storage contracts, learner deltas, conflicts, identity types, and package transfer.

## Architecture diagram

```mermaid
flowchart LR
  subgraph UI[React product interface]
    TS[Teacher Studio]
    LL[Learner Lesson]
    DI[Account / demo session]
  end

  Hook[useInteractivePoc]

  subgraph Runtime[Runtime interactive-timeline modules]
    Rec[Recorder and materializer]
    Clock[Media clock or timeline clock]
    Delta[Learner delta and conflict helpers]
    Package[Export/import package helpers]
    Identity[Identity and auth client]
    Adapter[InteractiveTimelineStorage boundary]
  end

  IDB[("IndexedDB<br/>local drafts and media")]
  Remote[RemoteInteractiveTimelineStorage]
  API["/api/interactive/*"]
  Files[(".interactive-data<br/>published demo files and sessions")]
  Mirrors[("localStorage<br/>compatibility mirrors")]

  TS --> Hook
  LL --> Hook
  DI --> Hook
  Hook --> Rec
  Hook --> Clock
  Hook --> Delta
  Hook --> Package
  Hook --> Identity
  Hook --> Adapter
  Adapter --> IDB
  Adapter --> Remote
  IDB -. metadata mirror .-> Mirrors
  Remote -. inspection mirror .-> Mirrors
  Remote --> API
  API --> Files
```

Only `RemoteInteractiveTimelineStorage` performs interactivity-layer `fetch` calls. The Astro middleware implements the local `/api/interactive/*` routes and writes gitignored development data under `.interactive-data/`.

## Teacher Studio flow

1. The teacher signs in and uses **Lecture Setup** to choose the initial file and timeline/microphone/camera mode.
2. **Edit Materials** exposes the editor while recording is explicitly off; the prepared workspace becomes the normalized base snapshot.
3. **Start Recording** enters a focused full-screen studio and captures timestamped `file.opened`, `file.created`, `file.changed`, and `editor.scrolled` events.
4. Optional microphone or webcam media begins from the same local start time and remains an attachment to the structured recording.
5. Stopping enters **Recording Review**; the shared editor player provides play, pause, restart, and deterministic seek before save/publish.
6. Saving writes a local IndexedDB draft and media blobs.
7. Publishing sends immutable recording JSON and associated media to the development backend, removes the matching local draft/media, and switches review to the read-only published source.
8. Reviewing a publication never creates a draft. An owner may explicitly confirm whole-lesson deletion, which removes the publication, linked media, and linked learner experiments.
9. Retained export capability can package recording/media and optional current-user learner work without altering the source, although package controls are absent from default UI.

## Learner Lesson flow

1. The learner signs in and opens a published lesson.
2. The shared editor player resets the workspace to `baseFiles`, applies ordered events by `tMs` then `seq`, and supports deterministic pause/restart/seek.
3. **Pause and Experiment** pauses the playback source and captures the teacher timestamp.
4. **Save Experiment** compares the learner workspace with teacher state materialized at that timestamp, stores the file-level delta, and creates a timeline marker.
5. **Return to Lecture** reconstructs teacher truth at the anchor timestamp before continuing teacher events; the saved experiment remains separate.
6. Selecting a marker validates recording id/version and base-state hash, reconstructs the historical teacher state, and applies the latest learner-owned checkpoint at that timestamp.

## Structured timeline and media attachment model

`TeacherRecording` contains normalized `baseFiles`, ordered `TimelineEvent[]`, duration, ownership fields, optional media metadata references, and presentation resources including an application-owned Excalidraw whiteboard scene. Presentation snapshots may identify the front resource in the fixed left/right window layers through semantic `frontmostBySide` ids; they never persist z-index values or window geometry. Whiteboard content uses debounced `whiteboard.scene.changed` snapshots; raw pointer and viewport state are excluded. Seeking restores the initial scene and ordered snapshots, while learners receive read-only view mode. Media Blob data is stored separately. This preserves deterministic, inspectable editor replay instead of replacing it with opaque screen video.

When media is available, `HTMLMediaElement.currentTime * 1000` is the single timeline time source. Without media—including an imported package whose media bytes are unavailable—`TimelinePlaybackClock` uses `requestAnimationFrame`. Playback changes use an explicit programmatic-change guard so they are not recorded as teacher or learner edits.

## Local draft storage

`IndexedDBInteractiveTimelineStorage` stores local `teacherRecordings`, `learnerDeltas`, and media `Blob` values. It migrates and mirrors timeline metadata through the compatibility keys:

```text
interactive-poc.teacherRecording
interactive-poc.learnerDeltas
```

Media is never mirrored into localStorage. Legacy recording migration is one-time and unpublished-only, so a published playback mirror cannot become a draft. Matching draft deletion clears the mirror. If IndexedDB is unavailable, timeline-only operations can fall back to `LocalStorageInteractiveTimelineStorage`.

## Published development storage

`RemoteInteractiveTimelineStorage` maps the same async storage seam to `/api/interactive/*`. The Astro development/preview middleware persists recording JSON, learner delta JSON, media metadata/binaries, and sessions under `.interactive-data/`. This file-backed path demonstrates backend boundaries and browser reload recovery; it is not a production database or object store.

## Learner delta model

A `LearnerDelta` stores full contents for `addedOrModified` files and normalized paths for `removed` files. It is keyed by learner, lesson, teacher recording id/version, paused teacher timestamp, and the hash of teacher files at that timestamp. The remote server derives learner ownership from the current session rather than trusting a client-supplied user id. Saving or restoring a delta never mutates the teacher recording.

## Learner experiment model

Learner deltas are historical branches, not merge candidates. Later teacher changes to the same path do not conflict with a checkpoint anchored earlier. The player groups saves by timestamp, renders one violet marker per anchor, and opens the latest version from that marker. Passing a marker during ordinary playback has no effect. Unsaved edits receive a separate save/discard/cancel warning before returning to teacher playback.

An exceptional recording-version or historical-base-hash mismatch reports that the experiment belongs to another lecture version. The prototype does not automatically merge or compute text hunks.

## Import/export package model

`InteractiveRecordingPackage` format version 1 is a JSON thesis artifact containing a structured `TeacherRecording`, media metadata and base64 media data, optional current-user learner deltas, and descriptive package metadata. Import validates ids, event fields, paths, and package version, then creates new recording/media ids. It can target an IndexedDB draft or published development storage. Missing media bytes produce a warning and a structured timeline-only copy instead of a failed import.

## Identity and ownership model

The demo supplies fixed, non-sequential teacher and learner user ids. Login creates a random server-side session under `.interactive-data/sessions/`; the `interactive_session` cookie contains only that random id and is `HttpOnly`, `SameSite=Lax`, and scoped to `/`. Teacher roles gate publishing, media upload, owner-authorized publication deletion, published import, seed, and reset. Learner roles gate remote delta save/restore, and delta queries are user-scoped.

This proves ownership boundaries but is intentionally not production authentication: there are no passwords, OAuth/OIDC, account recovery, production authorization administration, or durable user database.

## Architectural invariants

- Teacher-recording content remains immutable after save/publish; deletion is an explicit owner-authorized whole-resource operation.
- Learner deltas remain separate and user-scoped.
- Paths are normalized to leading-slash form.
- Programmatic playback/restore is guarded from recording.
- Timeline ordering is deterministic by timestamp and sequence.
- Conflict choices are explicit and non-merging.
- Local drafts and published demo records use the same async adapter boundary.

For implementation-level details, see [`interactive-poc-architecture.md`](./interactive-poc-architecture.md) and [`interactive-persistence-contract.md`](./interactive-persistence-contract.md).
