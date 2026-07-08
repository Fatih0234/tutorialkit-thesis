# Phase 2: Timeline Playback

## Agent task

Implement playback for:

- `file.opened`
- `file.changed`

When playback starts:

- load latest recording
- reset files to recording base state
- apply events in timestamp order

During playback:

- set a programmatic-change guard
- do not record playback-applied updates
- update visible playhead/debug state

## Acceptance

Playwright can:

1. create/load a recording
2. play recording
3. assert editor content reaches teacher final content
