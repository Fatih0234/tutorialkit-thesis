# Python/Pyodide runtime implementation handoff

This document is intended to be copied into another ChatGPT session or used as the starting point for a pull-request review.

## Git and review coordinates

- Repository: `https://github.com/Fatih0234/tutorialkit-thesis`
- Branch: `feature/python-pyodide-runtime`
- Base branch: `feature/learner-ai-helper`
- Pull request: `https://github.com/Fatih0234/tutorialkit-thesis/pull/18`
- Main implementation commit: `8e6ad5c feat(runtime): add Pyodide Python execution`

The branch intentionally starts from `feature/learner-ai-helper`, not `main`, because the Python integration builds on the interactive recording, playback, learner experiment, and workspace code already present there. Reviewing the PR against `feature/learner-ai-helper` isolates the Python work from those earlier interactive changes.

## Objective delivered

TutorialKit now has two lesson execution providers:

1. `webcontainer`: the existing JavaScript/TypeScript path.
2. `pyodide`: an introductory Python path running in a dedicated browser module Worker.

Both providers use the same TutorialKit lesson model, editor, file tree, workspace, recording timeline, deterministic playback, learner experiment model, publication model, and output panel. Existing WebContainer APIs remain available and `TutorialRunner` was not rewritten into a mixed-language object.

## Architectural shape

```text
TutorialKit workspace
├── editor and file tree
├── canonical TutorialStore files
├── lesson metadata
├── teacher recording
├── deterministic playback
├── learner experiments
└── execution provider
    ├── existing TutorialRunner/WebContainer path
    └── RuntimeManager → PyodideEnvironment → module Worker
```

### Shared execution contract

`packages/runtime/src/execution/types.ts` defines:

- `RuntimeCapabilities`
- `RuntimeFileDiff`
- `RunRequest`
- `RuntimeEvent`
- `ExecutionEnvironment`

The public contract exposes no Pyodide proxies or WebContainer process objects. `packages/runtime/src/execution/webcontainer-environment.ts` is a compatibility adapter seam around existing WebContainer-style delegates. Existing consumers continue using `TutorialRunner`; migration can remain incremental.

### Provider selection

`packages/react/src/runtimes/RuntimeManager.ts` owns provider selection and disposal. The current React integration asks it for a Pyodide environment only for Python lessons. WebContainer lessons remain on the established TutorialStore/TutorialRunner path, avoiding a broad migration.

`TutorialStore` checks the lesson runtime before performing WebContainer-specific file/process operations. Python lessons still load files into the editor but do not mount or run them in WebContainer. The editor store is canonical, and `takeSnapshot()` overlays loaded editor documents onto the snapshot used for execution and learner work.

### React responsibilities

- `useLessonRuntime.ts`: lifecycle, explicit Run synchronization boundary, environment subscription, status, output routing, interrupt/reset/disposal.
- `RuntimeControls.tsx`: Run, Stop, Reset runtime, Clear console, and status UI.
- `WorkspacePanel.tsx`: mounts controls for the selected runtime.
- `useInteractivePoc.ts`: receives language-neutral runtime events only. It contains no Pyodide object or worker logic.

## Runtime metadata

Schema source: `packages/types/src/schemas/common.ts`.

```ts
type RuntimeConfig =
  | {
      provider: 'webcontainer';
      entrypoint?: string;
    }
  | {
      provider: 'pyodide';
      entrypoint: string;
      packages?: string[];
      timeoutMs?: number;
    };
```

Example lesson frontmatter:

```yaml
runtime:
  provider: pyodide
  entrypoint: main.py
  packages: []
  timeoutMs: 3000
```

Behavior:

- omitted runtime resolves to `{ provider: 'webcontainer' }`;
- runtime metadata inherits from tutorial → part → chapter → lesson;
- Pyodide requires a non-empty entrypoint;
- package names are optional and use Pyodide's pinned package lock; no `pip install` or learner package command is exposed;
- `timeoutMs` can trigger interruption for long-running code.

The content inheritance implementation is in `packages/astro/src/default/utils/content.ts`, with schema and inheritance tests plus updated snapshots.

## Python editor support

`@codemirror/lang-python` was added to `@tutorialkit/react`.

The existing lazy language registry recognizes:

- `.py`
- `.pyw`

All previous lazy languages remain unchanged. Coverage is in `packages/react/src/core/CodeMirrorEditor/languages.spec.ts`.

## Pyodide Worker implementation

Files:

```text
packages/react/src/runtimes/python/
├── PyodideEnvironment.ts
├── pyodide.worker.ts
├── protocol.ts
├── filesystem.ts
└── focused tests
```

### Worker behavior

The worker:

