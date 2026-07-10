# Immersive interactive experience

The interactive POC now separates management from the editor playback surface. Storage, recording, playback, and learner checkpoint contracts remain unchanged.

## Product shells

The full-viewport product root has two kinds of screens:

- **management screens**: Teacher Studio and Interactive Lessons;
- **immersive workspace screens**: material preparation, recording, recording review, and learner playback.

The normal TutorialKit lesson remains the source of files and the real editor, but it is covered by the product shell. Management controls are never rendered inside an active player.

## Session lifecycle

`interactive-session.ts` owns explicit screen transitions:

```text
teacher-dashboard → teacher-materials → teacher-recording → teacher-review
learner-library → learner-player
```

Selected and active recording identifiers are separate. A library selection does not become the active player recording until the learner opens it. Exiting an active player pauses playback. Exiting learner edit mode still uses the existing dirty-work confirmation and deterministic teacher restoration.

## Learner player

The learner player uses the real TutorialKit file tree and editor as its visual frame. A full-width bottom control bar contains:

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

Teacher Studio contains recording libraries, setup, identity, persistence, publishing, package, and demo actions. Material preparation opens the isolated editor without recording. Recording uses the minimal red studio HUD. Review reuses the same bottom video controls and exposes only Dashboard, Save Draft, and Publish in its header.

## Preserved invariants

- teacher recordings are immutable during learner activity;
- learner checkpoints remain user-scoped `LearnerDelta` records;
- normal playback never applies learner markers;
- resuming reconstructs teacher truth;
- seeking rematerializes deterministic teacher state;
- media and structured timeline events share one playhead;
- compatibility localStorage keys and storage adapters are unchanged;
- networking remains isolated to the remote storage adapter.
