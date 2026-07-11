# Thesis evaluation checklist

Use this checklist to evaluate the current thesis POC candidate. Record the date, commit, operator, environment, and evidence link or note for each run.

## Evaluation record

- Commit: `________________`
- Date: `________________`
- Operator: `________________`
- Node/pnpm: `________________`
- Browser: `________________`
- Evidence location: `________________`

## Automated acceptance

- [ ] `pnpm build` completes successfully.
- [ ] The full `interactive-poc.spec.ts` Playwright suite completes with **40 passed**.
- [ ] `git diff --check` reports no whitespace errors.
- [ ] Playwright product actions use user-facing role/text/label locators; CSS scoping is limited to the embedded editor integration where no stable product role identifies the container.
- [ ] The localStorage compatibility shapes can be inspected at `interactive-poc.teacherRecording` and `interactive-poc.learnerDeltas`.

Validation command:

```bash
pnpm build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  TK_POC_URL=http://localhost:4329 \
  PLAYWRIGHT_HTML_OPEN=never \
  pnpm --dir e2e exec playwright test interactive-poc.spec.ts --project=Default
git diff --check
```

## Teacher evidence

- [ ] **Teacher Demo** can sign in through the compact **Account** control.
- [ ] Teacher Studio contains only Lecture Setup, draft cards, and Published Lesson cards—no package, demo, debug, technical, or duplicate save/publish controls.
- [ ] **Lecture Setup** hides the editor and separates initial-file/media choices from material preparation.
- [ ] **Edit Materials** changes the starting workspace while recording remains off, and those changes enter `baseFiles` rather than timeline events.
- [ ] **Start Recording** opens the focused full-screen studio with elapsed time, event count, media state, and Stop.
- [ ] A teacher can record progressive editor changes, stop into **Recording Review**, save, load, and preview a local draft.
- [ ] The editor player can pause, restart, seek to an intermediate state, and continue deterministically.
- [ ] Same-side minimized resources overlap at one fixed position; the Resources toolbar brings covered windows forward and deterministic seeking restores the front window.
- [ ] A teacher can prepare an initial Excalidraw scene and record at least two semantic scene snapshots without raw pointer events.
- [ ] Whiteboard seeking restores initial, intermediate, and final scenes; learner playback is read-only and leaves teacher JSON unchanged.
- [ ] Draft, publication, reload, and package round-trip preserve whiteboards; malformed or oversized scenes are rejected.
- [ ] A teacher-created file can be restored by structured playback.
- [ ] A teacher can publish and reload a recording through the development backend; the matching local draft disappears after successful publication.
- [ ] Opening published Recording Review is read-only, exposes neither Save Draft nor Publish, creates no draft, and leaves recording bytes unchanged.
- [ ] A changed repost under an existing published recording id receives a conflict response, proving content immutability.
- [ ] An owner can confirm **Delete Lesson** and the publication, linked media, and linked learner deltas remain deleted after reload.
- [ ] A learner cannot delete a publication, and unrelated drafts/publications/learner work remain intact.
- [ ] Retained package import/export and demo seed/reset capabilities pass their automated contract coverage despite being absent from default UI.

## Learner evidence

- [ ] **Learner Demo** can sign in and open the seeded published lesson.
- [ ] **Play** replays structured teacher events in deterministic order through the shared seekable editor player.
- [ ] **Pause and Experiment** pauses playback and permits learner editing.
- [ ] **Save Experiment** stores a file-level learner delta without changing the teacher recording and renders a timestamped timeline marker.
- [ ] **Return to Lecture** reconstructs teacher truth at the experiment anchor before continuing playback.
- [ ] Passing a saved marker during normal playback has no effect on the teacher timeline.
- [ ] Selecting a marker reconstructs teacher state at its timestamp and applies the learner-owned delta without a later-teacher-edit conflict prompt.
- [ ] Unsaved work requires **Save and Resume**, **Resume Without Saving**, or **Cancel** before returning to playback.
- [ ] Learner Two cannot read or restore Learner Demo work.
- [ ] The server replaces a mismatched client learner `userId` with the signed-in session user, proving ownership scoping.

## Data and architecture evidence

- [ ] Local drafts and local media are present in IndexedDB, not `.interactive-data/`.
- [ ] Published demo records, media, deltas, and sessions are present under the appropriate `.interactive-data/` directories.
- [ ] Media blobs are absent from the localStorage compatibility mirrors.
- [ ] Network access for interactive storage remains isolated in `remote-storage-adapter.ts`.
- [ ] Package import creates new recording/media ids rather than overwriting source artifacts.
- [ ] Internal file paths in recordings and deltas use leading slashes.

## Known non-goals acknowledged

- [ ] Demo identity is not production authentication.
- [ ] `.interactive-data/` is not a production database.
- [ ] Local media files are not production object storage.
- [ ] No automatic, patch, or hunk-level merge is implemented.
- [ ] Learner deltas are file-level only.
- [ ] Terminal, screen, and iframe-internal recording are excluded.
- [ ] Analytics and telemetry are excluded.
- [ ] No formal user study has been completed yet.

See [`limitations-and-future-work.md`](./limitations-and-future-work.md) for interpretation and future research directions.
