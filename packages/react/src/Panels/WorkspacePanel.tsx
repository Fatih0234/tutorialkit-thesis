import { useStore } from '@nanostores/react';
import {
  getExerciseCompleteness,
  getExercisePublishability,
  normalizeFiles,
  normalizePath,
  setPresentationMode,
  type PresentationLayout,
  type TutorialStore,
} from '@tutorialkit/runtime';
import { resolveRuntimeConfig, type I18n } from '@tutorialkit/types';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import type { EditorPointerCoordinateApi, EditorTextSelection } from '../core/CodeMirrorEditor/index.js';
import { DialogProvider } from '../core/Dialog.js';
import type { Theme } from '../core/types.js';
import { RuntimeControls } from '../runtimes/RuntimeControls.js';
import { getRuntimeCapabilities } from '../runtimes/RuntimeManager.js';
import { useLessonRuntime } from '../runtimes/useLessonRuntime.js';
import resizePanelStyles from '../styles/resize-panel.module.css';
import { classNames } from '../utils/classnames.js';
import { EditorPanel } from './EditorPanel.js';
import {
  InteractiveExperienceRoot,
  InteractiveManagementShell,
  InteractiveWorkspaceShell,
} from './InteractiveExperienceShells.js';
import { InteractiveExperienceProvider, useInteractiveExperienceState } from './InteractiveExperienceState.js';
import { InteractiveImmersiveHeader } from './InteractiveImmersiveHeader.js';
import { InteractiveMaterialPreparation } from './InteractiveMaterialPreparation.js';
import {
  InteractivePocControls,
  type InteractiveProductTab,
  type InteractiveTeacherStage,
} from './InteractivePocControls.js';
import { InteractiveButton } from './InteractivePocUi.js';
import { InteractivePresentationLayer, InteractivePresentationToolbar } from './InteractivePresentationLayer.js';
import { InteractiveRecordingStudio } from './InteractiveRecordingStudio.js';
import type { InteractiveRecordingMode } from './InteractiveTeacherDashboard.js';
import { InteractiveVideoControls } from './InteractiveVideoControls.js';
import { InteractiveWorkspaceSurface } from './InteractiveWorkspaceSurface.js';
import { PreviewPanel, type ImperativePreviewHandle } from './PreviewPanel.js';
import { TerminalPanel } from './TerminalPanel.js';
import { AiHelperWindow } from './interactive/ai/AiHelperWindow.js';
import { ExerciseAuthoring } from './interactive/exercises/ExerciseAuthoring.js';
import { ExerciseInsertionPicker } from './interactive/exercises/ExerciseInsertionPicker.js';
import { ExerciseWorkspaceTransition } from './interactive/exercises/ExerciseWorkspaceTransition.js';
import { LearnerExerciseInterstitial } from './interactive/exercises/LearnerExerciseInterstitial.js';
import { LearnerExerciseMode } from './interactive/exercises/LearnerExerciseMode.js';
import { isExerciseIntroductionVisible } from './interactive/exercises/exercise-transition.js';
import {
  createExercisePresentationLayout,
  getExercisePresentationResources,
} from './interactive/exercises/exercise-workspace-resources.js';
import { useExerciseAuthoring } from './interactive/exercises/useExerciseAuthoring.js';
import { makeAiContext, useAiTutor } from './interactive/ai/useAiTutor.js';
import { isImmersiveInteractiveScreen } from './interactive-session.js';
import { useInteractivePoc, type ExerciseWorkspaceContext } from './useInteractivePoc.js';

const DEFAULT_TERMINAL_SIZE = 25;
const INTERACTIVE_WORKSPACE_LAYOUT_KEY = 'interactive-poc.workspaceLayout';

type FileTreeChangeEvent = Parameters<NonNullable<ComponentProps<typeof EditorPanel>['onFileTreeChange']>>[0];
interface Props {
  tutorialStore: TutorialStore;
  theme: Theme;
  dialog: NonNullable<ComponentProps<typeof DialogProvider>['value']>;
}

interface PanelProps extends Omit<Props, 'dialog'> {
  hasEditor: boolean;
  hasPreviews: boolean;
  hideTerminalPanel: boolean;
}

interface TerminalProps extends PanelProps {
  terminalPanelRef: React.RefObject<ImperativePanelHandle>;
  terminalExpanded: React.MutableRefObject<boolean>;
  immersiveTerminalHost: HTMLDivElement | null;
  immersivePreviewHost: HTMLDivElement | null;
}

interface EditorSectionProps extends PanelProps {
  onImmersiveTerminalHostChange: (host: HTMLDivElement | null) => void;
  onImmersivePreviewHostChange: (host: HTMLDivElement | null) => void;
}

/**
 * This component is the orchestrator between various interactive components.
 */
