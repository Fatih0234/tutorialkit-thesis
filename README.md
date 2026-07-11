# Interactive Tutorial Thesis Demo

This repository is a thesis proof of concept built on TutorialKit. It implements the interactivity layer for recording a teacher's editor/file actions, replaying them for a learner, pausing for learner-owned edits, and safely saving/restoring those edits without mutating the teacher timeline.

The current demo includes a separated Lecture Setup → Material Preparation → full-screen Recording Studio → Recording Review flow, a shared seekable editor player for teachers and learners, timestamped learner-experiment markers, optional narration, synchronized Instructor Camera, and an Excalidraw-powered timeline whiteboard, local drafts, file-backed published lessons, and demo identity/ownership checks. Portable packages and deterministic fixture controls remain supported contracts outside the minimal default UI. It is not a production authentication or persistence system.

## Quick start

### Requirements

The release candidate is pinned in [`.tool-versions`](./.tool-versions):

- Node.js `20.19.0` (the repository supports Node.js `>=18.18.0`)
- pnpm `8.15.6`

If Corepack is available, enable it so the `packageManager` version in `package.json` is used:

```bash
corepack enable
pnpm --version
node --version
```

### Install and run

```bash
pnpm install
pnpm build
pnpm --dir e2e run dev
```

Open:

```text
http://localhost:4329/tests/file-tree/lesson-and-solution
```

The E2E lesson app mounts the local `/api/interactive/*` middleware required by published lessons, demo identity, and demo seed/reset.

For the production-like preview used by Playwright:

```bash
pnpm --dir e2e run preview
```

Open `http://localhost:4329/tests/file-tree/lesson-and-solution`.

The interactive product now mounts in a dedicated full-viewport application root outside TutorialKit's standard resizable layout. Teacher Studio and Interactive Lessons contain management only; preparation, recording, review, and learner playback use the persistent real editor, terminal, and live website preview as an immersive video-like surface with a full-width timeline. Foldable context panels and timeline-directed preview, explanation, multi-slide deck, whiteboard, and camera resources restore lesson context while learners retain local presentation control. Teachers prepare a whiteboard scene before recording and record debounced semantic scene snapshots—not raw pointer movement—while learners receive deterministic read-only playback. See [Immersive Interactive Experience](./docs/immersive-interactive-experience.md) and [Presentation Resource Layer](./docs/presentation-resource-layer.md).

## Validation

Run the release-candidate build and full interactive POC suite:

```bash
pnpm build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  TK_POC_URL=http://localhost:4329 \
  PLAYWRIGHT_HTML_OPEN=never \
  pnpm --dir e2e exec playwright test interactive-poc.spec.ts --project=Default
git diff --check
```

Expected interactive POC result with synchronized whiteboard coverage: **39 passed**.

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` may be changed to the path of a compatible local Chromium installation.

## Management experience

Teacher Studio now focuses on lecture setup and existing recordings. Material editing and recording open dedicated immersive workspaces; saving and publishing are available only on Recording Review. Existing published review is read-only, publication consumes the matching draft, and owners can permanently delete a published lesson through a confirmed card action that also removes linked media and learner experiments. Interactive Lessons presents published lectures as simple lesson cards with one **Start Lesson** action.

Technical status, package import/export, and demo seed/reset capabilities remain part of the POC contracts and automated validation but are intentionally absent from the default product interface. `.interactive-data/` remains gitignored local development persistence.

For the complete teacher and learner-experiment walkthrough, see [the thesis demo script](./docs/thesis-demo-script.md).

## Documentation

- [Documentation map and source-of-truth guide](./docs/README.md)
- [Architecture summary](./docs/thesis-architecture-summary.md)
- [Detailed POC architecture](./docs/interactive-poc-architecture.md)
- [Immersive teacher and learner experience](./docs/immersive-interactive-experience.md)
- [Interactive recording studio workflow](./docs/interactive-recording-studio.md)
- [Learner timeline experiments](./docs/learner-timeline-experiments.md)
- [Persistence contract](./docs/interactive-persistence-contract.md)
- [Thesis demo script](./docs/thesis-demo-script.md)
- [Evaluation checklist](./docs/evaluation-checklist.md)
- [Release checklist](./docs/release-checklist.md)
- [Limitations and future work](./docs/limitations-and-future-work.md)
- [Implementation timeline](./docs/implementation-timeline.md)

`docs/00-context.md` through `docs/05-acceptance-criteria.md`, `docs/local-findings.md`, and `agent-tasks/phase-*.md` are retained historical planning/baseline evidence. They describe the incremental starting phases, not the current product surface; use the architecture, persistence, and experience documents above as the current source of truth.

## Core safety properties

- Saved teacher-recording content is immutable; only explicit owner-authorized deletion removes an entire publication.
- Learner work is stored separately and scoped to the signed-in learner.
- Playback-applied changes are guarded from recording.
- Internal file paths use leading-slash form.
- Lecture playback always reconstructs teacher truth; learner experiments reopen only from their timestamped markers.
- No automatic learner/teacher merge occurs.
- Local drafts use IndexedDB, while published demo data uses `.interactive-data/` through the remote storage adapter.

## Upstream project

This thesis repository retains the TutorialKit source tree. TutorialKit by StackBlitz is a framework for creating interactive coding tutorials. Upstream documentation is available at [tutorialkit.dev](https://tutorialkit.dev/), and contribution guidance remains in [CONTRIBUTING.md](./CONTRIBUTING.md).
