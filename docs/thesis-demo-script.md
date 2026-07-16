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

Expected result after published-lesson management: **40 passed** in `interactive-poc.spec.ts`.

## 4. Prepare the demonstration

The normal product interface intentionally omits seed/reset and package tooling. Start with an existing published lesson or create one through the teacher flow below. Automated Playwright fixtures continue to prepare deterministic demo data directly through the local persistence API.

## 5. Teacher walkthrough

1. In the **Account** selector, choose **Teacher Demo**.
2. In **Lecture Setup**, choose the initial file and recording mode.
3. Optionally select **Edit Materials**, prepare the starting workspace, and exit preparation.
4. Select **Start Recording**, confirm the full-screen red **Recording in progress** studio appears, edit `example.js`, and select **Stop Recording**.
5. In immersive **Recording Review**, click **Save Draft**.
6. Demonstrate play, pause, restart, and the seekable editor timeline.
7. Click **Publish** to write immutable recording content to `.interactive-data/`; return to Teacher Studio and show that the matching Draft card is gone.
8. Use **View Lesson** and confirm published review is read-only: it shows **Published** and offers neither **Save Draft** nor **Publish**.

## 6. Learner walkthrough

1. Switch to **Learner Lesson**.
2. In the **Account** selector, choose **Learner Demo**.
3. Click **Start Lesson** on a published lesson card and point out that management disappears into a full-screen editor player.
4. Use the round **Play** control on the Lesson timeline; My work remains hidden until takeover.
5. Focus the editor, move the cursor, and select text; confirm playback continues and both cursor identities remain visible.
6. Type one character. Confirm playback pauses atomically, the character remains, and ORIGIN appears.
7. Continue editing `example.js` and confirm **Unsaved changes** appears.
8. Press `Ctrl/Cmd+S`; point out the grouped purple Lesson marker, named checkpoint, and HEAD.
9. Let playback advance, open the marker, and show that playback pauses without seeking. Select the first checkpoint in the complete My work graph to change only the editor.
10. Edit that historical state, show the alternative path in the graph, then open **My Work** to show its work-session and changed-file summary.
11. Click the normal Play control and verify teacher truth returns, My work collapses, and neither learner branch is deleted.

## 7. Persistence and isolation walkthrough

1. Create a dirty learner branch and wait for the sync status to report **synced**.
2. Reload with local learner-history stores cleared; verify the remote working tree and branch return.
3. Switch to Learner Two and confirm Learner Demo's history is unavailable.
4. Switch back to Learner Demo and confirm both parent and forked branches remain available.
5. Explain that retries are idempotent and unresolved cross-browser divergence is retained as another branch, never silently overwritten.

Teacher-recording content and learner history remain separate artifacts. Optionally return as Teacher Demo and demonstrate owner-only whole-lesson deletion last.

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
- Checkpoint and dirty-draft history is grouped at one marker per takeover timestamp; the complete My work fork graph provides detailed selection.
- Terminal recording, iframe internals recording, transcript generation, analytics, and production auth are out of scope.
