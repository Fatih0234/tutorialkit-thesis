# Phase 5: Restore Learner Delta

## Agent task

Implement `Restore Learner Delta`.

When clicked:

- load latest learner delta
- materialize teacher state at delta timestamp
- apply delta's added/modified/removals
- update workspace files

## Acceptance

Playwright can:

1. save a learner delta
2. reset/replay teacher state
3. restore learner delta
4. assert learner edits return
