# Python/Pyodide runtime implementation handoff

This is the review handoff for PR #18 after the integration-boundary follow-up.

## Git coordinates

- Repository: `https://github.com/Fatih0234/tutorialkit-thesis`
- Branch: `feature/python-pyodide-runtime`
- Base: `feature/learner-ai-helper`
- PR: `https://github.com/Fatih0234/tutorialkit-thesis/pull/18`
- Original implementation: `8e6ad5c`
- Original handoff: `9edd3be`
- Integration-boundary follow-up: `f901eb897c2b6923c151ce14e69be88ced25311f`
- Reviewed documentation/head: `965f154fb2f19ba941d6bfb021effadd9235025f`
- Delayed-run cancellation fix: `70f4c29ffcf7a75e88fbbaf5087ecfee0386e5e5`

The PR is based on `feature/learner-ai-helper` because it depends on that branch's recording, playback, learner checkpoint, identity, and workspace work. Review against that branch to isolate the Python changes.

## Accurate architecture

The integration is intentionally incremental, not a fully symmetric runtime framework.

- `TutorialRunner` remains the legacy JavaScript/WebContainer execution owner.
- `RuntimeManager` currently owns the new Pyodide environment path.
- `WebContainerEnvironment` is a compatibility seam, not the owner of all existing JavaScript execution.
- `TutorialStore` and its editor remain the canonical workspace source.
- `useInteractivePoc.ts` receives language-neutral runtime events; it does not own workers or Pyodide proxies.
- The application still creates the global WebContainer promise through the existing application architecture. Python lessons do not call `prepareFiles`, run commands, mount Python files into WebContainer, expose an interactive terminal, or show a web preview.

```text
lesson/editor
  → TutorialStore canonical snapshot
  → useLessonRuntime
  → RuntimeManager
  → PyodideEnvironment
  → module Worker
  → structured RuntimeEvent
  → live output and teacher recorder
```

## Runtime metadata and package decision

```yaml
runtime:
  provider: pyodide
  entrypoint: main.py
  timeoutMs: 3000
```

Omitted runtime metadata defaults to WebContainer. Runtime metadata inherits through tutorial, part, chapter, and lesson content.

Python packages are **disabled for this MVP**. The schema permits an omitted `packages` property or an empty array only for compatibility. A non-empty array fails with:

```text
Python packages are not supported by the current Pyodide MVP.
```

The worker does not call `loadPackage`, the fixture does not advertise packages, and `capabilities.packages` is `false`. There is no arbitrary pip, URL, path, PyPI, or unverified package support.

## Canonical Python workspace

`TutorialStore.takeSnapshot()` now builds non-WebContainer workspaces with this precedence:

```text
template files
  overridden by lesson _files
  overridden by current editor documents
  minus explicitly deleted paths
```

Details:

- template files come from the existing `LessonFilesFetcher` and `src/templates/<template>` pipeline;
- only string/UTF-8 text values enter the Python snapshot;
- binary editor documents are excluded;
- empty text files are preserved;
- nested paths are preserved;
- internal paths are normalized before merge;
- the returned snapshot is a fresh object and exposes no mutable store references;
- deleted paths are tracked explicitly so a template or lesson file cannot reappear from a lower-precedence layer or stale worker state;
- adding/restoring a file clears its deletion marker;
- lesson changes, reset, and solve clear deletion markers;
- snapshot construction happens at explicit snapshot/Run boundaries, not every render or playback tick.

The Python E2E fixture selects `template: python-intro`; `main.py` imports `template_helper.py`, which exists only in that template. Unit coverage verifies template-only, lesson override, editor override, nested, empty, binary exclusion, and deletion behavior.

## Shared execution contract

`packages/runtime/src/execution/` defines:

- `ExecutionEnvironment`;
- `RuntimeCapabilities`;
- `RuntimeFileDiff`;
- `RunRequest`;
- `RuntimeEvent`;
- the incremental WebContainer compatibility adapter.

Capabilities now include an explicit `execution` flag in addition to terminal, stdin, package, preview, testing, and interrupt support.

## Worker and filesystem behavior

Pyodide `0.27.7` runs in a module Worker. The Worker:

- lazily initializes Pyodide;
- creates and enters `/workspace`;
- adds `/workspace` to `sys.path`;
- receives added/modified/removed text-file diffs;
- creates nested directories;
- executes the configured file with `runpy.run_path(..., run_name='__main__')`;
- removes modules loaded from `/workspace` from `sys.modules` before each run;
- emits correlated started/stdout/stderr/finished/failed/interrupted events;
- destroys a returned Pyodide proxy;
- captures Python tracebacks;
- supports SharedArrayBuffer interruption with worker replacement fallback;
- never sends Pyodide proxy objects into React.

Paths are confined to `/workspace`; traversal and null-byte paths are rejected. Empty files are synchronized. The run request is text-only.

## Idempotent runtime lifecycle

