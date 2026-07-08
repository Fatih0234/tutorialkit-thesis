# Phase 1: Minimal Event Recorder

## Agent task

Add teacher recording mode.

When recording starts:

- store `baseFiles` from `tutorialStore.takeSnapshot()`
- set `startedAt`
- set local `recordingStartTime`

While recording:

- on file selection, append `file.opened`
- on editor content change, append `file.changed`
- debounce is acceptable
- use `Date.now() - recordingStartTime`

When recording stops:

- set `durationMs`
- persist to localStorage key `interactive-poc.teacherRecording`
- show event count in debug UI

## Acceptance

Playwright can:

1. start recording
2. edit file
3. stop recording
4. assert localStorage recording has events
