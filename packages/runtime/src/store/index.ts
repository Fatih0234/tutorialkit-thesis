import type { FileDescriptor, Files, FilesystemError, Lesson } from '@tutorialkit/types';
import type { WebContainer } from '@webcontainer/api';
import { atom, type ReadableAtom } from 'nanostores';
import type { ExerciseValidationExecution } from '../interactive-timeline/exercises/types.js';
import { normalizePath } from '../interactive-timeline/path.js';
import { LessonFilesFetcher } from '../lesson-files.js';
import { newTask, type Task } from '../tasks.js';
import { clearTerminal, type ITerminal } from '../utils/terminal.js';
import type { EditorConfig } from '../webcontainer/editor-config.js';
import { bootStatus, unblockBoot, type BootStatus } from '../webcontainer/on-demand-boot.js';
import type { PreviewInfo } from '../webcontainer/preview-info.js';
import { StepsController } from '../webcontainer/steps.js';
import type { TerminalConfig } from '../webcontainer/terminal-config.js';
import { EditorStore, type EditorDocument, type EditorDocuments, type ScrollPosition } from './editor.js';
import { PreviewsStore } from './previews.js';
import { TerminalStore } from './terminal.js';
import { TutorialRunner } from './tutorial-runner.js';
import { createWorkspaceSnapshot } from './workspace-snapshot.js';

interface StoreOptions {
  webcontainer: Promise<WebContainer>;

  /**
   * Whether or not authentication is used for the WebContainer API.
   */
  useAuth: boolean;

  /**
   * The base path to use when fetching files.
   */
  basePathname?: string;
}

export class TutorialStore {
  private _webcontainer: Promise<WebContainer>;

  private _runner: TutorialRunner;
  private _previewsStore: PreviewsStore;
  private _editorStore: EditorStore;
  private _terminalStore: TerminalStore;

  private _stepController = new StepsController();
  private _lessonFilesFetcher: LessonFilesFetcher;
  private _lessonTask: Task<unknown> | undefined;
  private _lesson: Lesson | undefined;
  private _ref = atom(1);
  private _themeRef = atom(1);

  private _lessonFiles: Files | undefined;
  private _lessonSolution: Files | undefined;
  private _lessonTemplate: Files | undefined;
  private _workspaceRemovedPaths = new Set<string>();

  /**
   * Whether or not the current lesson is fully loaded in WebContainer
   * and in every stores.
   */
  readonly lessonFullyLoaded = atom<boolean>(false);

  constructor({ useAuth, webcontainer, basePathname }: StoreOptions) {
    this._webcontainer = webcontainer;
    this._editorStore = new EditorStore();
    this._lessonFilesFetcher = new LessonFilesFetcher(basePathname);
    this._previewsStore = new PreviewsStore(this._webcontainer);
    this._terminalStore = new TerminalStore(this._webcontainer, useAuth);
    this._runner = new TutorialRunner(this._webcontainer, this._terminalStore, this._editorStore, this._stepController);

    /**
     * By having this code under `import.meta.hot`, it gets:
     *  - ignored on server side where it shouldn't run
     *  - discarded when doing a production build
     */
    if (import.meta.hot) {
      import.meta.hot.on('tk:refresh-wc-files', async (hotFilesRefs: string[]) => {
        let shouldUpdate = false;

        for (const filesRef of hotFilesRefs) {
          const result = await this._lessonFilesFetcher.invalidate(filesRef);

          switch (result.type) {
            case 'none': {
              break;
            }
            case 'files': {
              if (this._lesson?.files[0] === filesRef) {
                shouldUpdate = true;

                this._lesson.files[1] = Object.keys(result.files).sort();
                this._lessonFiles = result.files;
              }

              break;
            }
            case 'solution': {
              if (this._lesson?.solution[0] === filesRef) {
                shouldUpdate = true;

                this._lesson.solution[1] = Object.keys(result.files).sort();
                this._lessonSolution = result.files;
              }

              break;
            }
            case 'template': {
              shouldUpdate = true;

              this._lessonTemplate = result.files;

              break;
            }
          }
        }

        if (shouldUpdate && this._lesson) {
          this._lessonTask?.cancel();

          const files = this._lessonFiles ?? {};
          const template = this._lessonTemplate;

          this._lessonTask = newTask(
            async (signal) => {
              const preparePromise = this._usesWebContainer()
                ? this._runner.prepareFiles({ template, files, signal })
                : Promise.resolve();

              if (this._usesWebContainer()) {
                this._runner.runCommands();
              }

              this._editorStore.setDocuments(files);

              await preparePromise;
            },
            { ignoreCancel: true },
          );
        }
      });
    }
  }

