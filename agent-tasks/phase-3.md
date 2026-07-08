# Phase 3: Learner Pause/Edit Mode

## Agent task

Add pause/edit mode.

When paused:

- stop playback clock
- store `teacherTimestampMs`
- allow learner edits
- show mode as `learner-editing`

Do not overwrite teacher recording.

## Acceptance

Playwright can:

1. play recording
2. pause
3. edit as learner
4. assert teacher recording in localStorage remains unchanged
