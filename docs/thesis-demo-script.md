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

Expected result after the recording-studio refinement: **34 passed** in `interactive-poc.spec.ts`.

## 4. Reset and seed demo data

1. Open **Teacher Studio**.
2. In the **Demo Identity** selector, choose **Sign in as Teacher Demo**.
3. Expand **Import, Export, and Demo Tools**.
4. Click **Reset Demo Data**, then **Confirm Reset Demo Data**.
5. Click **Demo Seed**.
6. Expand **Recording Library** and confirm the Published Lesson selector contains:

```text
demo-interactive-conflict-flow
```

Reset only removes `demo-` prefixed recordings/media/deltas. Non-demo recordings and sessions remain.

## 5. Teacher walkthrough

1. In the **Demo Identity** selector, choose **Sign in as Teacher Demo**.
2. In **Teacher Studio**, either:
   - expand **Import, Export, and Demo Tools** and click **Demo Seed**, or
   - use **Lecture Setup** to choose the initial file and recording mode;
   - optionally select **Edit Materials**, prepare the starting workspace, and select **Use This Workspace**;
   - select **Start Recording**, confirm the full-screen red **Recording in progress** studio appears, edit `example.js`, and select the prominent **Stop Recording** action.
3. In **Recording Review**, click **Save Draft** for local IndexedDB draft storage.
4. Click **Play Preview**, then demonstrate pause, restart, and the seekable **Editor playback timeline**.
5. Click **Publish Recording** to write the immutable recording to `.interactive-data/`.
6. Use **Preview Published Lesson** to show the published replay path.
7. Expand **Import, Export, and Demo Tools** and use **Export Package** to download a portable JSON package.

## 6. Learner walkthrough

1. Switch to **Learner Lesson**.
2. In the **Demo Identity** selector, choose **Sign in as Learner Demo**.
3. Select the Published Lesson.
4. Click **Open Published Lesson**.
5. Click **Play Lesson**.
6. Click **Try It Yourself** while playback is running.
7. Edit `example.js`.
8. Click **Save My Work**.
9. Click **Resume Teacher**.
10. Click **Restore My Work** after teacher playback finishes or overwrites the visible workspace.

## 7. Conflict walkthrough

The seeded demo is deterministic:

- recording id: `demo-interactive-conflict-flow`;
- conflict file: `/example.js`;
- teacher later edit: `// teacher demo final edit`;
- fake stable media: silent `audio/wav`.

Flow:

1. Seed the demo as Teacher Demo.
2. In the **Demo Identity** selector, choose **Sign in as Learner Demo**.
3. Open and play the Published Lesson.
4. Click **Try It Yourself** before the teacher's later `/example.js` edit.
5. Add a learner edit to `/example.js`.
6. Click **Save My Work**.
7. Confirm **Conflict Warning** shows a conflict.
8. Click **Resume Teacher** so the teacher edit becomes visible.
9. Click **Restore My Work**.
10. Demonstrate the explicit choices:
    - **Restore My Work Anyway**;
    - **Keep Teacher Version**;
    - **View Conflict Details**;
    - **Cancel**.

No automatic merge runs. Teacher recordings and learner deltas are not mutated by these choices.

## 8. Export/import walkthrough

1. In the **Demo Identity** selector, choose **Sign in as Teacher Demo**.
2. Seed or publish a recording.
3. Expand **Import, Export, and Demo Tools**, then click **Export Package**.
4. Optionally enable **Include My Learner Work** before export if demonstrating scoped learner delta export.
5. Click **Reset Demo Data** and **Confirm Reset Demo Data** to prove portability.
6. Choose the downloaded JSON file with **Import Package**.
7. Click **Import as Draft** to write a copied local draft to IndexedDB.
8. Preview the imported draft.
9. Choose the same package again and click **Import as Published**.
10. Switch to Learner Lesson and open the imported Published Lesson.

Import always creates a copy with a new recording id. Unsupported package versions show a friendly error. If package media data is missing, the structured recording still imports and playback falls back to the timeline clock.

## 9. Known limitations

- Demo identity is not production authentication.
- Session data is local and file-backed under `.interactive-data/sessions/`.
- Published/demo persistence is local file storage under `.interactive-data/`, not a production database.
- Media blobs are local IndexedDB or `.interactive-data/media-assets/`, not cloud object storage.
- Export packages are thesis-demo JSON/base64 artifacts, not a stable public archive format.
- Structured replay is not replaced by screen video.
- No automatic merge or patch/hunk merge engine exists.
- Conflict choices do not persist separate conflict-resolution decision records.
- Terminal recording, iframe internals recording, transcript generation, analytics, and production auth are out of scope.
