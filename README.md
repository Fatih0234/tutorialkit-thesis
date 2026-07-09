# Interactive Tutorial Thesis Demo

This repository is a thesis proof of concept built on TutorialKit. It implements the interactivity layer for recording a teacher's editor/file actions, replaying them for a learner, pausing for learner-owned edits, and safely saving/restoring those edits without mutating the teacher timeline.

The release-candidate demo includes Teacher Studio and Learner Lesson flows, optional narration/webcam attachments, local drafts, file-backed published lessons, demo identity and ownership checks, explicit conflict choices, portable recording packages, and deterministic demo seed/reset controls. It is not a production authentication or persistence system.

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

Expected Playwright result for Milestone I: **31 passed**.

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` may be changed to the path of a compatible local Chromium installation.

## Demo seed and reset

1. Open **Teacher Studio**.
2. In **Demo Identity**, choose **Sign in as Teacher Demo**.
3. To start clean, select **Reset Demo Data**, then **Confirm Reset Demo Data**.
4. Select **Demo Seed**.
5. Confirm that `demo-interactive-conflict-flow` appears under **Published Lessons**.
6. Switch to **Learner Lesson**, sign in as **Learner Demo**, and open the seeded lesson.

Reset removes only demo-prefixed recordings, linked media, and linked learner deltas. `.interactive-data/` is gitignored local demo persistence; deleting that directory manually also produces a clean local server state.

For the complete teacher, learner, conflict, and export/import walkthrough, see [the thesis demo script](./docs/thesis-demo-script.md).

## Documentation

- [Architecture summary](./docs/thesis-architecture-summary.md)
- [Detailed POC architecture](./docs/interactive-poc-architecture.md)
- [Persistence contract](./docs/interactive-persistence-contract.md)
- [Thesis demo script](./docs/thesis-demo-script.md)
- [Evaluation checklist](./docs/evaluation-checklist.md)
- [Release checklist](./docs/release-checklist.md)
- [Limitations and future work](./docs/limitations-and-future-work.md)
- [Implementation timeline](./docs/implementation-timeline.md)

## Core safety properties

- Saved teacher recordings are immutable.
- Learner work is stored separately and scoped to the signed-in learner.
- Playback-applied changes are guarded from recording.
- Internal file paths use leading-slash form.
- Conflict resolution is explicit; no automatic merge occurs.
- Local drafts use IndexedDB, while published demo data uses `.interactive-data/` through the remote storage adapter.

## Upstream project

This thesis repository retains the TutorialKit source tree. TutorialKit by StackBlitz is a framework for creating interactive coding tutorials. Upstream documentation is available at [tutorialkit.dev](https://tutorialkit.dev/), and contribution guidance remains in [CONTRIBUTING.md](./CONTRIBUTING.md).