  /** @internal */
  setLesson(lesson: Lesson, options: { ssr?: boolean } = {}) {
    if (lesson === this._lesson) {
      return;
    }

    this._lessonTask?.cancel();

    this._ref.set(1 + (this._ref.value || 0));
    this._lesson = lesson;
    this._workspaceRemovedPaths.clear();
    this.lessonFullyLoaded.set(false);

    this._previewsStore.setPreviews(lesson.data.previews ?? true);
    this._terminalStore.setTerminalConfiguration(
      lesson.data.runtime?.provider === 'pyodide' ? { open: true, panels: 'output' } : lesson.data.terminal,
    );
    this._editorStore.setEditorConfig(lesson.data.editor);

    if (this._usesWebContainer()) {
      this._runner.setCommands(lesson.data);
    }

    this._editorStore.setDocuments(lesson.files);

    if (options.ssr) {
      return;
    }

    if (this._usesWebContainer()) {
      this._runner.setWatchFromWebContainer(lesson.data.filesystem?.watch ?? false);
    }

    this._lessonTask = newTask(
      async (signal) => {
        const templatePromise = this._lessonFilesFetcher.getLessonTemplate(lesson);
        const filesPromise = this._lessonFilesFetcher.getLessonFiles(lesson);

        const preparePromise = this._usesWebContainer()
          ? this._runner.prepareFiles({ template: templatePromise, files: filesPromise, signal })
          : Promise.resolve();

        if (this._usesWebContainer()) {
          this._runner.runCommands();
        }

        const [template, solution, files] = await Promise.all([
          templatePromise,
          this._lessonFilesFetcher.getLessonSolution(lesson),
          filesPromise,
        ]);

        signal.throwIfAborted();

        this._lessonTemplate = template;
        this._lessonFiles = files;
        this._lessonSolution = solution;

        this._editorStore.setDocuments(files);

        if (lesson.data.focus === undefined) {
          this._editorStore.setSelectedFile(undefined);
        } else {
          const focusPath = normalizePath(lesson.data.focus);

          if (files[focusPath] !== undefined) {
            this._editorStore.setSelectedFile(focusPath);
          }
        }

        await preparePromise;

        signal.throwIfAborted();

        this.lessonFullyLoaded.set(true);
      },
      { ignoreCancel: true },
    );
  }

  /** Instances of the preview tabs. */
  get previews(): ReadableAtom<PreviewInfo[]> {
    return this._previewsStore.previews;
  }

  /** Configuration and instances of the terminal */
  get terminalConfig(): ReadableAtom<TerminalConfig> {
    return this._terminalStore.terminalConfig;
  }

  /** Configuration of the editor and file tree */
  get editorConfig(): ReadableAtom<EditorConfig> {
    return this._editorStore.editorConfig;
  }

  /** File that's currently open in the editor */
  get currentDocument(): ReadableAtom<EditorDocument | undefined> {
    return this._editorStore.currentDocument;
  }

  /** Status of the webcontainer's booting */
  get bootStatus(): ReadableAtom<BootStatus> {
    return bootStatus;
  }

  /** Files that are available in the editor. */
  get documents(): ReadableAtom<EditorDocuments> {
    return this._editorStore.documents;
  }

