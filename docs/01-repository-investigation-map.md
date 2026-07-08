# Repository Investigation Map

## ITSS files to understand conceptually

Client:

- `client/src/views/TutorialSectionPage/Sections/CodeSection.js`
  - author recording
  - event arrays
  - audio/transcript
  - save recording payload

- `client/src/views/TutorialPage/Sections/CodeSection.js`
  - learner playback
  - play/pause/seek
  - event scheduling
  - playback editor mutation
  - Practice tab

- `client/src/views/TutorialSectionPage/TutorialSectionPage.js`
  - author shell
  - recordStartState wiring

- `client/src/views/TutorialPage/TutorialPage.js`
  - learner shell
  - loads serialized event arrays
  - learner layout save/load

Server:

- `server/tutorial/application.py`
  - `/upload_recording`
  - `/tutorial/get/...`
  - `/save_learner_layout`
  - `/get_learner_layout`

- `server/tutorial/schema.py`
  - DB model
  - confirms learner state is only progress/last page, not code deltas

## TutorialKit files to inspect first

- `packages/runtime/src/store/index.ts`
  - `TutorialStore`
  - current document
  - update file
  - selected file
  - reset/solve
  - takeSnapshot

- `packages/runtime/src/store/editor.ts`
  - editor documents
  - selected file
  - document scroll
  - updateFile

- `packages/react/src/Panels/WorkspacePanel.tsx`
  - best first interception point
  - editor change and file select callbacks

- `packages/react/src/core/CodeMirrorEditor/index.tsx`
  - emits content, selection, scroll

- `packages/runtime/src/store/tutorial-runner.ts`
  - WebContainer file updates
  - prepare files
  - takeSnapshot

- `packages/runtime/src/webcontainer/utils/files.ts`
  - file diff utilities
