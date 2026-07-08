# Interactive Programming Tutorial POC Starter

This starter kit is meant to be dropped into the root of a TutorialKit-based project or a fresh project folder that will later vendor/fork TutorialKit.

The goal is a minimal, testable interactivity spike:

- Teacher records timestamped editor/file actions.
- Teacher timeline can be replayed.
- Learner can pause and edit.
- Learner changes are saved as deltas/snapshots.
- Teacher timeline remains immutable.

This starter does **not** implement backend persistence, AI tutor behavior, Flue integration, terminal recording, or production UI.
Start with localStorage and Playwright-verifiable behavior.

Recommended first command after dropping into a repo:

```bash
bash scripts/phase0-grep.sh
```

Then give the coding agent the tasks in `agent-tasks/` in order.