`PyodideEnvironment.initialize()` is now idempotent:

- same entrypoint/timeout plus an active worker: return without creating a worker or emitting another ready event;
- changed entrypoint/timeout: terminate the old worker, increment generation, reject its pending requests, create exactly one replacement, and rehydrate synchronized files;
- reset: perform the same generation-safe replacement and rehydration;
- disposal: increment generation, terminate the worker, reject pending requests, clear listeners, and remain safe when called repeatedly;
- stale events from old generations are ignored;
- replacement applies the new configuration.

Tests cover identical selection, changed configuration, reset, double disposal, pending-request rejection, stale events, and one live worker after replacement.

## Learner output isolation

Live runtime output and materialized teacher playback are separate truths.

`LiveRuntimeSession` gates live events by an explicit session and active execution ID. Returning from learner experiment mode performs this sequence:

1. invalidate the live session synchronously;
2. reset/replace the environment, which invalidates its worker generation;
3. reject/ignore late output, error, failure, and interruption events;
4. only then invoke the existing teacher-resume flow;
5. restore teacher files and materialized teacher console state.

The same invalidation is also triggered defensively whenever mode changes to teacher playback. Learner runtime events are accepted only for the current execution ID and are never appended while the teacher recorder is inactive or learner mode is active.

Clear Console is disabled in teacher playback and the callback also ignores attempts in that mode. Run, reset, and stop controls are disabled during playback. Teacher playback never invokes `environment.run()`.

Tests cover delayed stdout, stderr, failure, and interruption after invalidation; unrelated execution IDs; active infinite-loop invalidation during learner resume; teacher console restoration; learner checkpoint save/reopen; and persisted teacher event immutability.

## Execution timeline validation

`packages/runtime/src/interactive-timeline/event-validation.ts` is the shared pure-TypeScript validation source. It is browser-safe and imported by both runtime package import/export code and Astro persistence.

Known timeline event types are allow-listed. Unknown event types are rejected by current format-version-1 publication/import boundaries.

Execution payload contract:

### `execution.started`

- safe non-empty `executionId`, max 121 characters by the shared safe-ID pattern;
- provider exactly `webcontainer` or `pyodide`;
- optional string `entrypoint`;
- optional string `command`.

### `execution.stdout` / `execution.stderr`

- safe execution ID;
- string value;
- maximum chunk length: 1 MiB.

### `execution.finished`

- safe execution ID;
- finite integer exit code;
- finite non-negative duration.

### `execution.failed`

- safe execution ID;
- string traceback, maximum 2 MiB;
- finite non-negative duration.

### `execution.interrupted`

- safe execution ID.

Policy:

- recording package import/export and Astro publication/persistence reject malformed events;
- the materializer defensively catches and skips malformed execution events;
- output and terminal events for an execution ID other than the active materialized execution are skipped;
- playback therefore does not crash because of one malformed in-memory event.

Tests cover missing IDs, invalid providers, non-string output, oversized output, negative/non-finite durations, fractional exit codes, malformed tracebacks, unknown event types, valid package round trips, persistence rejection, and defensive materialization.

## Capability-driven workspace UI

Workspace presentation uses resolved capabilities rather than Python metadata conventions:

- runtime Run controls require `capabilities.execution`;
- Stop requires `capabilities.interrupt`;
- preview requires lesson preview configuration **and** `capabilities.webPreview`;
- Python reserves no preview surface;
- Python configures a read-only output panel automatically, even when lesson authors omit terminal metadata;
- Python does not expose an interactive terminal because `terminal` and `stdin` are false;
- Clear Console, Run, Stop, and Reset are disabled during teacher playback;
- existing JavaScript preview/terminal ownership remains unchanged.

This does not claim complete provider interchangeability. Legacy WebContainer execution remains internally different.

## Local assets

The React build copies pinned Pyodide boot assets and the Astro plugin serves/emits them under:

```text
/_tutorialkit/pyodide/
```

Emitted assets:

- `pyodide-lock.json`;
- `pyodide.asm.js`;
- `pyodide.asm.wasm`;
- `python_stdlib.zip`.

Development responses use explicit JavaScript, JSON, WASM, and ZIP MIME types. Static output uses Vite's emitted assets. The base-aware `__PYODIDE_BASE_URL__` remains the Astro path mechanism; the relative packaged fallback remains for non-Astro consumers. No runtime CDN is used.

## Browser E2E coverage

`e2e/test/python.test.ts` verifies real Pyodide initialization, template-only imports, multi-file imports, editing/rerunning, stdout, traceback, infinite-loop interruption, reset, and recovery.

`e2e/test/python-recording.test.ts` adds the full boundary flow:

### Teacher authoring and playback

- signs in as teacher;
- starts a real timeline recording;
- runs Python twice with an editor change;
- verifies captured stdout and structured execution events;
- saves a draft;
- plays and seeks the recording;
- verifies materialized output before/after execution;
- uses `tutorialkit:python-execution` instrumentation to prove playback/seek does not call live execution.

