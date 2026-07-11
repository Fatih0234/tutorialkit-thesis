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

Expected current result: **37 passed**.

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
- [ ] Confirm the page shows **Interactive Learning**, **Account**, **Teacher Studio**, and **Learner Lesson** without walkthrough, debug, technical, package, or demo controls.

## 4. Deterministic fixture check

- [ ] Run the Playwright fixture coverage for demo seed/reset through the local persistence API.
- [ ] Confirm reset preserves non-demo records and the deterministic published lesson can be opened from a product-facing card.

## 5. Teacher demonstration check

- [ ] Confirm **Lecture Setup** hides the editor and exposes initial-file and recording-mode choices.
- [ ] Open **Edit Materials**, confirm recording is off, prepare the workspace, and return with **Use This Workspace**.
- [ ] Select **Start Recording** and confirm the full-screen studio shows elapsed time, event count, media status, and the prominent **Stop Recording** action.
- [ ] Stop and confirm **Recording Review** exposes play, pause, restart, and the seekable editor timeline, or use the seeded recording.
- [ ] Confirm setup does not duplicate Save Draft or Publish.
- [ ] Save a local IndexedDB draft from Recording Review and reopen it with **Open Review**.
- [ ] Publish a lesson from Recording Review; confirm its matching draft is removed, then reopen it with **View Lesson**.
- [ ] Confirm published review is read-only and does not recreate a draft.
- [ ] Confirm owner-only **Delete Lesson** requires a second click, removes linked learner work/media, disappears after reload, and does not affect unrelated resources.
- [ ] Validate package import/export and demo seed/reset contracts through automated integration coverage, not the default product UI.

## 6. Learner experiment demonstration check

- [ ] Switch to **Learner Lesson** and choose **Learner Demo** in the **Account** selector.
- [ ] Open and play `demo-interactive-conflict-flow` (legacy deterministic seed id).
- [ ] Choose **Pause and Experiment** before the future teacher `/example.js` edit.
- [ ] Edit `/example.js` and select **Save Experiment**.
- [ ] Verify a violet marker and **My Experiments** entry appear at the paused timestamp.
- [ ] Select **Return to Lecture** and verify teacher truth is restored before playback continues.
- [ ] Verify playback passes the marker without applying learner work.
- [ ] Select the marker and verify the learner experiment reopens from its historical teacher state without a conflict prompt.
- [ ] Repeat with unsaved work and demonstrate **Save and Resume**, **Resume Without Saving**, and **Cancel**.

## 7. Evidence capture

- [ ] Record the release commit hash and environment in [`evaluation-checklist.md`](./evaluation-checklist.md).
- [ ] Retain the terminal output showing build success and **37 passed**.
- [ ] Capture screenshots or video only if required by the thesis evidence protocol; do not treat screenshots as a replacement for automated assertions.
- [ ] Note any deviation from the scripted flow and whether it changes an architectural claim.

## 8. Known non-blocking logs

The validated local environment may print these messages even when build and all tests pass:

```text
✘ [ERROR] The build was canceled
ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
[DEP0205] DeprecationWarning: `module.register()` is deprecated. Use `module.registerHooks()` instead.
```

These are currently non-blocking only when the build command exits successfully, the preview server becomes ready, and the full suite reports **37 passed**. Treat any different error, server startup failure, test timeout, failed assertion, or non-zero final command as a release blocker until investigated.

## 9. Cleanup

- [ ] Use the automated local persistence API fixture to remove demo-prefixed recording/media/delta records while preserving sessions and non-demo data.
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
