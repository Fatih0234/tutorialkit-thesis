# Milestone I release checklist

Use this checklist from the repository root to prepare or review the thesis release candidate.

## 1. Source and toolchain

- [ ] Check out the release branch and update it:

```bash
git checkout milestone-i/release-candidate-thesis-pack
git pull --ff-only
```

- [ ] Confirm the pinned toolchain:

```bash
node --version   # expected v20.19.0 for the pinned environment
pnpm --version   # expected 8.15.6
```

- [ ] Install dependencies without changing product behavior:

```bash
pnpm install
```

- [ ] Confirm `.interactive-data/` remains gitignored and no demo persistence is staged.

## 2. Automated release validation

- [ ] Build all release packages:

```bash
pnpm build
```

- [ ] Run the complete interactive POC test file with local Chromium:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  TK_POC_URL=http://localhost:4329 \
  PLAYWRIGHT_HTML_OPEN=never \
  pnpm --dir e2e exec playwright test interactive-poc.spec.ts --project=Default
```

Expected result: **31 passed**.

- [ ] Check whitespace and repository state:

```bash
git diff --check
git status --short --branch
```

- [ ] If a test fails, preserve the Playwright report/trace as evidence, reproduce the individual test with `--grep`, fix only confirmed bugs or test brittleness, and rerun the full file before release.

## 3. Manual demo preparation

- [ ] Start from clean demo records using either the UI reset below or, before the server starts, `rm -rf .interactive-data`.
- [ ] Start the E2E lesson app:

```bash
pnpm --dir e2e run dev
```

- [ ] Open `http://localhost:4329/tests/file-tree/lesson-and-solution` (or the next available port printed by Astro).
- [ ] Confirm the page shows **Interactive Thesis Demo**, **Demo Identity**, **Teacher Studio**, **Learner Lesson**, and **Thesis demo walkthrough**.

## 4. Deterministic seed/reset check

- [ ] In the **Demo Identity** selector, choose **Sign in as Teacher Demo**.
- [ ] Expand **Import, Export, and Demo Tools**, then select **Reset Demo Data** and **Confirm Reset Demo Data**.
- [ ] Confirm reset reports success and does not remove a known non-demo record if one is used for the evaluation.
- [ ] Select **Demo Seed**.
- [ ] Expand **Recording Library** and confirm `demo-interactive-conflict-flow` appears under **Published Lessons**.

## 5. Teacher demonstration check

- [ ] Record and stop a timeline-only editor change, or use the seeded recording.
- [ ] Save and preview a local IndexedDB draft.
- [ ] Publish and preview an immutable published lesson.
- [ ] Expand **Import, Export, and Demo Tools**, then export the selected recording with **Export Package**.
- [ ] Confirm exported JSON contains `formatVersion: 1`, `teacherRecording`, `mediaAssets`, and no session cookie/id.
- [ ] Import the package as a draft and confirm the status reports a new copied recording id.
- [ ] Import it as published and confirm it appears as a separate published copy.

## 6. Learner and conflict demonstration check

- [ ] Switch to **Learner Lesson** and choose **Sign in as Learner Demo** in the **Demo Identity** selector.
- [ ] Open and play `demo-interactive-conflict-flow`.
- [ ] Choose **Try It Yourself** before the future teacher `/example.js` edit.
- [ ] Edit `/example.js` and select **Save My Work**.
- [ ] Resume teacher playback and verify learner work remains saved.
- [ ] Select **Restore My Work** and demonstrate the conflict panel.
- [ ] Verify **View Conflict Details** identifies `/example.js` and the later teacher event.
- [ ] Demonstrate at least one resolution action; explain that no automatic merge or source mutation occurs.
- [ ] If evaluating all choices, reseed/repeat as described in [`thesis-demo-script.md`](./thesis-demo-script.md).

## 7. Evidence capture

- [ ] Record the release commit hash and environment in [`evaluation-checklist.md`](./evaluation-checklist.md).
- [ ] Retain the terminal output showing build success and **31 passed**.
- [ ] Capture screenshots or video only if required by the thesis evidence protocol; do not treat screenshots as a replacement for automated assertions.
- [ ] Note any deviation from the scripted flow and whether it changes an architectural claim.

## 8. Known non-blocking logs

The validated local environment may print these messages even when build and all tests pass:

```text
✘ [ERROR] The build was canceled
ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
[DEP0205] DeprecationWarning: `module.register()` is deprecated. Use `module.registerHooks()` instead.
```

These are currently non-blocking only when the build command exits successfully, the preview server becomes ready, and the full suite reports **31 passed**. Treat any different error, server startup failure, test timeout, failed assertion, or non-zero final command as a release blocker until investigated.

## 9. Cleanup

- [ ] In Teacher Studio, expand **Import, Export, and Demo Tools**, then select **Reset Demo Data** and **Confirm Reset Demo Data** to remove demo-prefixed recording/media/delta records while preserving sessions and non-demo data.
- [ ] Stop the dev/preview server.
- [ ] Remove all local development persistence only when a completely clean machine state is intended:

```bash
rm -rf .interactive-data
```

- [ ] Optionally clear browser site data/IndexedDB for `localhost` to remove local drafts; do not confuse browser draft cleanup with server demo reset.
- [ ] Delete downloaded package fixtures that contain demonstration content if they are no longer evidence artifacts.
- [ ] Confirm no `.interactive-data`, Playwright report, downloaded package, or browser state artifact is staged for commit.

## Release decision

Release candidate status: `PASS / FAIL`

Reviewer: `________________`  Date: `________________`  Commit: `________________`

Open blockers or evidence notes:

```text
____________________________________________________________________
____________________________________________________________________
```
