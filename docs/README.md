# Documentation map

This map distinguishes the current implementation contract from retained historical planning evidence.

## Current product and architecture

Read these documents as the current source of truth, in this order:

1. [`../README.md`](../README.md) — quick start, validation, and product summary.
2. [`thesis-architecture-summary.md`](./thesis-architecture-summary.md) — compact end-to-end architecture.
3. [`interactive-poc-architecture.md`](./interactive-poc-architecture.md) — detailed runtime, React, storage, and UI architecture.
4. [`interactive-persistence-contract.md`](./interactive-persistence-contract.md) — authoritative local/remote persistence, ownership, migration, and deletion contract.
5. [`immersive-interactive-experience.md`](./immersive-interactive-experience.md) — management/workspace screen ownership.
6. [`interactive-recording-studio.md`](./interactive-recording-studio.md) — teacher preparation, recording, and review.
7. [`learner-timeline-experiments.md`](./learner-timeline-experiments.md) — automatic takeover, branches, checkpoints, rewind, forks, and legacy migration.
8. [`presentation-resource-layer.md`](./presentation-resource-layer.md) — preview, explanation, progressive deck, and Instructor Camera resources.
9. [`ai-learning-assistant.md`](./ai-learning-assistant.md) — learner-only contextual AI assistant boundaries and operation.

The current lifecycle is:

- local drafts live in IndexedDB;
- Save Draft and Publish exist only in Recording Review;
- published review is read-only and never creates a draft;
- successful publication consumes the matching local draft/media;
- draft deletion is local and permanent;
- owner-confirmed published deletion removes the publication, linked media, and linked learner deltas;
- recording content remains immutable while the publication exists;
- learner work remains separate and user-scoped.

## Operation and evidence

- [`thesis-demo-script.md`](./thesis-demo-script.md)
- [`interactive-counter-demo.md`](./interactive-counter-demo.md) — ready-to-record counter lecture, learner challenge, and shot sequence.
- [`evaluation-checklist.md`](./evaluation-checklist.md)
- [`release-checklist.md`](./release-checklist.md)
- [`limitations-and-future-work.md`](./limitations-and-future-work.md)
- [`implementation-timeline.md`](./implementation-timeline.md)

The validated current Playwright expectation is **43 passed** in `interactive-poc.spec.ts`.

## Historical evidence

The following files intentionally preserve earlier investigation, plans, and acceptance criteria. Their references to minimal debug controls, direct localStorage phases, or not-yet-implemented behavior describe the state at that historical phase and are not current UI requirements:

- `00-context.md` through `05-acceptance-criteria.md`;
- `local-findings.md`;
- `../agent-tasks/phase-*.md`.

The copied `docs/demo/` and `docs/tutorialkit.dev/` trees are upstream/reference content rather than specifications for this POC.
