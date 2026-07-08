# Local Findings (Phase 0 Baseline)

Phase 0 only: no Phase 1 feature code was written.

## Repository foundation status

This checkout now contains the full TutorialKit source tree.

The full source was imported from the existing local clone:

```text
/home/fatihkarahan/Projects/tutorialkit-interactive/tutorialkit
```

Preserved starter assets:

- `AGENTS.md`
- `agent-tasks/`
- `docs/00-context.md` through `docs/05-acceptance-criteria.md`
- `docs/local-findings.md`
- `e2e/interactive-poc.spec.ts`
- `scripts/phase0-grep.sh`
- `packages/runtime/src/interactive-timeline/`

## Command run

```bash
bash scripts/phase0-grep.sh
```

The probe now finds the real TutorialKit integration points.

## Exact editor callback locations

### Workspace orchestration

`packages/react/src/Panels/WorkspacePanel.tsx`

- `EditorSection` is the best first integration point because it has access to `tutorialStore`, the selected/current document state, lesson metadata, and the existing editor/file callbacks.
- Existing callback wiring:
  - line 166: `onFileSelect={(filePath) => tutorialStore.setSelectedFile(filePath)}`
  - line 170: `onEditorScroll={(position) => tutorialStore.setCurrentDocumentScrollPosition(position)}`
  - line 171: `onEditorChange={(update) => tutorialStore.setCurrentDocumentContent(update.content)}`
- Existing file-tree mutation callback:
  - line 129: `onFileTreeChange({ method, type, value })`
  - lines 130-137: currently handles adding files/folders with `tutorialStore.addFile(value)` and `tutorialStore.addFolder(value)`.

### EditorPanel forwarding layer

`packages/react/src/Panels/EditorPanel.tsx`

- Props:
  - line 29: `onEditorChange?: OnEditorChange`
  - line 30: `onEditorScroll?: OnEditorScroll`
  - line 32: `onFileSelect?: (value?: string) => void`
  - line 33: `onFileTreeChange?: ComponentProps<typeof FileTree>['onFileChange']`
- File tree forwarding:
  - line 89: `onFileSelect={onFileSelect}`
  - line 90: `onFileChange={onFileTreeChange}`
- CodeMirror forwarding:
  - line 107: `onScroll={onEditorScroll}`
  - line 108: `onChange={onEditorChange}`

### File tree selection source

`packages/react/src/core/FileTree.tsx`

- line 101: file click calls `onFileSelect?.(fileOrFolder.fullPath)`.

### CodeMirror callback source

`packages/react/src/core/CodeMirrorEditor/index.tsx`

- Callback types:
  - line 46: `EditorUpdate { selection: EditorSelection; content: string }`
  - line 51: `OnChangeCallback = (update: EditorUpdate) => void`
  - line 52: `OnScrollCallback = (position: ScrollPosition) => void`
- Props:
  - line 61: `onChange?: OnChangeCallback`
  - line 62: `onScroll?: OnScrollCallback`
- Change emission:
  - line 101: debounced `onChangeRef.current?.(update)`
  - line 106: custom `dispatchTransactions(transactions)`
  - lines 120-124: emits when the document changed or selection changed, passing `{ selection, content }`
- Scroll emission:
  - line 214: emits `{ left: view.scrollDOM.scrollLeft, top: view.scrollDOM.scrollTop }`

Avoid editing CodeMirror for the POC unless wrapping callbacks in `WorkspacePanel.tsx` proves insufficient.

## Exact TutorialStore/editor APIs

`packages/runtime/src/store/index.ts`

- Reset/solution:
  - line 304: `reset()` resets editor documents to `_lessonFiles` and calls `_runner.updateFiles(this._lessonFiles)`.
  - line 316: `solve()` overlays `_lessonSolution`, sets documents, and calls `_runner.updateFiles(files)`.
- File selection:
  - line 330: `setSelectedFile(filePath: string | undefined)` delegates to `_editorStore.setSelectedFile(filePath)`.
- File creation:
  - line 335: `addFile(filePath: string)` selects the file, updates editor store, then `_runner.updateFile(filePath, '')`.
  - line 353: `addFolder(folderPath: string)` updates editor store, then `_runner.createFolder(folderPath)`.
- File content changes:
  - line 368: `updateFile(filePath: string, content: string)` calls `_editorStore.updateFile`.
  - line 372: if changed, calls `_runner.updateFile(filePath, content)`.
  - line 377: `setCurrentDocumentContent(newContent: string)` reads `currentDocument.get()?.filePath`.
  - line 384: active-file edits flow through `this.updateFile(filePath, newContent)`.
- Scroll:
  - line 388: `setCurrentDocumentScrollPosition(position)`
  - line 397: delegates to `_editorStore.updateScrollPosition(filePath, position)`.
- Observability/snapshot:
  - line 414: `onDocumentChanged(filePath, callback)` delegates to `EditorStore`.
  - line 419: `takeSnapshot()` delegates to `this._runner.takeSnapshot()`.

`packages/runtime/src/store/editor.ts`

- State:
  - line 22: `selectedFile = atom<string | undefined>()`
  - line 23: `documents = map<EditorDocuments>({})`
  - line 28: `currentDocument` is computed from `documents` and `selectedFile`.
