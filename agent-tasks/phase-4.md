# Phase 4: Learner Delta Saving

## Agent task

Implement `Save Learner Delta`.

When clicked:

- materialize teacher state at paused timestamp
- take learner snapshot
- compute file-level diff
- save `LearnerDelta` to localStorage key `interactive-poc.learnerDeltas`

## Acceptance

Playwright can:

1. pause playback
2. edit a file
3. save learner delta
4. assert localStorage delta includes changed file content
