import {
  IndexedDBExerciseStorage,
  RemoteExerciseStorage,
  createEmptyExerciseContent,
  createExerciseCatalogEntry,
  createExerciseDraft,
  createExerciseVersion,
  getExerciseCompleteness,
  getExerciseContentHash,
  getExercisePublishability,
  isExerciseAttachable,
  normalizeExerciseContent,
  normalizeFiles,
  normalizePath,
  parseExerciseValidationExecution,
  prepareExerciseValidationRun,
  type ExerciseCheckDefinition,
  type ExerciseDraft,
  type ExerciseFileRole,
  type ExerciseValidationResult,
  type FilesSnapshot,
  type TutorialStore,
} from '@tutorialkit/runtime';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExerciseWorkspaceContext } from '../../useInteractivePoc.js';

export type ExerciseAuthoringWorkspace = 'starter' | 'reference' | 'validation';

const storage = new IndexedDBExerciseStorage();
const remoteStorage = new RemoteExerciseStorage();

export function useExerciseAuthoring(options: {
  tutorialStore: TutorialStore;
  lessonId: string;
  ownerUserId?: string;
  context: ExerciseWorkspaceContext | null;
}) {
  const { tutorialStore, lessonId, ownerUserId, context } = options;
  const draftRef = useRef<ExerciseDraft>();
  const workspaceRef = useRef<ExerciseAuthoringWorkspace>('starter');
  const [draft, setDraftState] = useState<ExerciseDraft>();
  const [workspace, setWorkspaceState] = useState<ExerciseAuthoringWorkspace>('starter');
  const [drafts, setDrafts] = useState<ExerciseDraft[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [status, setStatus] = useState('idle');
  const [starterValidation, setStarterValidation] = useState<ExerciseValidationResult>();
  const [referenceValidation, setReferenceValidation] = useState<ExerciseValidationResult>();
  const [previewingAsStudent, setPreviewingAsStudent] = useState(false);
  const [previewValidation, setPreviewValidation] = useState<ExerciseValidationResult>();

  const refreshLibrary = useCallback(async () => {
    setLibraryStatus('loading');
    const localDrafts = await storage.listDrafts(ownerUserId);
    const forCurrentLesson = (items: ExerciseDraft[]) =>
      items
        .filter((item) => item.ownerUserId === ownerUserId && item.lessonId === lessonId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    if (!ownerUserId) {
      setDrafts([]);
      setLibraryStatus('ready');
      return;
    }

    try {
      const [catalog, remoteDrafts] = await Promise.all([
        remoteStorage.listCatalog(ownerUserId),
        remoteStorage.listDrafts(ownerUserId),
      ]);
      const mergedDrafts = new Map(localDrafts.map((draft) => [draft.exerciseId, draft]));

      for (const remoteDraft of remoteDrafts) {
        if (remoteDraft.ownerUserId !== ownerUserId) {
          continue;
        }
        const localDraft = mergedDrafts.get(remoteDraft.exerciseId);
        if (localDraft && localDraft.updatedAt >= remoteDraft.updatedAt) {
          continue;
        }

        await storage.saveDraft(remoteDraft);
        mergedDrafts.set(remoteDraft.exerciseId, remoteDraft);
      }

      for (const entry of catalog) {
        const localEntry = await storage.loadCatalogEntry(entry.exerciseId);
        if (!localEntry || localEntry.updatedAt < entry.updatedAt) {
          await storage.saveCatalogEntry(entry);
        }
        if (!entry.activeVersion || mergedDrafts.has(entry.exerciseId)) {
          continue;
        }

        const version = await remoteStorage.loadVersion(entry.exerciseId, entry.activeVersion);
        if (!version || version.ownerUserId !== ownerUserId) {
          continue;
        }

        const restored: ExerciseDraft = {
          schemaVersion: 1,
          exerciseId: version.exerciseId,
          ownerUserId: version.ownerUserId,
          lessonId: version.lessonId,
          content: version.content,
          verification: {},
          createdAt: version.createdAt,
          updatedAt: version.publishedAt,
        };
        await storage.saveDraft(restored);
        await storage.saveCatalogEntry(entry);
        mergedDrafts.set(restored.exerciseId, restored);
      }

      setDrafts(forCurrentLesson([...mergedDrafts.values()]));
      setLibraryStatus('ready');
    } catch {
      setDrafts(forCurrentLesson(localDrafts));
      setLibraryStatus('offline');
    }
  }, [lessonId, ownerUserId]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  function getWorkspaceFiles(): FilesSnapshot {
    const files: FilesSnapshot = {};

    for (const document of Object.values(tutorialStore.documents.get())) {
      if (document && !document.loading && document.type === 'file' && typeof document.value === 'string') {
        files[normalizePath(document.filePath)] = document.value;
      }
    }

    return Object.keys(files).length ? files : normalizeFiles(tutorialStore.takeSnapshot().files);
  }

  function replaceWorkspace(filesInput: FilesSnapshot) {
    const files = normalizeFiles(filesInput);
    const currentPaths = tutorialStore.files
      .get()
      .filter((file) => file.type === 'file')
      .map((file) => normalizePath(file.path));

    for (const path of currentPaths) {
      if (!(path in files)) {tutorialStore.removeFile(path);}
    }
    for (const [path, content] of Object.entries(files)) {tutorialStore.restoreFile(path, content);}
    const selected = tutorialStore.selectedFile.get();
    if (!selected || !(normalizePath(selected) in files)) {tutorialStore.setSelectedFile(Object.keys(files)[0]);}
  }

  function captureActiveWorkspace(input = draftRef.current): ExerciseDraft | undefined {
    if (!input) {return undefined;}
    const files = getWorkspaceFiles();
    const content = { ...input.content };

    if (workspaceRef.current === 'starter') {
      content.starterFiles = files;
      content.fileRoles = Object.fromEntries(
        Object.keys(files).map((path) => [
          path,
          input.content.fileRoles[path] === 'read-only' ? ('read-only' as const) : ('editable' as const),
        ]),
      );
    } else if (workspaceRef.current === 'reference') {
      content.referenceSolutionFiles = files;
    } else {
      content.privateValidationFiles = files;
      content.fileRoles = {
        ...input.content.fileRoles,
        ...Object.fromEntries(Object.keys(files).map((path) => [path, 'private-validation' as const])),
      };
    }

    const normalized = normalizeExerciseContent(content);
    const previousHash = getExerciseContentHash(input.content);
    const nextHash = getExerciseContentHash(normalized);
    const next: ExerciseDraft = {
      ...input,
      content: normalized,
      verification: previousHash === nextHash ? input.verification : {},
      updatedAt: new Date().toISOString(),
    };
    draftRef.current = next;
    setDraftState(next);
    return next;
  }

  function beginNew() {
    if (!ownerUserId || !context) {return undefined;}
    const content = createEmptyExerciseContent(context.teacherFiles);
    content.privateValidationFiles[content.validation.entrypoint] = defaultValidationSource();
    content.validation.checks = [
      { id: 'exercise-complete', title: 'Required behavior works', failureFeedback: 'The required behavior is not complete yet.' },
    ];
    const created = createExerciseDraft({ ownerUserId, lessonId, content });
    draftRef.current = created;
    workspaceRef.current = 'starter';
    setDraftState(created);
    setWorkspaceState('starter');
    setStarterValidation(undefined);
    setReferenceValidation(undefined);
    replaceWorkspace(created.content.starterFiles);
    setStatus('new exercise');
    return created;
  }

  async function openDraft(exerciseId: string) {
    const loaded = await storage.loadDraft(exerciseId);
    if (!loaded) {return undefined;}
    draftRef.current = loaded;
    workspaceRef.current = 'starter';
    setDraftState(loaded);
    setWorkspaceState('starter');
    setStarterValidation(loaded.verification.starter?.result);
    setReferenceValidation(loaded.verification.reference?.result);
    replaceWorkspace(loaded.content.starterFiles);
    setStatus('exercise loaded');
    return loaded;
  }

  function updateContent(
    update: Partial<
      Pick<ExerciseDraft['content'], 'title' | 'instructions' | 'explanation' | 'hints' | 'successFeedback' | 'failureFeedback'>
    >,
  ) {
    const current = captureActiveWorkspace();
    if (!current) {return;}
    const next = {
      ...current,
      content: normalizeExerciseContent({ ...current.content, ...update }),
      verification: {},
      updatedAt: new Date().toISOString(),
    };
    draftRef.current = next;
    setDraftState(next);
  }

  function updateValidationChecks(checks: ExerciseCheckDefinition[]) {
    const current = captureActiveWorkspace();
    if (!current) {return;}
    const next = {
      ...current,
      content: normalizeExerciseContent({
        ...current.content,
        validation: { ...current.content.validation, checks },
      }),
      verification: {},
      updatedAt: new Date().toISOString(),
    };
    draftRef.current = next;
    setDraftState(next);
  }

  function updateValidationConfig(update: { entrypoint?: string; timeoutMs?: number }) {
    const current = captureActiveWorkspace();
    if (!current) {return;}
    const next = {
      ...current,
      content: normalizeExerciseContent({
        ...current.content,
        validation: { ...current.content.validation, ...update },
      }),
      verification: {},
      updatedAt: new Date().toISOString(),
    };
    draftRef.current = next;
    setDraftState(next);
  }

  function setSelectedFileRole(role: Exclude<ExerciseFileRole, 'private-validation'>) {
    const current = captureActiveWorkspace();
    const selected = tutorialStore.selectedFile.get();
    if (!current || !selected || workspaceRef.current !== 'starter') {return;}
    const path = normalizePath(selected);
    const next = {
      ...current,
      content: { ...current.content, fileRoles: { ...current.content.fileRoles, [path]: role } },
      verification: {},
      updatedAt: new Date().toISOString(),
    };
    draftRef.current = next;
    setDraftState(next);
  }

  function removeReferenceSolution() {
    const current = captureActiveWorkspace();
    if (!current) {return;}
    const { referenceSolutionFiles: _removed, ...content } = current.content;
    const next = {
      ...current,
      content: normalizeExerciseContent(content as ExerciseDraft['content']),
      verification: { ...current.verification, reference: undefined },
      updatedAt: new Date().toISOString(),
    };
    draftRef.current = next;
    setDraftState(next);
    workspaceRef.current = 'starter';
    setWorkspaceState('starter');
    setReferenceValidation(undefined);
    replaceWorkspace(next.content.starterFiles);
  }

  function switchWorkspace(nextWorkspace: ExerciseAuthoringWorkspace) {
    const current = captureActiveWorkspace();
    if (!current) {return;}
    workspaceRef.current = nextWorkspace;
    setWorkspaceState(nextWorkspace);
    if (nextWorkspace === 'starter') {replaceWorkspace(current.content.starterFiles);}
    else if (nextWorkspace === 'reference') {
      const reference = current.content.referenceSolutionFiles ?? current.content.starterFiles;
      const next = current.content.referenceSolutionFiles
        ? current
        : { ...current, content: { ...current.content, referenceSolutionFiles: { ...reference } }, verification: {} };
      draftRef.current = next;
      setDraftState(next);
      replaceWorkspace(reference);
    } else {replaceWorkspace(current.content.privateValidationFiles);}
  }

  async function saveDraft() {
    const current = captureActiveWorkspace();
    if (!current) {return undefined;}
    await storage.saveDraft(current);
    let existingCatalog = await storage.loadCatalogEntry(current.exerciseId);
    if (!existingCatalog) {
      try {
        existingCatalog = await remoteStorage.loadCatalogEntry(current.exerciseId);
      } catch {
        // A missing remote catalog does not prevent local-first draft persistence.
      }
    }
    const catalog = createExerciseCatalogEntry(current, existingCatalog);
    await storage.saveCatalogEntry(catalog);

    let remoteSyncFailed = false;
    try {
      await remoteStorage.saveDraft(current);
      await remoteStorage.saveCatalogEntry(catalog);
    } catch {
      remoteSyncFailed = true;
    }

    await refreshLibrary();
    setStatus(remoteSyncFailed ? 'exercise draft saved locally; remote sync unavailable' : 'exercise draft saved');
    return current;
  }

  function previewAsStudent() {
    const current = captureActiveWorkspace();

    if (!current) {
      return;
    }

    setPreviewValidation(undefined);
    setPreviewingAsStudent(true);
    replaceWorkspace(current.content.starterFiles);
  }

  async function checkStudentPreview() {
    const current = draftRef.current;

    if (!current || !previewingAsStudent) {
      return undefined;
    }

    setStatus('checking student preview');
    let result: ExerciseValidationResult;

    try {
      const prepared = prepareExerciseValidationRun(current.content, getWorkspaceFiles());
      const execution = await tutorialStore.runExerciseValidation(prepared);
      result = parseExerciseValidationExecution(current.content, execution);
    } catch (error) {
      result = {
        outcome: 'broken',
        checks: [],
        diagnostics: error instanceof Error ? error.message : String(error),
      };
    }

    setPreviewValidation(result);
    setStatus(`student preview validation ${result.outcome}`);
    return result;
  }

  function exitStudentPreview() {
    const current = draftRef.current;

    setPreviewingAsStudent(false);
    setPreviewValidation(undefined);

    if (!current) {
      return;
    }

    if (workspaceRef.current === 'starter') {
      replaceWorkspace(current.content.starterFiles);
    } else if (workspaceRef.current === 'reference') {
      replaceWorkspace(current.content.referenceSolutionFiles ?? current.content.starterFiles);
    } else {
      replaceWorkspace(current.content.privateValidationFiles);
    }
  }

  async function runValidation(target: 'starter' | 'reference') {
    let current = captureActiveWorkspace();
    if (!current) {return undefined;}
    const files = target === 'starter' ? current.content.starterFiles : current.content.referenceSolutionFiles;
    if (!files) {
      setStatus('reference solution is missing');
      return undefined;
    }

    setStatus(`checking ${target}`);
    let result: ExerciseValidationResult;
    try {
      const prepared = prepareExerciseValidationRun(current.content, files);
      const execution = await tutorialStore.runExerciseValidation(prepared);
      result = parseExerciseValidationExecution(current.content, execution);
    } catch (error) {
      result = {
        outcome: 'broken',
        checks: [],
        diagnostics: error instanceof Error ? error.message : String(error),
      };
    }

    const run = { contentHash: getExerciseContentHash(current.content), checkedAt: new Date().toISOString(), result };
    current = {
      ...current,
      verification: { ...current.verification, [target]: run },
      updatedAt: new Date().toISOString(),
    };
    draftRef.current = current;
    setDraftState(current);
    if (target === 'starter') {setStarterValidation(result);}
    else {setReferenceValidation(result);}
    await storage.saveDraft(current);
    setStatus(`${target} validation ${result.outcome}`);
    return result;
  }

  async function publishDraft(exerciseId = draftRef.current?.exerciseId) {
    if (!exerciseId) {
      return undefined;
    }

    const current = exerciseId === draftRef.current?.exerciseId ? captureActiveWorkspace() : await storage.loadDraft(exerciseId);
    if (!current) {
      setStatus('exercise draft is unavailable');
      return undefined;
    }

    const publishable = getExercisePublishability(current);
    if (!publishable.complete) {
      setStatus(publishable.reasons.join(' '));
      return undefined;
    }

    setStatus('publishing exercise version');
    try {
      const [versions, catalog] = await Promise.all([
        remoteStorage.listVersions(current.exerciseId),
        remoteStorage.loadCatalogEntry(current.exerciseId),
      ]);
      const existing = versions.find((version) => version.contentHash === publishable.contentHash);
      const version = existing ?? createExerciseVersion(current, (versions.at(-1)?.version ?? 0) + 1);
      if (!existing) {
        await remoteStorage.saveVersion(version);
      }
      await remoteStorage.saveCatalogEntry({
        ...createExerciseCatalogEntry(current, catalog),
        activeVersion: version.version,
        updatedAt: new Date().toISOString(),
      });
      await storage.saveVersion(version);
      await storage.saveCatalogEntry({
        ...createExerciseCatalogEntry(current, catalog),
        activeVersion: version.version,
        updatedAt: new Date().toISOString(),
      });
      setStatus(`published exercise version ${version.version}`);
      return version;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to publish exercise version.');
      return undefined;
    }
  }

  function canComplete() {
    const current = draftRef.current;
    return current ? getExerciseCompleteness(current.content) : { complete: false, reasons: ['Create an exercise first.'] };
  }

  function publishability() {
    const current = draftRef.current;
    return current ? getExercisePublishability(current) : { complete: false, reasons: ['Create an exercise first.'], contentHash: '' };
  }

  function reset() {
    draftRef.current = undefined;
    setDraftState(undefined);
    setPreviewingAsStudent(false);
    setPreviewValidation(undefined);
    setStatus('idle');
  }

  const attachableDrafts = ownerUserId
    ? drafts.filter((item) => isExerciseAttachable(item, { ownerUserId, lessonId }))
    : [];

  return {
    draft,
    drafts,
    attachableDrafts,
    libraryStatus,
    workspace,
    status,
    starterValidation,
    referenceValidation,
    previewingAsStudent,
    previewValidation,
    beginNew,
    openDraft,
    updateContent,
    updateValidationChecks,
    updateValidationConfig,
    setSelectedFileRole,
    removeReferenceSolution,
    switchWorkspace,
    saveDraft,
    previewAsStudent,
    checkStudentPreview,
    exitStudentPreview,
    runValidation,
    publishDraft,
    canComplete,
    publishability,
    refreshLibrary,
    reset,
  };
}

function defaultValidationSource() {
  return `// Dynamically import learner modules inside check.run(), then replace this example check.\nexport const checks = [\n  {\n    id: 'exercise-complete',\n    async run() {\n      throw new Error('Configure this validation check.');\n    },\n  },\n];\n`;
}
