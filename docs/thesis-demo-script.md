# Thesis demo script

Use this script for the final interactive tutorial thesis demonstration on the Milestone I release-candidate branch.

## 1. Setup

```bash
git checkout milestone-i/release-candidate-thesis-pack
git pull
pnpm install
pnpm build
```

Optional clean demo data reset before the live run:

```bash
rm -rf .interactive-data
```

`.interactive-data/` is gitignored local demo persistence. Do not commit it.

## 2. Run the demo app

Use the E2E lesson app because it mounts the interactive persistence middleware used by the thesis demo:

```bash
pnpm --dir e2e run dev
```

Open:

```text
http://localhost:4329/tests/file-tree/lesson-and-solution
```

For a production-like static preview with the same local API middleware:

```bash
pnpm --dir e2e run preview
```

Then open:

```text
http://localhost:4329/tests/file-tree/lesson-and-solution
```

## 3. Playwright validation

```bash
pnpm build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium TK_POC_URL=http://localhost:4329 PLAYWRIGHT_HTML_OPEN=never pnpm --dir e2e exec playwright test interactive-poc.spec.ts --project=Default
```

Expected result after the draft-lifecycle correction: **36 passed** in `interactive-poc.spec.ts`.

## 4. Prepare the demonstration

The normal product interface intentionally omits seed/reset and package tooling. Start with an existing published lesson or create one through the teacher flow below. Automated Playwright fixtures continue to prepare deterministic demo data directly through the local persistence API.

## 5. Teacher walkthrough

1. In the **Account** selector, choose **Teacher Demo**.
2. In **Lecture Setup**, choose the initial file and recording mode.
3. Optionally select **Edit Materials**, prepare the starting workspace, and exit preparation.
4. Select **Start Recording**, confirm the full-screen red **Recording in progress** studio appears, edit `example.js`, and select **Stop Recording**.
5. In immersive **Recording Review**, click **Save Draft**.
6. Demonstrate play, pause, restart, and the seekable editor timeline.
7. Click **Publish** to write the immutable recording to `.interactive-data/`.
8. Return to Teacher Studio and use the recording card's **View Lesson** action to show the published replay path.

## 6. Learner walkthrough

1. Switch to **Learner Lesson**.
2. In the **Account** selector, choose **Learner Demo**.
3. Click **Start Lesson** on a published lesson card and point out that management disappears into a full-screen editor player.
5. Use the round **Play** control on the full-width bottom timeline.
6. Click **Pause and Experiment** while playback is running.
7. Edit `example.js`.
8. Confirm the **Unsaved changes** indicator appears.
9. Click **Save Experiment** and point out the violet marker on the timeline.
10. Click **Return to Lecture** and verify the editor returns to the teacher's original timeline.
11. Let playback pass the marker; explain that the marker has no automatic effect.
12. Click the marker and verify the learner experiment reopens at its original lecture timestamp.

## 7. Timestamped learner-experiment walkthrough

The seeded demo is deterministic. Its retained legacy id is `demo-interactive-conflict-flow`, and it includes a later teacher edit (`// teacher demo final edit`) plus stable fake `audio/wav` media.

Flow:

1. Seed the demo as Teacher Demo.
2. In the **Demo Identity** selector, choose **Sign in as Learner Demo**.
3. Open and play the Published Lesson.
4. Click **Pause and Experiment** before the teacher's later `/example.js` edit.
5. Add a learner edit to `/example.js`.
6. Click **Save Experiment**.
7. Confirm one violet marker and one **My Experiments** entry appear at the paused timestamp.
8. Click **Return to Lecture** and verify the teacher's later edit becomes visible while learner code disappears from the playback workspace.
9. Click the saved marker.
10. Verify the historical teacher state plus learner edit reappears, without a conflict prompt.

No merge runs. The teacher recording and learner checkpoint remain separate immutable-source artifacts.

## 8. Package compatibility

Import/export remains a supported persistence contract but is no longer part of the default teacher or learner interface. Contract-level validation should use the runtime package APIs and automated tests rather than adding technical controls back to management pages.

## 9. Known limitations

- Demo identity is not production authentication.
- Session data is local and file-backed under `.interactive-data/sessions/`.
- Published/demo persistence is local file storage under `.interactive-data/`, not a production database.
- Media blobs are local IndexedDB or `.interactive-data/media-assets/`, not cloud object storage.
- Export packages are thesis-demo JSON/base64 artifacts, not a stable public archive format.
- Structured replay is not replaced by screen video.
- No automatic merge or patch/hunk merge engine exists.
- Checkpoint version history is grouped at one marker per timestamp; there is not yet a dedicated version-history chooser.
- Terminal recording, iframe internals recording, transcript generation, analytics, and production auth are out of scope.
