# Implementation timeline

This timeline summarizes the incremental evidence built from Phase 0 through the isolated interactive application-root refinement. Each step preserved the central invariant that learner activity must not mutate the teacher timeline.

## Phase 0 — Baseline

Phase 0 established a buildable TutorialKit source baseline and recorded repository investigation findings before interactivity changes. It proved the upstream project could be preserved and provided a clean comparison point for a small, isolated POC integration.

## Phase 1 — Minimal teacher event recorder

Phase 1 wrapped existing workspace/editor callbacks to record timestamped teacher actions and save a `TeacherRecording` to the compatibility localStorage key. It proved editor/file activity could be observed without modifying CodeMirror internals.

## Phase 2 — Minimal teacher playback

Phase 2 loaded a stored teacher recording, reset the workspace to its base snapshot, and replayed ordered events. It proved that structured events could deterministically reproduce teacher file state while leaving the recording artifact unchanged.

## Phase 3 — Pause and learner edit mode

Phase 3 introduced separate teacher-playback and learner-editing modes with pause/resume controls. It proved a learner could interrupt replay and use the same workspace without converting learner actions into teacher events.

## Phase 4 — Save learner delta

Phase 4 materialized teacher state at the paused timestamp, compared it with the learner workspace, and stored `addedOrModified` and `removed` file-level changes. It proved learner work could be represented separately and anchored to lesson, recording, timestamp, version, and base hash.

## Phase 5 — Restore learner delta

Phase 5 restored the latest matching learner delta over its teacher base state after playback continued. It proved that visible teacher playback could overwrite the workspace without permanently destroying previously saved learner work.

## Phase 5.5 — React control refactor

Phase 5.5 extracted recorder, playback, and learner-delta state into `useInteractivePoc` and separated controls from `WorkspacePanel`. It proved the POC behavior could remain behind a focused integration seam rather than spreading through TutorialKit components.

## Phase 6 — Conflict detection

Phase 6 compared learner-changed paths with later teacher `file.changed` events and surfaced non-destructive conflict evidence. It proved the system could warn about unsafe restoration without implementing an automatic merge or changing either source artifact.

## Phase 6.5 — Architecture checkpoint

Phase 6.5 documented flows, data models, storage keys, runtime modules, React integration, invariants, and limitations. It proved the evolving implementation had an explicit architecture that could guide later persistence and product work.

## Phase 7 — Deterministic timeline clock

Phase 7 replaced ad hoc playback timers with a requestAnimationFrame-based `TimelinePlaybackClock`, including pause/resume and ordered due-event application. It proved no-media playback could use one deterministic playhead abstraction.

## Phase 8 — Persistence contract

Phase 8 specified immutable recording resources, learner-owned deltas, proposed API shapes, storage layouts, validation rules, and migration paths. It proved the browser POC model could be translated to an async backend boundary without changing its safety properties.

## Phase 9 — Local storage adapter

Phase 9 introduced the async `InteractiveTimelineStorage` seam and a local implementation while retaining compatibility mirrors. It proved React behavior could depend on a replaceable storage contract instead of direct localStorage calls.

## Milestone A — Local authoring application

Milestone A added the teacher draft lifecycle—record, stop, save, list, load, preview, discard, and delete—using IndexedDB for multiple local recordings. It proved the minimal recorder could support a coherent local authoring workflow across reloads.

## Milestone B — Media recording and playback

Milestone B attached microphone or webcam recordings to the structured timeline, stored media blobs separately, and used media time as the playback clock when available. It proved narration could enrich replay without replacing inspectable editor events with screen video.

## Milestone C — Backend development persistence

Milestone C implemented `RemoteInteractiveTimelineStorage`, local `/api/interactive/*` middleware, `.interactive-data/` persistence, and multipart media upload. It proved published lessons and learner work could survive browser reloads through a backend-shaped adapter while local drafts stayed in IndexedDB.

## Milestone D — Product teacher and learner UX

Milestone D organized the controls into role-oriented teacher and learner views with recording libraries and clearer workflow actions. It proved the underlying POC operations could be presented as understandable lesson-authoring and lesson-learning journeys rather than one debug panel.

## Milestone E — Identity and ownership

Milestone E added demo users, random server-side sessions, role gates, recording ownership, and learner-scoped delta queries/writes. It proved authority could be derived from a server session and that one learner's work remained inaccessible to another learner.

## Milestone F — Explicit conflict resolution UX

Milestone F converted conflict warnings into an explicit restore decision panel with restore anyway, keep teacher version, view details, and cancel. It proved learners could control conflicted restoration while recordings and deltas remained immutable and no automatic merge occurred.

## Milestone G — Export, import, and deterministic demo data

Milestone G added portable JSON/base64 recording packages, import-as-copy for local or published targets, and deterministic demo seed/reset endpoints. It proved recordings and media could move between demo environments, imported published artifacts remained immutable, and a repeatable conflict walkthrough could be prepared safely.

## Milestone H — Thesis demo polish