- lazy-loads Pyodide only for Python lessons;
- initializes once per active worker;
- creates `/workspace` and sets it as cwd;
- inserts `/workspace` into `sys.path`;
- synchronizes added/modified/removed UTF-8 text files;
- creates nested directories as needed;
- runs the configured entrypoint with `runpy.run_path(..., run_name='__main__')`;
- removes cached modules loaded from `/workspace` before subsequent runs;
- captures stdout and stderr;
- returns structured failures and tracebacks;
- reports execution IDs and durations;
- configures a SharedArrayBuffer interrupt buffer when available;
- is terminated and recreated if cooperative interruption does not finish promptly;
- rehydrates the last synchronized workspace after reset/replacement;
- ignores messages from stale runtime generations;
- never sends Python proxy objects to React;
- destroys the `runPythonAsync` result proxy when one is returned.

### Worker request protocol

Every request has `id` and `generation`:

```ts
type PythonWorkerRequest =
  | { type: 'initialize'; config; interruptBuffer? }
  | { type: 'sync-files'; addedOrModified; removed }
  | { type: 'run'; entrypoint }
  | { type: 'interrupt' }
  | { type: 'reset' };
```

Responses correlate by request ID. Events include:

```text
ready
started
stdout
stderr
finished
failed
interrupted
```

`PyodideEnvironment` converts those worker events into the shared language-neutral `RuntimeEvent` union.

## File synchronization

`packages/react/src/runtimes/python/filesystem.ts` normalizes paths to leading-slash form, computes added/modified/removed file-level diffs, confines paths to `/workspace`, preserves empty files, and rejects traversal/null-byte paths.

Synchronization is not performed on every keystroke. Run waits for the existing CodeMirror batching interval, takes a current TutorialStore snapshot, diffs it against the last worker snapshot, sends only the diff, then executes the entrypoint.

The public run request accepts text records only, so binary files cannot be silently corrupted through this MVP contract.

## Interruption and reset

`PyodideEnvironment` uses `SharedArrayBuffer` plus `Atomics.store(..., 2)` for Pyodide's KeyboardInterrupt mechanism. If the execution is still active after a short grace period, it:

1. emits `execution.interrupted`;
2. terminates the blocked worker;
3. creates and initializes a new worker;
4. rehydrates synchronized files;
5. allows the next run to proceed.

The editor workspace is never owned by the worker, so worker termination cannot destroy learner edits.

The Astro integration retains COOP/COEP headers and configures Vite workers as ES modules.

## Local Pyodide assets

Pyodide is pinned to `0.27.7` in `packages/react/package.json` and `pnpm-lock.yaml`.

React's build copies these assets:

- `pyodide-lock.json`
- `pyodide.asm.js`
- `pyodide.asm.wasm`
- `python_stdlib.zip`

`packages/astro/src/vite-plugins/python-assets.ts` serves them in development and emits them in static builds under:

```text
/_tutorialkit/pyodide/
```

This avoids an external API key or runtime CDN dependency and makes CI/runtime versions deterministic. The integration also sets the base-aware `__PYODIDE_BASE_URL__` build constant. A relative packaged fallback remains for non-Astro consumers.

## Timeline and deterministic playback

Added event types:

```text
execution.started
execution.stdout
execution.stderr
execution.finished
execution.failed
execution.interrupted
```

Payloads are language-neutral and carry execution IDs. Started events additionally identify `webcontainer` or `pyodide` and may carry an entrypoint/command.

`materializeExecutionState()`:

- sorts by `tMs`, then `seq`;
- rebuilds stdout/stderr deterministically;
- tracks running/finished/failed/interrupted state;
- tracks exit code and traceback;
- clears prior console output when a later execution starts;
- supports arbitrary seek timestamps.

Teacher recording behavior:

- live Python runtime events are appended only while a teacher recorder is active in idle/authoring mode;
- playback-generated changes remain guarded;
- teacher playback writes materialized captured output and never executes Python;
- seeking restores the materialized console state;
- stdout/stderr chunk order is preserved.

Learner behavior:

- learner runs work while in learner editing/experiment mode;
- `onRuntimeEvent` does not append learner runs to the teacher recording;
- returning to teacher playback reconstructs teacher files and teacher console state;
- learner file deltas remain separate and keep the existing recording/version/timestamp/base-hash anchoring.

## Python fixture

Location:

```text
e2e/src/content/tutorial/tests/python/python-intro/
├── content.md
├── _files/
│   ├── main.py
│   └── helpers.py
└── _solution/
    ├── main.py
    └── helpers.py
```

The fixture:

- focuses `main.py`;
- uses Pyodide;
- imports `greet` from `helpers.py`;
- prints `Hello, Ada!`;
- contains a commented intentional `ValueError` for manual traceback testing;
- has no third-party package dependency.