- Document loading:
  - line 44: `setDocuments(files: FilesRefList | Files)`
  - lines 51-63: `FilesRefList` creates loading docs with leading-slash file paths.
  - lines 68-80: `Files` creates loaded docs and preserves previous scroll.
- Mutations:
  - line 87: `updateScrollPosition(filePath, position)` stores `scroll` on the document.
  - line 100: `addFileOrFolder(file)` adds file/folder records.
  - line 116: `updateFile(filePath, content)` updates document value and returns `boolean` changed.
  - line 136: `deleteFile(filePath)` exists on `EditorStore`, but `TutorialStore`/`WorkspacePanel` do not currently expose delete in the inspected add-file callback path.

## Exact snapshot API shape

`packages/runtime/src/store/index.ts`

```ts
takeSnapshot() {
  return this._runner.takeSnapshot();
}
```

`packages/runtime/src/store/tutorial-runner.ts`

- line 400: `takeSnapshot()`
- Return shape:

```ts
{
  files: Record<string, string>
}
```

- It includes string files only. `Uint8Array` files are skipped.
- It first adds template files from `_currentTemplate`, then overwrites with editor/lesson files from `_currentFiles`.
- It may synthesize/update `package.json` with `stackblitz.startCommand` if runner commands are available and the package JSON lacks that field.
- Important path behavior:
  - lines 406 and 413 use `filePath.slice(1)`.
  - The comment above `takeSnapshot()` says: `file paths do not contain the leading /`.

Therefore, `tutorialStore.takeSnapshot().files` returns paths like:

```text
src/index.js
package.json
```

The interactive POC helpers require leading-slash paths, so feature code must normalize snapshots before diffing/saving:

```text
/src/index.js
/package.json
```

## Exact path convention used locally

Two conventions are present:

1. TutorialKit internal editor/runner paths use leading slashes.
2. `takeSnapshot()` output strips the leading slash.

Confirmed locations:

- `packages/types/src/entities/index.ts:8`
  - `Files = Record<string, string | Uint8Array>`
- `packages/astro/src/default/utils/content/files-ref.ts:18`
  - generated lesson file paths are `/${relativePath}`.
- `packages/runtime/src/store/editor.ts:51-63`
  - `FilesRefList` entries are used directly as document `filePath` values.
- `packages/runtime/src/store/tutorial-runner.ts:406` and `:413`
  - snapshot output strips the leading slash via `slice(1)`.
- `packages/runtime/src/interactive-timeline/path.ts:1`
  - POC `normalizePath(path)` enforces leading-slash form.
- `packages/runtime/src/interactive-timeline/path.ts:9`
  - POC `normalizeFiles(files)` normalizes all file keys.

POC storage should use leading-slash normalized paths internally.

## Where debug controls will be placed

Place the crude POC debug controls in:

```text
packages/react/src/Panels/WorkspacePanel.tsx
```

Recommended exact area: inside `EditorSection`, in the returned editor `<Panel>`, immediately before the existing `<EditorPanel ... />` render. This location has direct access to:

- `tutorialStore`
- `selectedFile`
- `currentDocument`
- `lesson`
- `storeRef`
- existing `onFileSelect`, `onEditorScroll`, and `onEditorChange` callback wiring

Required accessible button names for Playwright:

- `Start Recording`
- `Stop Recording`
- `Play Recording`
- `Pause`
- `Save Learner Delta`
- `Restore Learner Delta`

## Existing localStorage helper shape

`packages/runtime/src/interactive-timeline/storage.ts`

- line 3: `interactive-poc.teacherRecording`
- line 4: `interactive-poc.learnerDeltas`
- line 14: `saveTeacherRecording(recording)` writes one JSON `TeacherRecording`.
- line 18: `loadTeacherRecording()` returns `TeacherRecording | undefined`.
- line 28: `saveLearnerDelta(delta)` appends to the JSON array.
- line 35: `loadLearnerDeltas()` returns `LearnerDelta[]`.
- line 45: `loadLatestLearnerDelta()` returns the last delta.

## How to run the app

Install dependencies first if needed:

```bash
pnpm install --frozen-lockfile
```

Common TutorialKit commands from root `package.json`:

```bash
pnpm run dev          # package development/watch mode
pnpm run demo         # run docs/demo app
pnpm run docs         # run tutorialkit.dev docs app
pnpm run template:dev # build packages, then run tutorialkit-starter
```

For the POC Playwright spec, run a host app and point `TK_POC_URL` at it. The existing POC spec defaults to:

```text
http://localhost:4321
```

## How to run Playwright

Built-in TutorialKit e2e suite:

```bash
pnpm run test:e2e
```

POC spec, once debug controls exist:

```bash
TK_POC_URL=http://localhost:4321 pnpm --dir e2e exec playwright test interactive-poc.spec.ts
```

Notes:

- `e2e/interactive-poc.spec.ts` is a starter POC test and is not part of the upstream `e2e/test/*.test.ts` pattern unless run explicitly.
- The POC test is expected to fail until the Phase 1+ debug controls and recording behavior are implemented.

## Phase 0 baseline conclusion

The repository now has the full TutorialKit source plus the preserved interactive POC starter files. Actual editor, store, snapshot, and path integration points are identified above. Phase 1 has not been implemented.
