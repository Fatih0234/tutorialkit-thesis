# POC Acceptance Criteria

Do not move beyond the local POC until all of this works:

## Teacher

- Can start recording.
- Can edit one file.
- Can stop recording.
- Recording is stored as JSON.
- Recording includes base files and at least one `file.changed` event.

## Learner

- Can play teacher recording.
- Can pause teacher playback.
- Can edit the same file.
- Can save learner delta.
- Can resume teacher playback without deleting saved learner delta.
- Can restore learner delta later.

## Architecture

- Teacher timeline is immutable.
- Learner delta is separate from teacher timeline.
- Programmatic playback changes are guarded.
- File paths are normalized.
- No backend required.
- No AI tutor code.