export function WorkspacePanel({ tutorialStore, theme, dialog }: Props) {
  /**
   * Re-render when lesson changes.
   * The `tutorialStore.hasEditor()` and other methods below access
   * stale data as they are not reactive.
   */
  useStore(tutorialStore.ref);

  const hasEditor = tutorialStore.hasEditor();
  const runtimeCapabilities = getRuntimeCapabilities(resolveRuntimeConfig(tutorialStore.lesson?.data.runtime));
  const hasPreviews = tutorialStore.hasPreviews() && runtimeCapabilities.webPreview;
  const hideTerminalPanel = !tutorialStore.hasTerminalPanel();

  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalExpanded = useRef(false);
  const [immersiveTerminalHost, setImmersiveTerminalHost] = useState<HTMLDivElement | null>(null);
  const [immersivePreviewHost, setImmersivePreviewHost] = useState<HTMLDivElement | null>(null);

  return (
    <PanelGroup className={resizePanelStyles.PanelGroup} id="right-panel-group" direction="vertical">
      <DialogProvider value={dialog}>
        <InteractiveExperienceProvider>
          <EditorSection
            theme={theme}
            tutorialStore={tutorialStore}
            hasEditor={hasEditor}
            hasPreviews={hasPreviews}
            hideTerminalPanel={hideTerminalPanel}
            onImmersiveTerminalHostChange={setImmersiveTerminalHost}
            onImmersivePreviewHostChange={setImmersivePreviewHost}
          />
        </InteractiveExperienceProvider>
      </DialogProvider>

      <PanelResizeHandle
        className={resizePanelStyles.PanelResizeHandle}
        hitAreaMargins={{ fine: 5, coarse: 5 }}
        disabled={!hasEditor}
      />

      <PreviewsSection
        theme={theme}
        tutorialStore={tutorialStore}
        terminalPanelRef={terminalPanelRef}
        terminalExpanded={terminalExpanded}
        hideTerminalPanel={hideTerminalPanel}
        immersiveTerminalHost={immersiveTerminalHost}
        immersivePreviewHost={immersivePreviewHost}
        hasPreviews={hasPreviews}
        hasEditor={hasEditor}
      />

      <PanelResizeHandle
        className={resizePanelStyles.PanelResizeHandle}
        hitAreaMargins={{ fine: 5, coarse: 5 }}
        disabled={hideTerminalPanel || !hasPreviews}
      />

      <TerminalSection
        tutorialStore={tutorialStore}
        theme={theme}
        terminalPanelRef={terminalPanelRef}
        terminalExpanded={terminalExpanded}
        hideTerminalPanel={hideTerminalPanel}
        immersiveTerminalHost={immersiveTerminalHost}
        immersivePreviewHost={immersivePreviewHost}
        hasEditor={hasEditor}
        hasPreviews={hasPreviews}
      />
    </PanelGroup>
  );
}