  /** Paths of the files that are available in the lesson */
  get files(): ReadableAtom<FileDescriptor[]> {
    return this._editorStore.files;
  }

  /** File that's currently selected in the file tree */
  get selectedFile(): ReadableAtom<string | undefined> {
    return this._editorStore.selectedFile;
  }

  /** Currently active lesson */
  get lesson(): Readonly<Lesson> | undefined {
    return this._lesson;
  }

  /** @internal */
  get ref(): ReadableAtom<unknown> {
    return this._ref;
  }

  /** @internal */
  get themeRef(): ReadableAtom<unknown> {
    return this._themeRef;
  }

  /**
   * Steps that the runner is or will be executing.
   *
   * @internal
   */
  get steps() {
    return this._stepController.steps;
  }

  /** Check if file tree is visible */
  hasFileTree(): boolean {
    if (!this._lesson) {
      return false;
    }

    return this.editorConfig.get().fileTree.visible;
  }

  /** Check if editor is visible */
  hasEditor(): boolean {
    if (!this._lesson) {
      return false;
    }

    return this.editorConfig.get().visible;
  }

  /** Check if lesson has any previews set */
  hasPreviews(): boolean {
    if (!this._lesson) {
      return false;
    }

    const { previews } = this._lesson.data;

    return previews !== false;
  }

  /** Check if lesson has any terminals set */
  hasTerminalPanel(): boolean {
    return this._terminalStore.hasTerminalPanel();
  }

  /** Check if lesson has solution files set */
  hasSolution(): boolean {
    return !!this._lesson && Object.keys(this._lesson.solution[1]).length >= 1;
  }

  /** Unlock webcontainer's boot process if it was in `'blocked'` state */
  unblockBoot() {
    unblockBoot();
  }

  /** Reset changed files back to lesson's initial state */
  reset() {
    const isReady = this.lessonFullyLoaded.value;

    if (!isReady || !this._lessonFiles) {
      return;
    }

    this._workspaceRemovedPaths.clear();
    this._editorStore.setDocuments(this._lessonFiles);

    if (this._usesWebContainer()) {
      this._runner.updateFiles(this._lessonFiles);
    }
  }

  /** Apply lesson solution into the lesson files */
  solve() {
    const isReady = this.lessonFullyLoaded.value;

    if (!isReady || !this._lessonSolution) {
      return;
    }

    const files = { ...this._lessonFiles, ...this._lessonSolution };

    this._workspaceRemovedPaths.clear();
    this._editorStore.setDocuments(files);

    if (this._usesWebContainer()) {
      this._runner.updateFiles(files);
    }
  }

  /** Set file from file tree as selected */
  setSelectedFile(filePath: string | undefined) {
    this._editorStore.setSelectedFile(filePath);
  }

  /** Add new file to file tree */
  async addFile(filePath: string): Promise<void> {
    // always select the existing or newly created file
    this.setSelectedFile(filePath);

    // prevent creating duplicates
    if (this._editorStore.files.get().find((file) => file.path === filePath)) {
      return;
    }

    if (this._usesWebContainer() && (await this._runner.fileExists(filePath))) {
      throw new Error('FILE_EXISTS' satisfies FilesystemError);
    }

    this._workspaceRemovedPaths.delete(normalizePath(filePath));
    this._editorStore.addFileOrFolder({ path: filePath, type: 'file' });

    if (this._usesWebContainer()) {
      this._runner.updateFile(filePath, '');
    }
  }

  /** Add new folder to file tree */
  async addFolder(folderPath: string) {
    // prevent creating duplicates
    if (this._editorStore.files.get().some((file) => file.path.startsWith(folderPath))) {
      return;
    }

    if (this._usesWebContainer() && (await this._runner.folderExists(folderPath))) {
      throw new Error('FOLDER_EXISTS' satisfies FilesystemError);
    }

    this._editorStore.addFileOrFolder({ path: folderPath, type: 'folder' });

    if (this._usesWebContainer()) {
      this._runner.createFolder(folderPath);
    }
  }

