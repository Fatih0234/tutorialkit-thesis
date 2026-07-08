# Context

We are using ITSS as the interaction-model reference and TutorialKit as the likely editor/workspace foundation.

## ITSS design lesson

ITSS records browser interactions as text/audio artifacts rather than normal video frames. The important ideas to preserve are:

- recording actions with timestamps
- replaying actions on a synchronized timeline
- allowing learners to pause/rewind/forward
- allowing learner practice while watching teacher replay

## What we are adding beyond ITSS

The learner should be able to pause the teacher timeline, edit code, and save only their own changes as a learner delta/snapshot.

The teacher timeline remains immutable.

## First technical direction

Use:

```text
Immutable Teacher Timeline + Persistent My Workspace + File-Level Learner Deltas
```

Do not attempt live merge/overlay in the first POC.