### Learner experiment

- publishes a deterministic Python recording through the local API;
- signs in as learner and opens it;
- materializes teacher output;
- pauses and edits Python;
- starts an infinite learner run;
- returns to lecture through save-and-resume;
- verifies worker invalidation, teacher files, and teacher console restoration;
- verifies no late learner traceback/output appears;
- reopens the saved learner checkpoint;
- compares persisted teacher events with the original immutable event list.

The scenario also proves malformed execution output is rejected by the Astro persistence endpoint.

## Validation results

Focused tests after this follow-up:

```text
@tutorialkit/types:   95 passed
@tutorialkit/runtime: 108 passed
@tutorialkit/react:   21 passed
@tutorialkit/astro:   55 passed
```

Python browser suite:

```text
3 tests total
- focused execution/template/interrupt/reset
- teacher recording/playback/seek/no-rerun
- learner invalidation/checkpoint/immutability
```

Commands:

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

Focused lint passes for standalone files introduced by this follow-up. `git diff --check` passes.

## CI and inherited blockers

At head `9edd3be`, GitHub Actions was not green:

- Node/macOS/Windows test jobs failed in repository-wide lint;
- the logged Linux job reported 1,258 lint errors across interactive files already present on the base branch;
- PR title validation failed because the title did not match repository policy;
- the broad E2E job timed out;
- CLI integration, Docs, VSCode Extension, and GitGuardian checks passed.

At reviewed head `965f154`, Docs, PR title validation, CLI Integration, VSCode Extension, and GitGuardian passed. All Node matrix jobs failed in inherited repository-wide lint, and the broad E2E job failed after approximately 15 minutes. The conventional PR title was corrected to `feat(runtime): add Pyodide Python execution`.

The current branch does not disable lint. The follow-up ran `corepack pnpm lint`: it still fails with 1,250 errors (1,159 auto-fixable), compared with 1,258 in the prior PR CI log. The remaining output is concentrated in inherited interactive files; standalone files introduced here pass focused lint. This comparison establishes no net new lint count, but it is not a substitute for eventually cleaning the base branch.

The follow-up also ran the root test command through a temporary `pnpm`/Corepack shim. It stops in `@tutorialkit/cli`: 13 CLI tests fail because `packages/cli/dist/index.js` is absent and generated-project installation fails in this environment. Theme (1) and Types (95) passed before recursive execution stopped. No test or lint rule was disabled.

A local attempt to run selected tests through the repository's four-server Playwright config timed out while waiting for its auxiliary web servers. The dedicated single-server Python suite succeeds and covers the corresponding Python boundaries. This remains a harness blocker, not a hidden passing claim.

## Preserved invariants

- Published teacher recordings remain immutable.
- Learner files/checkpoints remain separate and user-owned.
- Learner runtime output cannot mutate materialized teacher playback.
- Teacher playback never reruns Python.
- Timeline ordering remains `tMs`, then `seq`.
- Playback-applied state remains guarded from recording.
- The editor workspace remains canonical.
- Existing WebContainer execution ownership remains intact.
- `TutorialRunner` is not a mixed-runtime object.
- Worker logic remains outside `useInteractivePoc.ts`.

## Intentional Python MVP limitations

- no Python packages beyond the built-in standard library bundled by pinned Pyodide;
- no `pip`, URLs, wheel installation, or curated package allow-list;
- no REPL or `input()`;
- no Python LSP, type checker, debugger, variable inspector, or pytest integration;
- no plotting/rendering integration;
- no sockets or multiprocessing;
- no Python web preview;
- no fake shell terminal;
- text workspace files only;
- Run currently waits 175 ms for the existing editor batching interval instead of calling an explicit editor flush API; the session generation and playback mode are revalidated after this delay so invalidated work cannot execute;
- WebContainer can still boot globally through legacy application initialization even though Python lessons do not use it.

## Session closure and integration

The large Python integration session is complete. The implementation remains recoverable through its individual commits and the permanent archive tags created before integration:

```text
archive/learner-ai-helper-pre-python
archive/python-pyodide-runtime-final
```

The stacked history is integrated without squashing:

```text
PR #18: feature/python-pyodide-runtime → feature/learner-ai-helper
PR #17: feature/learner-ai-helper → main
```

Both merges use merge commits so the original learner-AI and Python commit identities remain in `main`. Future Python work should use new focused branches from `main`; this completed branch is historical rather than a continuing development trunk.

## Recommended next work

1. Replace the Run delay with an explicit editor flush/snapshot boundary.
2. Decide whether to add a fully local curated package allow-list and emit every required wheel/asset.
3. Add async `input()` only behind an explicit stdin capability.
4. Add structured lesson assertions independent of pytest.
5. Continue reducing inherited repository lint debt so standard CI can become authoritative.
