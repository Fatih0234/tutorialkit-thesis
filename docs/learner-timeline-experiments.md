# Learner Timeline Experiments

## Product model

The teacher recording is an immutable, video-like editor timeline. Lecture Playback always materializes the teacher's original files at the current playhead. Learner work is never merged into that playback state.

Selecting **Try It Yourself** creates an experiment anchored to the current teacher timestamp:

```text
Teacher timeline  00:00 -------- 01:20 -------- 02:10 -------- 03:00
                                  |
                                  +-- learner experiment
```

The experiment workspace is `teacher state at anchor timestamp + learner file delta`. **Save Experiment** persists that branch. **Resume Lecture** reconstructs teacher truth at the anchor and continues the original timeline. A saved violet marker does nothing when ordinary playback passes it; selecting it explicitly reconstructs its historical teacher base and applies the learner delta.

## State transitions

```text
idle/teacher playback
  -> Try It Yourself
learner-editing(anchor timestamp)
  -> Save Experiment
saved learner-editing + timeline marker
  -> Resume Lecture
teacher state reconstructed at anchor + playback continues
  -> marker click
learner-editing(checkpoint timestamp + checkpoint delta)
```

Unsaved learner edits produce a dirty indicator. Resuming while dirty requires **Save and Resume**, **Resume Without Saving**, or **Cancel**. This is loss protection, not a merge conflict.

## Persistence

The existing `LearnerDelta` is the checkpoint artifact. It remains keyed by learner, lesson, recording id/version, teacher timestamp, and historical base hash. Local lesson work uses IndexedDB with the compatibility localStorage mirror; published lesson work uses the remote adapter and server-derived demo identity.

The learner player loads all user-scoped deltas for the recording and groups them by `teacherTimestampMs`. One marker is rendered per timestamp. The newest save opens by default, while `versionCount` reports older saves retained at that timestamp.

## Deterministic restoration

Teacher state is reconstructed by restoring `baseFiles` and applying ordered teacher events through the target timestamp. Opening a checkpoint then applies its complete file-level result. Trusted programmatic workspace operations create/update files and remove files absent from the restored snapshot while playback guards prevent those operations from being recorded.

A checkpoint opens automatically only when recording id, recording version, and historical base hash match. A mismatch is an exceptional incompatible-lecture-version status. A later teacher edit to the same file is not a conflict because it belongs to a later point on the immutable lecture timeline.

## Timeline UI

`InteractiveEditorPlayer` renders accessible violet marker buttons over the real range timeline. Marker position is `teacherTimestampMs / recordingDurationMs`. The marker title reports timestamp, changed-file count, and saved-version count. Passing a marker during playback has no side effect.

`InteractiveLearnerPlayback` provides:

- **Try It Yourself**;
- **Save Experiment**;
- **Resume Lecture**;
- dirty/saved status;
- an unsaved-work decision panel;
- a **My Experiments** list synchronized with timeline markers.

## Safety properties

- teacher recordings remain immutable;
- normal playback always returns to teacher truth;
- learner experiments remain user-scoped and separate;
- later teacher events never trigger a normal checkpoint conflict prompt;
- programmatic reconstruction is guarded from recording;
- file paths remain normalized to leading-slash form;
- no automatic merge or screen-video capture is introduced.