Route in the E2E application:

```text
/tests/python/python-intro
```

## Tests added or updated

### Types/Astro

- runtime discriminated-union validation;
- omitted-runtime WebContainer default;
- Python required entrypoint;
- inherited runtime metadata;
- updated content snapshots.

### Runtime

- deterministic execution event ordering by timestamp and sequence;
- stdout/stderr materialization;
- seeking before and after multiple executions;
- previous output clearing on a new execution.

### React/runtime

- RuntimeManager provider selection;
- Python added/modified/removed/empty/nested file diffing;
- workspace path confinement;
- worker request correlation;
- reset and file rehydration;
- stale-generation event rejection;
- `.py` and `.pyw` CodeMirror language loading.

### Browser E2E

`e2e/test/python.test.ts` runs real packaged Pyodide and verifies:

1. Python environment initialization;
2. Python file recognition and controls;
3. `main.py` importing `helpers.py`;
4. expected stdout;
5. editing and rerunning with changed stdout;
6. exception traceback display;
7. infinite-loop Stop behavior;
8. reset recovery.

Timeline materializer tests cover deterministic recorded output and seeking. Existing interactive tests continue to cover the shared teacher/learner recording machinery. A future improvement should combine all teacher recording, publication, playback, and learner experiment assertions into one dedicated Python browser E2E scenario.

## Validation performed

Passed:

```text
@tutorialkit/types   95 tests
@tutorialkit/runtime 93 tests
@tutorialkit/react   17 tests
@tutorialkit/astro   55 tests
```

Commands used:

```bash
corepack pnpm --filter @tutorialkit/types run test --run
corepack pnpm --filter @tutorialkit/runtime run test --run
corepack pnpm --filter @tutorialkit/react run test --run
corepack pnpm --filter @tutorialkit/astro run test --run

corepack pnpm --filter @tutorialkit/types build
corepack pnpm --filter @tutorialkit/runtime build
corepack pnpm --filter @tutorialkit/react build
corepack pnpm --filter @tutorialkit/astro build

corepack pnpm --filter tutorialkit-e2e exec astro build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome \
  corepack pnpm --filter tutorialkit-e2e exec playwright test \
  --config playwright.python.config.ts
```

Python Playwright result:

```text
1 passed
```

Additional checks:

- focused lint passes for all newly introduced execution/runtime/worker/asset/test files;
- `packages/runtime/src/store/index.ts` passes focused lint;
- `git diff --check` passes;
- static E2E build emits the module worker and all local Pyodide assets.

### Repository-wide validation blockers

These were not hidden or disabled:

1. The root `pnpm test` reaches unrelated CLI tests that fail because `packages/cli/dist/index.js` is absent. The four affected feature packages pass independently.
2. Repository-wide lint reports extensive pre-existing style/format failures in existing interactive files such as `useInteractivePoc.ts`, presentation/whiteboard code, and existing runtime timeline files. Newly introduced standalone files pass focused lint; no lint rule was weakened.
3. The environment had no direct `pnpm` binary on PATH, so validation used the repository-pinned version through `corepack pnpm`.

## Important invariants preserved

- Teacher recordings are not mutated by learner execution.
- Learner file deltas remain separate and user-scoped.
- Timeline order remains `tMs`, then `seq`.
- Playback changes are guarded from recording.
- Structured events remain authoritative.
- Media remains an attachment.
- Python is not rerun during teacher playback.
- Existing WebContainer lessons remain on their prior path.
- Pyodide logic is not spread throughout `useInteractivePoc.ts`.
- `TutorialRunner` was not converted into a WebContainer/Pyodide god object.

## Known limitations and review notes

Intentional MVP limitations:

- no Python REPL;
- no `input()`;
- no arbitrary pip/PyPI installation;
- no Python language server, type checker, debugger, or variable inspector;
- no pytest integration;
- no plotting/rendering integration;
- no sockets or multiprocessing;
- no browser preview for Python;
- no fake Unix shell prompt.

Reviewers should pay particular attention to:

1. whether the 175 ms Run synchronization delay should later be replaced by an explicit editor flush API;
2. whether curated `packages` should receive a project-level allow-list before broader author use;
3. whether non-Astro consumers need a formal asset-host configuration API instead of the current packaged fallback;
4. whether execution output should eventually move from xterm to a structured accessible console component;
5. adding one full Python teacher-recording → publication → learner-playback → experiment browser test.

## Recommended follow-up sequence

1. Add Python `input()` through an explicit asynchronous stdin capability.
2. Add structured lesson test operations independent of pytest.
3. Add a curated package registry and author validation.
4. Add richer traceback links, pedagogical state views, and beginner-oriented Python tools.
5. Add the combined Python recording/playback/learner experiment E2E scenario described above.