function EditorSection({
  theme,
  tutorialStore,
  hasEditor,
  hasPreviews,
  hideTerminalPanel,
  onImmersiveTerminalHostChange,
  onImmersivePreviewHostChange,
}: EditorSectionProps) {
  const [helpAction, setHelpAction] = useState<'solve' | 'reset'>('reset');
  const { experience, dispatchExperience } = useInteractiveExperienceState();
  const [recordingMode, setRecordingMode] = useState<InteractiveRecordingMode>('none');
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [explanationSize, setExplanationSize] = useState(28);
  const [terminalSize, setTerminalSize] = useState(30);
  const [explanationHtml, setExplanationHtml] = useState('');
  const [exercisePresentationLayout, setExercisePresentationLayout] = useState<PresentationLayout>(() =>
    createExercisePresentationLayout([]),
  );
  const wasExerciseModeRef = useRef(false);
  const lessonExplanationOpenRef = useRef(false);
  const [isClientReady, setIsClientReady] = useState(false);
  const [experienceMount, setExperienceMount] = useState<HTMLElement | null>(null);
  const [editorSelection, setEditorSelection] = useState<EditorTextSelection | null>(null);
  const [preparedExerciseContext, setPreparedExerciseContext] = useState<ExerciseWorkspaceContext | null>(null);
  const [pendingPreparedExerciseId, setPendingPreparedExerciseId] = useState<'new' | string>();
  const editorPanelRef = useRef<ImperativePanelHandle>(null);
  const editorPointerApiRef = useRef<EditorPointerCoordinateApi | null>(null);
  const selectedFile = useStore(tutorialStore.selectedFile);
  const currentDocument = useStore(tutorialStore.currentDocument);
  const lessonFullyLoaded = useStore(tutorialStore.lessonFullyLoaded);
  const editorConfig = useStore(tutorialStore.editorConfig);
  const storeRef = useStore(tutorialStore.ref);
  const files = useStore(tutorialStore.files);
  const lesson = tutorialStore.lesson!;
  const interactivePoc = useInteractivePoc({
    tutorialStore,
    lessonId: lesson.id,
    selectedFile,
    lessonFullyLoaded,
    learnerTakeoverEnabled: experience.screen === 'learner-player',
    storeRef,
  });
  const isExerciseWorkspace = experience.screen === 'learner-player' && interactivePoc.controls.isExerciseMode;
  const exercisePresentationResources = useMemo(
    () =>
      isExerciseWorkspace
        ? getExercisePresentationResources(interactivePoc.controls.presentationResources, hasPreviews)
        : [],
    [hasPreviews, interactivePoc.controls.presentationResources, isExerciseWorkspace],
  );
  const lessonRuntime = useLessonRuntime(tutorialStore, interactivePoc.onRuntimeEvent, interactivePoc.controls.mode);
  const exerciseAuthoring = useExerciseAuthoring({
    tutorialStore,
    lessonId: lesson.id,
    ownerUserId: interactivePoc.controls.currentUser?.id,
    context: preparedExerciseContext,
  });
  const aiRecordingId = interactivePoc.controls.publishedRecordingId || interactivePoc.controls.currentDraftId;
  const aiContext = useMemo(() => {
    if (
      !aiRecordingId ||
      !interactivePoc.controls.currentUser ||
      interactivePoc.controls.currentUser.role === 'teacher'
    ) {
      return null;
    }

    const workspaceFiles = normalizeFiles(tutorialStore.takeSnapshot().files);

    if (currentDocument && typeof currentDocument.value === 'string') {
      workspaceFiles[normalizePath(currentDocument.filePath)] = currentDocument.value;
    }

    return makeAiContext({
      lessonId: lesson.id,
      title: lesson.id,
      recordingId: aiRecordingId,
      version: interactivePoc.controls.recordingVersion,
      timestampMs: interactivePoc.controls.playheadMs,
      mode: interactivePoc.controls.workspaceOwner === 'learner' ? 'experimenting' : 'following-teacher',
      selectedFilePath: selectedFile ? normalizePath(selectedFile) : null,
      workspaceFiles,
    });
  }, [
    aiRecordingId,
    interactivePoc.controls.currentUser,
    interactivePoc.controls.recordingVersion,
    interactivePoc.controls.playheadMs,
    interactivePoc.controls.workspaceOwner,
    lesson.id,
    selectedFile,
    currentDocument,
    tutorialStore,
  ]);
  const aiTutor = useAiTutor(aiContext, aiRecordingId || null);

  async function resumeTeacherPlayback() {
    await lessonRuntime.invalidate();
    interactivePoc.controls.onResumeTeacher();
  }

  const filePaths = files
    .filter((file) => file.type === 'file')
    .map((file) => normalizePath(file.path))
    .sort((a, b) => a.localeCompare(b));
  const initialFile = selectedFile ? normalizePath(selectedFile) : (filePaths[0] ?? '');
  const activeInteractiveTab: InteractiveProductTab = experience.screen.startsWith('learner') ? 'learner' : 'teacher';
  const teacherStage: InteractiveTeacherStage =
    experience.screen === 'teacher-materials'
      ? 'materials'
      : experience.screen === 'teacher-recording'
        ? 'recording'
        : experience.screen === 'teacher-review'
          ? 'review'
          : 'setup';
  const isImmersiveExperience = isImmersiveInteractiveScreen(experience.screen);
  const isRecordingStudio = experience.screen === 'teacher-recording';

  function setExplanationPanelOpen(open: boolean) {
    interactivePoc.onWorkspaceLayoutChange();
    setExplanationOpen(open);
  }

  function setTerminalPanelOpen(open: boolean) {
    interactivePoc.onWorkspaceLayoutChange();
    setTerminalOpen(open);
  }

  function setExplanationPanelSize(size: number) {
    interactivePoc.onWorkspaceLayoutChange();
    setExplanationSize(size);
  }

  function setTerminalPanelSize(size: number) {
    interactivePoc.onWorkspaceLayoutChange();
    setTerminalSize(size);
  }

  function onHelpClick() {
    if (tutorialStore.hasSolution()) {
      setHelpAction((action) => {
        if (action === 'reset') {
          tutorialStore.reset();

          return 'solve';
        } else {
          tutorialStore.solve();

          return 'reset';
        }
      });
    } else {
      tutorialStore.reset();
    }
  }

  async function startConfiguredRecording() {
    if (isStartingRecording) {
      return;
    }

    setIsStartingRecording(true);
    tutorialStore.setSelectedFile(initialFile || undefined);

    try {
      const started =
        recordingMode === 'audio'
          ? await interactivePoc.controls.onStartMicRecording()
          : recordingMode === 'webcam'
            ? await interactivePoc.controls.onStartCameraRecording()
            : await interactivePoc.controls.onStartRecording();

      if (started) {
        dispatchExperience({ type: 'START_RECORDING' });
      }
    } finally {
      setIsStartingRecording(false);
    }
  }

  async function stopConfiguredRecording() {
    await interactivePoc.controls.onStopRecording();
    dispatchExperience({ type: 'REVIEW_RECORDING' });
  }

  function previewCurrentDraft() {
    dispatchExperience({ type: 'REVIEW_RECORDING' });
    void interactivePoc.controls.onPreviewDraft();
  }

  function previewSelectedDraft(recordingId: string) {
    dispatchExperience({ type: 'REVIEW_RECORDING', recordingId });
    void interactivePoc.controls.onPreviewDraft(recordingId);
  }

  function previewSelectedPublished(recordingId: string) {
    dispatchExperience({ type: 'REVIEW_RECORDING', recordingId });
    void interactivePoc.controls.onPreviewPublishedRecording(recordingId);
  }

  function createPreparedExerciseContext(): ExerciseWorkspaceContext {
    const workspaceFiles: Record<string, string> = {};

    for (const document of Object.values(tutorialStore.documents.get())) {
      if (document && !document.loading && document.type === 'file' && typeof document.value === 'string') {
        workspaceFiles[normalizePath(document.filePath)] = document.value;
      }
    }

    return {
      teacherFiles: workspaceFiles,
      selectedFile: selectedFile ? normalizePath(selectedFile) : undefined,
    };
  }

  function restorePreparedExerciseWorkspace() {
    if (!preparedExerciseContext) {return;}
    const files = normalizeFiles(preparedExerciseContext.teacherFiles);
    for (const file of tutorialStore.files.get()) {
      if (file.type === 'file' && !(normalizePath(file.path) in files)) {tutorialStore.removeFile(file.path);}
    }
    for (const [path, content] of Object.entries(files)) {tutorialStore.restoreFile(path, content);}
    if (preparedExerciseContext.selectedFile) {tutorialStore.setSelectedFile(preparedExerciseContext.selectedFile);}
    setPreparedExerciseContext(null);
  }

  function openPreparedExercise(exerciseId: 'new' | string) {
    setPreparedExerciseContext(createPreparedExerciseContext());
    setPendingPreparedExerciseId(exerciseId);
    exerciseAuthoring.reset();
    dispatchExperience({ type: 'AUTHOR_EXERCISE' });
  }

  function openReviewExercise(exerciseId: string) {
    openPreparedExercise(exerciseId);
  }

  function changeInteractiveTab(tab: InteractiveProductTab) {
    dispatchExperience({ type: tab === 'teacher' ? 'SHOW_TEACHER_DASHBOARD' : 'SHOW_LEARNER_LIBRARY' });
  }

  function openLearnerLesson(recordingId: string) {
    if (!recordingId) {
      return;
    }

    interactivePoc.controls.onLoadPublishedRecording(recordingId);
    dispatchExperience({ type: 'OPEN_LEARNER_RECORDING', recordingId });
  }

  async function exitLearnerPlayer() {
    if (interactivePoc.controls.exerciseTransitionPhase !== 'idle') {
      await interactivePoc.controls.onExitExerciseMode();
    } else if (interactivePoc.controls.workspaceOwner === 'learner') {
      await resumeTeacherPlayback();

      if (interactivePoc.controls.isLearnerWorkspaceDirty) {
        return;
      }
    }

    if (interactivePoc.controls.isPlaying) {
      interactivePoc.controls.onPausePreviewPlayback();
    }

    dispatchExperience({ type: 'EXIT_LEARNER_PLAYER' });
  }

  function exitTeacherReview() {
    if (interactivePoc.controls.isPlaying) {
      interactivePoc.controls.onPausePreviewPlayback();
    }

    dispatchExperience({ type: 'SHOW_TEACHER_DASHBOARD' });
  }

  async function onFileTreeChange({ method, type, value }: FileTreeChangeEvent) {
    if (method === 'add' && type === 'file') {
      if (!interactivePoc.onBeforeUserProjectMutation()) {
        return;
      }

      await tutorialStore.addFile(value);
      interactivePoc.onFileCreated(value);

      return;
    }

    if (method === 'add' && type === 'folder') {
      if (!interactivePoc.onBeforeUserProjectMutation()) {
        return;
      }

      return tutorialStore.addFolder(value);
    }
  }

  useEffect(() => {
    setIsClientReady(true);
    setExperienceMount(document.getElementById('interactive-experience-root'));

    const template = document.getElementById(`interactive-explanation-${lesson.id}`) as HTMLTemplateElement | null;
    const explanation = template?.content.querySelector<HTMLElement>('.markdown-content');
    setExplanationHtml(explanation?.innerHTML ?? '');

    window.dispatchEvent(new CustomEvent('tutorialkit:interactive-shell', { detail: { active: true } }));

    try {
      const saved = JSON.parse(localStorage.getItem(INTERACTIVE_WORKSPACE_LAYOUT_KEY) ?? '{}') as {
        explanationOpen?: boolean;
        terminalOpen?: boolean;
        explanationSize?: number;
        terminalSize?: number;
      };
      setExplanationOpen(saved.explanationOpen ?? false);
      setTerminalOpen(!hideTerminalPanel && (saved.terminalOpen ?? false));
      setExplanationSize(Math.min(45, Math.max(18, saved.explanationSize ?? 28)));
      setTerminalSize(Math.min(65, Math.max(18, saved.terminalSize ?? 30)));
    } catch {
      setExplanationOpen(false);
      setTerminalOpen(false);
    }

    return () => {
      window.dispatchEvent(new CustomEvent('tutorialkit:interactive-shell', { detail: { active: false } }));
    };
  }, [lesson.id, hideTerminalPanel]);

  useEffect(() => {
    if (isExerciseWorkspace && !wasExerciseModeRef.current) {
      lessonExplanationOpenRef.current = explanationOpen;
      setExplanationOpen(true);
      setExercisePresentationLayout(createExercisePresentationLayout(exercisePresentationResources));
    } else if (!isExerciseWorkspace && wasExerciseModeRef.current) {
      setExplanationOpen(lessonExplanationOpenRef.current);
    }
    wasExerciseModeRef.current = isExerciseWorkspace;
  }, [exercisePresentationResources, explanationOpen, isExerciseWorkspace]);

  useEffect(() => {
    localStorage.setItem(
      INTERACTIVE_WORKSPACE_LAYOUT_KEY,
      JSON.stringify({
        explanationOpen,
        terminalOpen,
        explanationSize,
        terminalSize,
      }),
    );
  }, [explanationOpen, terminalOpen, explanationSize, terminalSize]);

  useEffect(() => {
    if (tutorialStore.hasSolution()) {
      setHelpAction('solve');
    } else {
      setHelpAction('reset');
    }
  }, [storeRef]);

  useEffect(() => {
    setEditorSelection(null);
  }, [selectedFile, experience.screen]);

  useEffect(() => {
    if (interactivePoc.controls.isRecordingPausedForExercise && experience.screen === 'teacher-recording') {
      void exerciseAuthoring.refreshLibrary();
    }
  }, [interactivePoc.controls.isRecordingPausedForExercise, experience.screen]);

  useEffect(() => {
    if (experience.screen !== 'teacher-exercise-authoring' || !preparedExerciseContext || !pendingPreparedExerciseId) {
      return;
    }

    const pending = pendingPreparedExerciseId;
    setPendingPreparedExerciseId(undefined);
    if (pending === 'new') {exerciseAuthoring.beginNew();}
    else {void exerciseAuthoring.openDraft(pending);}
  }, [experience.screen, preparedExerciseContext, pendingPreparedExerciseId]);

  useEffect(() => {
    if (!selectedFile && filePaths[0]) {
      tutorialStore.setSelectedFile(filePaths[0]);
    }
  }, [selectedFile, storeRef]);

  useEffect(() => {
    if (!isRecordingStudio) {
      return undefined;
    }

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeLeaving);

    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [isRecordingStudio]);

  const getEditorPointerApis = useCallback(() => {
    const domApis = [...document.querySelectorAll<HTMLElement>('.cm-editor')]
      .map(
        (element) =>
          (element as HTMLElement & { __tutorialKitPointerCoordinateApi?: EditorPointerCoordinateApi })
            .__tutorialKitPointerCoordinateApi,
      )
      .filter((api): api is EditorPointerCoordinateApi => Boolean(api));
    return editorPointerApiRef.current && !domApis.includes(editorPointerApiRef.current)
      ? [editorPointerApiRef.current, ...domApis]
      : domApis;
  }, []);
  const getEditorPointerAnchor = useCallback(
    (clientX: number, clientY: number) => {
      for (const api of getEditorPointerApis()) {
        const position = api.positionAtCoordinates(clientX, clientY);

        if (position) {
          return { kind: 'editor' as const, ...position };
        }
      }
      return null;
    },
    [getEditorPointerApis],
  );
  const resolveEditorPointerAnchor = useCallback(
    (anchor: { filePath: string; documentOffset: number; offsetX: number; offsetY: number }) => {
      for (const api of getEditorPointerApis()) {
        const coordinates = api.coordinatesAtPosition(anchor);

        if (coordinates) {
          return coordinates;
        }
      }
      return null;
    },
    [getEditorPointerApis],
  );

  const managementControls = (
    <InteractivePocControls
      {...interactivePoc.controls}
      activeTab={activeInteractiveTab}
      teacherStage={teacherStage}
      onSelectPublishedRecording={(recordingId) => {
        interactivePoc.controls.onSelectPublishedRecording(recordingId);
        dispatchExperience({ type: 'SELECT_LEARNER_RECORDING', recordingId });
      }}
      lessonId={lesson.id}
      filePaths={filePaths}
      initialFile={initialFile}
      selectedFile={selectedFile ? normalizePath(selectedFile) : ''}
      recordingMode={recordingMode}
      isStartingRecording={isStartingRecording}
      onActiveTabChange={changeInteractiveTab}
      onInitialFileChange={(filePath) => tutorialStore.setSelectedFile(filePath)}
      onRecordingModeChange={setRecordingMode}
      onPrepareMaterials={() => dispatchExperience({ type: 'PREPARE_MATERIALS' })}
      onFinishPreparingMaterials={() => dispatchExperience({ type: 'SHOW_TEACHER_DASHBOARD' })}
      onStartConfiguredRecording={() => void startConfiguredRecording()}
      onStopConfiguredRecording={() => void stopConfiguredRecording()}
      onReturnToSetup={() => dispatchExperience({ type: 'SHOW_TEACHER_DASHBOARD' })}
      onPreviewCurrentDraft={previewCurrentDraft}
      onPreviewSelectedDraft={previewSelectedDraft}
      onPreviewSelectedPublished={previewSelectedPublished}
      exerciseDrafts={exerciseAuthoring.drafts.map((exercise) => {
        const completeness = getExerciseCompleteness(exercise.content);
        const publishability = getExercisePublishability(exercise);

        return {
          exerciseId: exercise.exerciseId,
          title: exercise.content.title,
          complete: completeness.complete,
          publishable: publishability.complete,
          publicationReasons: publishability.reasons,
        };
      })}
      exerciseAuthoringStatus={exerciseAuthoring.status}
      onCreatePreparedExercise={() => openPreparedExercise('new')}
      onOpenPreparedExercise={openPreparedExercise}
      onPublishPreparedExercise={(exerciseId) => void exerciseAuthoring.publishDraft(exerciseId)}
      onOpenLearnerLesson={openLearnerLesson}
      onResumeTeacher={() => void resumeTeacherPlayback()}
    />
  );

  const editor = (
    <div className="flex h-full min-h-0 flex-col">
      {lessonRuntime.capabilities.execution ? (
        <RuntimeControls
          capabilities={lessonRuntime.capabilities}
          status={lessonRuntime.status}
          error={lessonRuntime.error}
          disabled={!lessonFullyLoaded || interactivePoc.controls.playbackStatus === 'playing'}
          onRun={() => void lessonRuntime.run()}
          onStop={() => void lessonRuntime.stop()}
          onReset={() => void lessonRuntime.reset()}
          onClear={lessonRuntime.clear}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        <EditorPanel
          id={storeRef}
          theme={theme}
          showFileTree={tutorialStore.hasFileTree()}
          editorDocument={currentDocument}
          files={files}
          i18n={lesson.data.i18n as I18n}
          hideRoot={lesson.data.hideRoot}
          helpAction={helpAction}
          onHelpClick={lessonFullyLoaded ? onHelpClick : undefined}
          onFileSelect={interactivePoc.onFileSelect}
          onFileTreeChange={onFileTreeChange}
          allowEditPatterns={
            experience.screen === 'teacher-exercise-authoring'
              ? ['/**']
              : interactivePoc.controls.isExerciseMode
                ? interactivePoc.controls.activeExercise?.allowCreatePatterns
                : editorConfig.fileTree.allowEdits || undefined
          }
          selectedFile={selectedFile}
          documentSyncOrigin={
            experience.screen === 'teacher-exercise-authoring' || interactivePoc.controls.isExerciseMode
              ? 'exercise-workspace-sync'
              : undefined
          }
          readOnly={
            (experience.screen === 'teacher-exercise-authoring' &&
              (exerciseAuthoring.workspace === 'starter' || exerciseAuthoring.previewingAsStudent) &&
              Boolean(
                selectedFile &&
                  exerciseAuthoring.draft?.content.fileRoles[normalizePath(selectedFile)] === 'read-only',
              )) ||
            (interactivePoc.controls.isExerciseMode &&
              Boolean(
                selectedFile &&
                  interactivePoc.controls.activeExercise?.fileRoles[normalizePath(selectedFile)] === 'read-only',
              ))
          }
          onEditorScroll={interactivePoc.onEditorScroll}
          onBeforeUserDocumentChange={interactivePoc.onBeforeUserProjectMutation}
          onEditorSaveShortcut={interactivePoc.onEditorSaveShortcut}
          onEditorDocumentChangeImmediate={interactivePoc.onEditorDocumentChangeImmediate}
          onEditorDocumentChangeSettled={interactivePoc.onEditorDocumentChangeSettled}
          onEditorSelectionChange={setEditorSelection}
          onEditorSelectionRangeChange={interactivePoc.onEditorSelectionChange}
          instructorPresence={
            (experience.screen === 'teacher-review' || experience.screen === 'learner-player') && selectedFile
              ? (interactivePoc.instructorPresenceByFile[normalizePath(selectedFile)] ?? null)
              : null
          }
          learnerChangedFilePaths={
            experience.screen === 'learner-player' &&
            interactivePoc.controls.workspaceOwner === 'learner' &&
            interactivePoc.controls.learnerHistoryViewMode === 'head'
              ? interactivePoc.controls.learnerChangedFilePaths
              : undefined
          }
          learnerChangeComparison={
            experience.screen === 'learner-player' &&
            interactivePoc.controls.workspaceOwner === 'learner' &&
            interactivePoc.controls.learnerChangeKind !== 'none' &&
            interactivePoc.controls.learnerComparisonBaseFiles !== null &&
            selectedFile
              ? {
                  kind: interactivePoc.controls.learnerChangeKind,
                  baseContent: interactivePoc.controls.learnerComparisonBaseFiles[normalizePath(selectedFile)] ?? null,
                  selectionKey: interactivePoc.controls.learnerChangeSelectionKey,
                }
              : undefined
          }
          onPointerCoordinateApiChange={(api) => {
            editorPointerApiRef.current = api;
          }}
        />
      </div>
    </div>
  );

  const presentationAudience = experience.screen === 'learner-player' ? 'learner' : 'teacher';
  const lessonPresentationModeChange =
    experience.screen === 'teacher-materials' || experience.screen === 'teacher-recording'
      ? interactivePoc.controls.onTeacherPresentationModeChange
      : interactivePoc.controls.onLearnerPresentationModeChange;
  const visiblePresentationResources = isExerciseWorkspace
    ? exercisePresentationResources
    : interactivePoc.controls.presentationResources;
  const visiblePresentationLayout = isExerciseWorkspace
    ? exercisePresentationLayout
    : interactivePoc.controls.presentationLayout;
  const onPresentationModeChange = (resourceId: string, mode: Parameters<typeof setPresentationMode>[3]) => {
    if (isExerciseWorkspace) {
      setExercisePresentationLayout((layout) =>
        setPresentationMode(exercisePresentationResources, layout, resourceId, mode),
      );
      return;
    }
    lessonPresentationModeChange(resourceId, mode);
  };
  const cameraMediaUrl =
    !isExerciseWorkspace && interactivePoc.controls.mediaKind === 'webcam'
      ? interactivePoc.controls.mediaPreviewUrl
      : '';

  const editorSurface = (
    <InteractiveWorkspaceSurface
      aiControl={
        experience.screen === 'learner-player' && interactivePoc.controls.currentUser?.role === 'learner' ? (
          <AiHelperWindow tutor={aiTutor} editorSelection={editorSelection} />
        ) : null
      }
      presentationToolbar={
        !isExerciseWorkspace || visiblePresentationResources.length ? (
          <InteractivePresentationToolbar
            audience={presentationAudience}
            resources={visiblePresentationResources}
            layout={visiblePresentationLayout}
            hasLearnerOverride={!isExerciseWorkspace && interactivePoc.controls.hasLearnerPresentationOverride}
            cameraMediaUrl={cameraMediaUrl}
            onModeChange={onPresentationModeChange}
            onFollowTeacher={interactivePoc.controls.onFollowTeacherPresentation}
          />
        ) : null
      }
      explanationHtml={explanationHtml}
      explanationText={isExerciseWorkspace ? (interactivePoc.controls.activeExercise?.explanation ?? '') : undefined}
      explanationTitle={isExerciseWorkspace ? 'Exercise Explanation' : 'Explanation'}
      explanationOpen={explanationOpen}
      terminalOpen={terminalOpen}
      terminalAvailable={!hideTerminalPanel}
      explanationSize={explanationSize}
      terminalSize={terminalSize}
      onExplanationOpenChange={setExplanationPanelOpen}
      onTerminalOpenChange={setTerminalPanelOpen}
      onExplanationSizeChange={setExplanationPanelSize}
      onTerminalSizeChange={setTerminalPanelSize}
      onTerminalHostChange={onImmersiveTerminalHostChange}
      presentationLayer={
        <InteractivePresentationLayer
          resources={visiblePresentationResources}
          layout={visiblePresentationLayout}
          explanationHtml={explanationHtml}
          canEditDeck={experience.screen === 'teacher-materials'}
          onModeChange={onPresentationModeChange}
          onDeckAction={
            experience.screen === 'teacher-materials' || experience.screen === 'teacher-recording'
              ? interactivePoc.controls.onTeacherDeckAction
              : interactivePoc.controls.onLearnerDeckAction
          }
          onDeckChange={interactivePoc.controls.onUpdatePresentationDeck}
          onPreviewHostChange={onImmersivePreviewHostChange}
          cameraMediaUrl={cameraMediaUrl}
          onCameraMediaElementRef={interactivePoc.controls.onMediaElementRef}
          whiteboardScene={interactivePoc.controls.whiteboardScene}
          whiteboardReadOnly={experience.screen !== 'teacher-materials' && experience.screen !== 'teacher-recording'}
          whiteboardError={interactivePoc.controls.whiteboardError}
          onWhiteboardSceneCommit={interactivePoc.controls.onWhiteboardSceneCommit}
        />
      }
    >
      {editor}
    </InteractiveWorkspaceSurface>
  );

  const editorExperience = (
    <InteractiveExperienceRoot
      screen={experience.screen}
      theme={theme}
      hydrated={isClientReady}
      mount={experienceMount}
      captureTeacherPointer={experience.screen === 'teacher-recording' && interactivePoc.controls.isRecording}
      teacherPointer={interactivePoc.controls.teacherPointer}
      teacherPointerClickButton={interactivePoc.controls.teacherPointerClickButton}
      teacherPointerClickSequence={interactivePoc.controls.teacherPointerClickSequence}
      showTeacherPointer={
        experience.screen === 'teacher-review' ||
        (experience.screen === 'learner-player' && interactivePoc.controls.workspaceOwner === 'teacher')
      }
      onTeacherPointerChange={interactivePoc.controls.onTeacherPointerChange}
      onTeacherPointerClick={interactivePoc.controls.onTeacherPointerClick}
      getEditorPointerAnchor={getEditorPointerAnchor}
      resolveEditorPointerAnchor={resolveEditorPointerAnchor}
    >
      <InteractiveManagementShell active={!isImmersiveExperience}>{managementControls}</InteractiveManagementShell>
      <InteractiveWorkspaceShell active={isImmersiveExperience}>
        {experience.screen === 'teacher-materials' ? (
          <InteractiveMaterialPreparation
            lessonId={lesson.id}
            fileCount={filePaths.length}
            selectedFile={selectedFile ? normalizePath(selectedFile) : ''}
            onDone={() => dispatchExperience({ type: 'SHOW_TEACHER_DASHBOARD' })}
            onStartRecording={() => void startConfiguredRecording()}
            isStartingRecording={isStartingRecording}
          />
        ) : null}
        {experience.screen === 'teacher-recording' ? (
          interactivePoc.controls.isRecordingPausedForExercise ? (
            <ExerciseInsertionPicker
              exercises={exerciseAuthoring.attachableDrafts}
              libraryStatus={exerciseAuthoring.libraryStatus}
              onAttach={(exerciseId) => Boolean(interactivePoc.controls.onAttachExerciseAtPausedPosition(exerciseId))}
              onCancel={interactivePoc.controls.onCancelExerciseInsertion}
              onRetry={() => void exerciseAuthoring.refreshLibrary()}
            />
          ) : (
            <InteractiveRecordingStudio
              model={interactivePoc.controls}
              lessonId={lesson.id}
              initialFile={initialFile}
              onStop={() => void stopConfiguredRecording()}
            />
          )
        ) : null}
        {experience.screen === 'teacher-exercise-authoring' ? (
          <ExerciseAuthoring
            authoring={exerciseAuthoring}
            selectedFile={selectedFile ? normalizePath(selectedFile) : undefined}
            onDone={() => {
              restorePreparedExerciseWorkspace();
              dispatchExperience({ type: 'SHOW_TEACHER_DASHBOARD' });
              exerciseAuthoring.reset();
            }}
            onCancel={() => {
              restorePreparedExerciseWorkspace();
              dispatchExperience({ type: 'SHOW_TEACHER_DASHBOARD' });
              exerciseAuthoring.reset();
            }}
          />
        ) : null}
        {experience.screen === 'teacher-review' ? (
          <InteractiveImmersiveHeader
            eyebrow="Recording review"
            title="Recording Review"
            status={interactivePoc.controls.recordingStorageSource === 'published' ? 'Published' : 'Teacher preview'}
            statusTone={interactivePoc.controls.recordingStorageSource === 'published' ? 'positive' : 'info'}
            currentTimeMs={interactivePoc.controls.playheadMs}
            onExit={exitTeacherReview}
            exitLabel="Dashboard"
            actions={
              interactivePoc.controls.recordingStorageSource === 'published' ? undefined : (
                <>
                  <InteractiveButton
                    icon="i-ph-floppy-disk"
                    onClick={interactivePoc.controls.onSaveDraft}
                    disabled={!interactivePoc.controls.canSaveDraft}
                  >
                    Save Draft
                  </InteractiveButton>
                  <InteractiveButton
                    variant="primary"
                    icon="i-ph-upload-simple"
                    onClick={interactivePoc.controls.onPublishRecording}
                    disabled={!interactivePoc.controls.canPublishRecording}
                  >
                    Publish
                  </InteractiveButton>
                </>
              )
            }
          />
        ) : null}
        {experience.screen === 'teacher-review' && interactivePoc.controls.exercisePoints.length > 0 ? (
          <section aria-label="Recording exercises" className="shrink-0 border-b border-tk-border-primary bg-tk-background-secondary px-4 py-2">
            <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-2">
              <strong className="mr-2 text-xs text-tk-text-primary">Exercises</strong>
              {interactivePoc.controls.exercisePoints.map((point) => {
                const draft = exerciseAuthoring.drafts.find((item) => item.exerciseId === point.exerciseId);
                return (
                  <span key={point.id} className="inline-flex items-center gap-1 rounded border border-tk-border-primary p-1">
                    <InteractiveButton
                      variant="ghost"
                      icon="i-ph-pencil"
                      onClick={() => openReviewExercise(point.exerciseId)}
                    >
                      {draft?.content.title || 'Unfinished exercise'}
                    </InteractiveButton>
                    {interactivePoc.controls.recordingStorageSource !== 'published' ? (
                      <InteractiveButton
                        variant="ghost"
                        icon="i-ph-trash"
                        onClick={() => interactivePoc.controls.onRemoveExercisePoint(point.id)}
                      >
                        Remove
                      </InteractiveButton>
                    ) : null}
                  </span>
                );
              })}
            </div>
          </section>
        ) : null}
        {experience.screen === 'teacher-review' && interactivePoc.controls.publishedError !== 'none' ? (
          <p role="alert" className="m-0 shrink-0 border-b border-red-500/40 bg-red-950/40 px-4 py-2 text-xs text-red-200">
            {interactivePoc.controls.publishedError}
          </p>
        ) : null}
        {experience.screen === 'learner-player' ? (
          <InteractiveImmersiveHeader
            eyebrow="Interactive lesson"
            title={lesson.id}
            status={
              interactivePoc.controls.isExerciseMode
                ? 'Exercise Mode'
                : interactivePoc.controls.exerciseTransitionPhase !== 'idle'
                  ? 'Exercise checkpoint'
                  : interactivePoc.controls.workspaceOwner === 'learner'
                  ? 'My Workspace'
                  : 'Following Teacher'
            }
            statusTone={
              interactivePoc.controls.isExerciseMode ||
              interactivePoc.controls.exerciseTransitionPhase !== 'idle' ||
              interactivePoc.controls.workspaceOwner === 'learner'
                ? 'warning'
                : 'positive'
            }
            currentTimeMs={interactivePoc.controls.playheadMs}
            onExit={() => void exitLearnerPlayer()}
            exitLabel="Lessons"
          />
        ) : null}
        {experience.screen === 'learner-player' && interactivePoc.controls.isExerciseMode ? (
          <LearnerExerciseMode model={interactivePoc.controls} />
        ) : null}
        {editorSurface}
        {experience.screen === 'learner-player' &&
        (isExerciseIntroductionVisible(interactivePoc.controls.exerciseTransitionPhase) ||
          (interactivePoc.controls.exerciseTransitionPhase === 'covering' && !interactivePoc.controls.isExerciseMode)) ? (
          <LearnerExerciseInterstitial model={interactivePoc.controls} />
        ) : null}
        {experience.screen === 'learner-player' ? (
          <ExerciseWorkspaceTransition
            phase={interactivePoc.controls.exerciseTransitionPhase}
            onCovered={interactivePoc.controls.onExerciseTransitionCovered}
            onRevealed={interactivePoc.controls.onExerciseTransitionRevealed}
          />
        ) : null}
        {experience.screen === 'teacher-review' ? (
          <InteractiveVideoControls
            audience="teacher"
            model={interactivePoc.controls}
            onPlay={
              interactivePoc.controls.playbackStatus === 'paused'
                ? interactivePoc.controls.onContinuePlayback
                : previewCurrentDraft
            }
            onPause={interactivePoc.controls.onPausePreviewPlayback}
          />
        ) : null}
        {experience.screen === 'learner-player' && !interactivePoc.controls.isExerciseMode ? (
          <InteractiveVideoControls
            audience="learner"
            model={{ ...interactivePoc.controls, onResumeTeacher: () => void resumeTeacherPlayback() }}
            onPlay={
              interactivePoc.controls.workspaceOwner === 'learner'
                ? () => void resumeTeacherPlayback()
                : interactivePoc.controls.playbackStatus === 'paused'
                  ? interactivePoc.controls.onContinuePlayback
                  : interactivePoc.controls.onPlayRecording
            }
            onPause={interactivePoc.controls.onPausePreviewPlayback}
          />
        ) : null}
      </InteractiveWorkspaceShell>
    </InteractiveExperienceRoot>
  );

  return (
    <Panel
      ref={editorPanelRef}
      id={hasEditor ? 'editor-opened' : 'editor-closed'}
      defaultSize={hasEditor ? 55 : 0}
      minSize={10}
      maxSize={hasEditor ? 100 : 0}
      collapsible={!hasEditor}
      className="flex flex-col overflow-hidden transition-theme bg-tk-elements-panel-backgroundColor text-tk-elements-panel-textColor"
    >
      {editorExperience}
    </Panel>
  );
}

function PreviewsSection({
  tutorialStore,
  terminalPanelRef,
  terminalExpanded,
  hideTerminalPanel,
  immersivePreviewHost,
  hasPreviews,
  hasEditor,
}: TerminalProps) {
  const previewRef = useRef<ImperativePreviewHandle>(null);
  const lesson = tutorialStore.lesson!;
  const terminalConfig = useStore(tutorialStore.terminalConfig);
  const storeRef = useStore(tutorialStore.ref);

  function showTerminal() {
    const { current: terminal } = terminalPanelRef;

    if (!terminal) {
      return;
    }

    if (!terminalExpanded.current) {
      terminalExpanded.current = true;
      terminal.resize(DEFAULT_TERMINAL_SIZE);
    } else {
      terminal.expand();
    }
  }

  useEffect(() => {
    if (hideTerminalPanel) {
      // force hide the terminal if we don't have any panels to show
      terminalPanelRef.current?.collapse();

      terminalExpanded.current = false;
    }
  }, [hideTerminalPanel]);

  useEffect(() => {
    if (terminalConfig.defaultOpen) {
      showTerminal();
    }
  }, [terminalConfig.defaultOpen]);

  useEffect(() => {
    const lesson = tutorialStore.lesson!;

    const unsubscribe = tutorialStore.lessonFullyLoaded.subscribe((loaded) => {
      if (loaded && lesson.data.autoReload) {
        previewRef.current?.reload();
      }
    });

    return () => unsubscribe();
  }, [storeRef]);

  const MIN_SIZE_IN_PIXELS = 38;
  const [panelMinSize, setPanelMinSize] = useState(10);

  useEffect(() => {
    const panelGroup = document.querySelector('div[data-panel-group-id="right-panel-group"]' as 'div');

    if (!panelGroup) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const height = panelGroup?.offsetHeight;
      setPanelMinSize((MIN_SIZE_IN_PIXELS / height) * 100);
    });
    observer.observe(panelGroup);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <Panel
      id={hasPreviews ? 'previews-opened' : 'previews-closed'}
      defaultSize={hasPreviews ? 50 : 0}
      minSize={panelMinSize}
      maxSize={hasPreviews ? 100 : 0}
      collapsible={!hasPreviews}
      className={classNames({
        'transition-theme border-t border-tk-elements-app-borderColor': hasEditor,
      })}
    >
      {immersivePreviewHost
        ? createPortal(
            <PreviewPanel
              ref={previewRef}
              embedIframes
              tutorialStore={tutorialStore}
              i18n={lesson.data.i18n as I18n}
              showToggleTerminal={false}
            />,
            immersivePreviewHost,
          )
        : null}
    </Panel>
  );
}

function TerminalSection({
  tutorialStore,
  theme,
  terminalPanelRef,
  terminalExpanded,
  hideTerminalPanel,
  immersiveTerminalHost,
  hasEditor,
  hasPreviews,
}: TerminalProps) {
  let id = 'terminal-closed';

  if (hideTerminalPanel) {
    id = 'terminal-none';
  } else if (!hasPreviews && !hasEditor) {
    id = 'terminal-full';
  } else if (!hasPreviews) {
    id = 'terminal-opened';
  }

  let defaultSize = 0;

  if (hideTerminalPanel) {
    defaultSize = 0;
  } else if (!hasPreviews && !hasEditor) {
    defaultSize = 100;
  } else if (!hasPreviews) {
    defaultSize = DEFAULT_TERMINAL_SIZE;
  }

  return (
    <Panel
      id={id}
      defaultSize={defaultSize}
      minSize={hideTerminalPanel ? 0 : 10}
      collapsible={hasPreviews}
      ref={terminalPanelRef}
      onExpand={() => {
        terminalExpanded.current = true;
      }}
      className={classNames('transition-theme bg-tk-elements-panel-backgroundColor text-tk-elements-panel-textColor', {
        'border-t border-tk-elements-app-borderColor': hasPreviews,
      })}
    >
      {immersiveTerminalHost
        ? createPortal(<TerminalPanel tutorialStore={tutorialStore} theme={theme} />, immersiveTerminalHost)
        : null}
    </Panel>
  );
}