Milestone H refined Teacher Studio, Learner Lesson, Demo Identity, status/error wording, walkthrough guidance, and destructive-action confirmations. It also hardened package download cleanup and missing-media fallback, expanded Playwright evidence, and added the operator demo script, proving the complete POC could be presented reliably as a thesis demonstration.

## Milestone I — Release candidate and evidence pack

Milestone I froze the existing product behavior and assembled the release-candidate evidence: quick-start instructions, architecture summary and diagram, evaluation criteria, limitations/future work, this implementation history, and a reproducible release checklist.

## Recording Studio UX refinement

The recording-studio refinement separated Lecture Setup, material preparation, full-screen recording, and review. It added a shared seekable editor player, deterministic replay from arbitrary timestamps, explicit initial-file capture, live webcam preview, trusted restoration of teacher-created files, and navigation protection while recording. It proved the structured timeline could feel like video while remaining a real editor and while preserving immutable teacher recordings and learner-owned deltas.

The isolated application-root refinement then moved the product DOM into a dedicated Astro mount outside TutorialKit's standard resizable layout. Explicit management and persistent workspace shells prevent terminal/editor controls from leaking into libraries and dashboards. The standard layout remains mounted but inert, the terminal has one persistent immersive owner, lesson Markdown enters through a lesson-specific template bridge, and context-panel resize callbacks are guarded from teacher recording.

The presentation-resource refinement added Scrimba-style hidden, minimized, and focused resources for the persistent live website preview, explanation, and a self-contained multi-slide deck with progressive element reveals and a preparation-stage visual builder. Teacher layout snapshots became deterministic timeline cues; learner actions remain temporary local overrides with an explicit Follow teacher action. The real preview iframe is embedded into the immersive host without recreation, while interactions inside it intentionally remain outside the recording schema.

## Learner timeline experiment refinement

This refinement replaced later-teacher-event conflict prompts with the product's intended historical-branch model. **Save Experiment** creates a user-scoped checkpoint marker at the paused teacher timestamp; **Return to Lecture** reconstructs teacher truth before continuing; selecting a marker reconstructs that historical teacher state and applies the learner delta. It added marker grouping/version counts, dirty-work save/discard/cancel protection, and trusted learner-added/removed file restoration. The persisted `LearnerDelta` contract and immutable teacher source remain unchanged.

## Immersive product-shell refinement

This refinement separated Teacher Studio and Interactive Lessons management from the active editor surface. An explicit session reducer now controls dashboard, library, preparation, recording, review, and learner-player screens. Preparation and playback use a full-viewport shell around the same real editor; review and learner playback share a full-width bottom video timeline, keyboard seek controls, synchronized media, learner markers, and a My Experiments drawer. The runtime event, recording, learner-delta, storage, and API contracts remain unchanged.

## Instructor Camera and minimal-management refinement

Optional webcam media became a synchronized **Instructor Camera** presentation resource with hide/minimize/focus/reopen behavior and no independent transport. Teacher Studio and Interactive Lessons were then reduced to product decisions only: setup and recording cards for teachers, and one Start Lesson action for learners. Package, fixture, debug, and technical controls remain supported contracts but are absent from default UI; Save Draft and Publish belong only to immersive Recording Review.

## Draft/publication lifecycle correction

The compatibility recording mirror stopped acting as authoritative draft storage. Legacy unpublished migration now runs once; published review never creates a draft; successful publication removes the matching local IndexedDB draft/media; matching draft deletion also clears the mirror. Published review is read-only and requires an explicit future duplicate/version action before editing.

## Layered resource windows

The simple Resources toolbar remains the presentation launcher. Website Preview uses the fixed right window, while whiteboard, deck, slides, and presentation explanation share one fixed left position and overlap instead of stacking vertically. `frontmostBySide` records which covered minimized window is brought forward; toolbar clicks open, bring forward, or hide without persisting z-index values or geometry. Instructor Camera remains a separate corner overlay. This focused refinement deliberately excludes draggable windows, responsive composition presets, Main Stage, Sidecar, and split controls.

## Excalidraw whiteboard resource

A native Excalidraw whiteboard joined the presentation-resource union with hidden/minimized/focused layout controlled by existing `presentation.changed` snapshots. Material Preparation captures an initial JSON scene; recording emits debounced `whiteboard.scene.changed` snapshots after meaningful content actions; seeking materializes the scene by timestamp; and learner playback uses read-only view mode. Runtime and remote validators strip transient Excalidraw state and enforce 1,000-element/512 KiB limits. Drafts, publications, compatibility storage, and package format 1 preserve the additive resource/event data. Image insertion is intentionally disabled in this first version.

## Published-lesson deletion

Teacher owners gained a confirmed **Delete Lesson** card action backed by a dedicated remote DELETE operation. The backend verifies teacher ownership and cascades over the exact publication, linked media metadata/files, and linked learner deltas while preserving unrelated local drafts, publications, assets, experiments, and lesson source files. This does not weaken recording-content immutability: deletion removes the complete resource rather than modifying its timeline.
