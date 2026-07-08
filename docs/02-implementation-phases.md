# Implementation Phases

## Phase 0: Local repo understanding

Goal: confirm exact local file names and APIs.

Commands:

```bash
bash scripts/phase0-grep.sh
```

Deliverable:

- notes on where to integrate debug controls
- confirmation of available `tutorialStore` APIs

## Phase 1: Minimal event recorder

Goal:

- Start/stop recording.
- Capture editor content changes.
- Capture file selections.
- Persist latest teacher recording to localStorage.

Acceptance:

- Playwright can start recording, edit a file, stop recording, and assert localStorage has events.

## Phase 2: Timeline playback

Goal:

- Load teacher recording.
- Reset workspace to base files.
- Replay `file.changed` and `file.opened` events.
- Guard against recording playback-applied changes.

Acceptance:

- Playwright can play a recording and assert final editor content changed.

## Phase 3: Learner pause/edit mode

Goal:

- Pause playback.
- Record current teacher timestamp.
- Let learner edit workspace.
- Keep teacher timeline unchanged.

Acceptance:

- Learner can edit while paused.
- Recording data remains unchanged.

## Phase 4: Learner delta saving

Goal:

- Materialize teacher state at pause timestamp.
- Take learner snapshot.
- Save file-level diff as learner delta.

Acceptance:

- Playwright can save learner delta and assert localStorage has added/modified files.

## Phase 5: Learner delta restore

Goal:

- Restore latest learner delta.
- Reconstruct base teacher state at saved timestamp.
- Apply learner changes.

Acceptance:

- Playwright can restore learner code after reset/replay.

## Phase 6: Cleanup and limitations

Goal:

- Clean types and guards.
- Document known limitations.
- Only then consider backend persistence, layout recording, terminal, preview, and production UI.