  /** Restore or create a file from a trusted programmatic snapshot such as timeline playback. */
  restoreFile(filePath: string, content: string) {
    this._workspaceRemovedPaths.delete(normalizePath(filePath));

    if (!this._editorStore.files.get().some((file) => file.path === filePath)) {
      this._editorStore.addFileOrFolder({ path: filePath, type: 'file' });
    }

    this._editorStore.updateFile(filePath, content);

    if (this._usesWebContainer()) {
      this._runner.updateFile(filePath, content);
    }
  }

  /** Remove a file from a trusted programmatic snapshot such as learner-checkpoint restoration. */
  removeFile(filePath: string) {
    const normalizedFilePath = normalizePath(filePath);

    if (this.selectedFile.get() === normalizedFilePath) {
      this.setSelectedFile(undefined);
    }

    this._workspaceRemovedPaths.add(normalizedFilePath);
    this._editorStore.deleteFile(normalizedFilePath);

    if (this._usesWebContainer()) {
      this._runner.removeFile(normalizedFilePath);
    }
  }

  /** Update contents of file */
  updateFile(filePath: string, content: string) {
    const hasChanged = this._editorStore.updateFile(filePath, content);

    if (hasChanged && this._usesWebContainer()) {
      this._runner.updateFile(filePath, content);
    }
  }

  /** Update content of the active file */
  setCurrentDocumentContent(newContent: string) {
    const filePath = this.currentDocument.get()?.filePath;

    if (!filePath) {
      return;
    }

    this.updateFile(filePath, newContent);
  }

  /** Update scroll position of the file in editor */
  setCurrentDocumentScrollPosition(position: ScrollPosition) {
    const editorDocument = this.currentDocument.get();

    if (!editorDocument) {
      return;
    }

    const { filePath } = editorDocument;

    this._editorStore.updateScrollPosition(filePath, position);
  }

  /** @internal */
  attachTerminal(id: string, terminal: ITerminal) {
    this._terminalStore.attachTerminal(id, terminal);
  }

  /** Callback that should be called when terminal resizes */
  onTerminalResize(cols: number, rows: number) {
    if (cols && rows) {
      this._terminalStore.onTerminalResize(cols, rows);
      this._runner.onTerminalResize(cols, rows);
    }
  }

  /** Listen for file changes made in the editor */
  onDocumentChanged(filePath: string, callback: (document: Readonly<EditorDocument>) => void) {
    return this._editorStore.onDocumentChanged(filePath, callback);
  }

  /** Write to the configured read-only output panel. */
  writeOutput(value: string) {
    this._terminalStore.getOutputPanel()?.write(value);
  }

  runExerciseValidation(options: {
    files: Record<string, string>;
    runnerFile: string;
    timeoutMs: number;
  }): Promise<ExerciseValidationExecution> {
    if (!this._usesWebContainer()) {
      throw new Error('Exercise validation currently requires WebContainer.');
    }

    return this._runner.runExerciseValidation(options);
  }

  clearOutput() {
    const output = this._terminalStore.getOutputPanel();

    if (output) {
      clearTerminal(output);
    }
  }

  /** Take an isolated snapshot. Python uses template < lesson < editor precedence. */
  takeSnapshot() {
    if (!this._usesWebContainer()) {
      return {
        files: createWorkspaceSnapshot(
          this._lessonTemplate,
          this._lessonFiles,
          this._editorStore.documents.get(),
          this._workspaceRemovedPaths,
        ),
      };
    }

    const files = this._runner.takeSnapshot().files;

    for (const [filePath, document] of Object.entries(this._editorStore.documents.get())) {
      if (document?.type === 'file' && !document.loading && typeof document.value === 'string') {
        files[filePath.replace(/^\//, '')] = document.value;
      }
    }

    return { files };
  }

  private _usesWebContainer() {
    return this._lesson?.data.runtime?.provider !== 'pyodide';
  }
}
