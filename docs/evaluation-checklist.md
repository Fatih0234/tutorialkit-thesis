# Thesis evaluation checklist

Use this checklist to evaluate the Milestone I release candidate. Record the date, commit, operator, environment, and evidence link or note for each run.

## Evaluation record

- Commit: `________________`
- Date: `________________`
- Operator: `________________`
- Node/pnpm: `________________`
- Browser: `________________`
- Evidence location: `________________`

## Automated acceptance

- [ ] `pnpm build` completes successfully.
- [ ] The full `interactive-poc.spec.ts` Playwright suite completes with **36 passed**.
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

- [ ] **Teacher Demo** can sign in through **Demo Identity**.
- [ ] **Demo Seed** creates `demo-interactive-conflict-flow` and it appears in **Published Lessons**.
- [ ] **Lecture Setup** hides the editor and separates initial-file/media choices from material preparation.
- [ ] **Edit Materials** changes the starting workspace while recording remains off, and those changes enter `baseFiles` rather than timeline events.
- [ ] **Start Recording** opens the focused full-screen studio with elapsed time, event count, media state, and Stop.
- [ ] A teacher can record progressive editor changes, stop into **Recording Review**, save, load, and preview a local draft.
- [ ] The editor player can pause, restart, seek to an intermediate state, and continue deterministically.
- [ ] A teacher-created file can be restored by structured playback.
- [ ] A teacher can publish and reload a recording through the development backend.
- [ ] A changed repost under an existing published recording id receives a conflict response, proving published recording immutability.
- [ ] A teacher can export a JSON package and import it as a new draft copy.
- [ ] A teacher can import a package as a new published copy.
- [ ] Imported media plays when bytes are present; missing media degrades to timeline-clock playback with a warning.
- [ ] **Reset Demo Data** requires confirmation and leaves non-demo records intact.

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
