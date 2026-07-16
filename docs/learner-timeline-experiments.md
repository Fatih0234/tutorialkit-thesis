# Learner branches, checkpoints, and history

The learner experience uses a local-first, Scrimba-style takeover model. The teacher recording remains immutable and the learner never needs to click a separate pause-to-edit action.

## Takeover

While playback is active, focus, cursor movement, selection, and scrolling do not pause playback or create history. The first user-originated project mutation synchronously:

1. pauses the teacher playback drivers without resetting their event cursor;
2. captures the exact displayed teacher timestamp and last applied event sequence;
3. hashes the visible normalized teacher files;
4. creates a learner-owned branch and working tree;
5. allows the initiating mutation to continue.

Programmatic playback, seeking, restoration, and runtime synchronization are explicitly annotated and cannot trigger takeover.

## History model

A learner branch has an immutable `ORIGIN`, append-only learner events, a recoverable working tree, and immutable named commits. `HEAD` is the branch tip; selecting an earlier event or checkpoint changes only the viewed position. Editing that historical position creates a child branch and preserves the parent's later work.

The default **Lesson** timeline shows playback progress and history groups anchored at takeover timestamps: purple diamonds represent checkpoints, orange circles represent dirty drafts, and a purple marker receives an orange badge when newer unsaved work exists. Internal teacher events and granular autosave events are not drawn.

Opening a marker pauses playback without seeking, reveals the complete branching **My work** graph, and automatically selects the most recently modified branch state in that group (its autosaved draft/HEAD when dirty, otherwise its latest checkpoint). Selecting another Started here/ORIGIN, checkpoint, or Latest work/HEAD node changes only editor files; lesson and media positions remain fixed. Pressing Play reconstructs teacher editor truth at that current paused lesson position and continues from there without deleting learner branches.

## Save and Run

`Ctrl/Cmd+S` creates a named checkpoint only when the working tree is dirty. Repeated saves without edits are no-ops. Local autosave is not a checkpoint. Orange file-tree dots identify changed files only while the visible workspace is the dirty learner HEAD; they hide while following the teacher or inspecting ORIGIN/a checkpoint and return when dirty HEAD is reopened. Instructor presence remains editor-only.

Run executes the current visible working tree. It does not create a checkpoint or mark the branch clean.

## Persistence

IndexedDB is authoritative during interaction. Branch aggregates synchronize remotely after branch creation, checkpoints, a bounded edit debounce, and safe visibility loss. Remote failure never blocks typing; local work remains valid and reports sync pending.

The remote server derives ownership from the authenticated session, validates recording/version/ORIGIN/materialization, and never exposes another learner's branches. Repeated writes are idempotent. Divergence is retained as a separate branch rather than overwritten.

## Legacy compatibility

Existing `LearnerDelta` records remain readable as imported single-checkpoint branches. They are converted lazily when opened and edited or saved. The old Pause/Save Experiment workflow is no longer a primary UI path, and no new learner work is written in the legacy delta format.

## Accessibility

- Teacher and learner cursors have text labels as well as blue/orange styling.
- ORIGIN, branch HEADs, and checkpoints are keyboard-operable graph buttons with descriptive labels; granular autosave events remain internal.
- Checkpoint and sync status is announced through an `aria-live` region.
- The My Work library groups work sessions by lesson position, summarizes autosaved drafts, checkpoints, alternative paths, and file-level changes, and never exposes internal event numbers. Opening it moves focus to Close; closing returns focus to the trigger.
- Checkpoints and autosaved drafts include an editable **Learner changes** lens. It compares the visible file with teacher truth at the exact takeover position, starts with review mode off so normal editing remains visually clean. Enabling **Review learner changes** renders a unified inline diff: teacher lines appear as red, non-editable `−` ghost rows with original line numbers, while the learner's real editable lines appear green with `+` gutter markers. All changed areas expand together; previous/next navigation and the toggle remain presentation-only. Decoration and navigation transactions never create learner history. The lens disappears while following the teacher.
- Instructor presence never moves learner focus or native editor selection.
