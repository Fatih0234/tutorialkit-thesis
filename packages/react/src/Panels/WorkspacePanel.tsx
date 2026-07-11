import { useStore } from '@nanostores/react';
import { normalizePath, type TutorialStore } from '@tutorialkit/runtime';
import type { I18n } from '@tutorialkit/types';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { DialogProvider } from '../core/Dialog.js';
import type { Theme } from '../core/types.js';
import resizePanelStyles from '../styles/resize-panel.module.css';
import { classNames } from '../utils/classnames.js';
import { EditorPanel } from './EditorPanel.js';
import { InteractiveImmersiveHeader } from './InteractiveImmersiveHeader.js';
import {
  InteractiveExperienceRoot,
  InteractiveManagementShell,
  InteractiveWorkspaceShell,
} from './InteractiveExperienceShells.js';
import { InteractiveMaterialPreparation } from './InteractiveMaterialPreparation.js';
import { InteractivePresentationLayer } from './InteractivePresentationLayer.js';
import { InteractiveRecordingStudio } from './InteractiveRecordingStudio.js';
import { InteractiveButton } from './InteractivePocUi.js';
import { InteractiveVideoControls } from './InteractiveVideoControls.js';
import { InteractiveWorkspaceSurface } from './InteractiveWorkspaceSurface.js';
import { isImmersiveInteractiveScreen } from './interactive-session.js';
import { InteractiveExperienceProvider, useInteractiveExperienceState } from './InteractiveExperienceState.js';
import {
  InteractivePocControls,
  type InteractiveProductTab,
  type InteractiveTeacherStage,
} from './InteractivePocControls.js';
import type { InteractiveRecordingMode } from './InteractiveTeacherDashboard.js';
import { PreviewPanel, type ImperativePreviewHandle } from './PreviewPanel.js';
import { TerminalPanel } from './TerminalPanel.js';
import { useInteractivePoc } from './useInteractivePoc.js';

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
  const hasPreviews = tutorialStore.hasPreviews();
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
  const [isClientReady, setIsClientReady] = useState(false);
  const [experienceMount, setExperienceMount] = useState<HTMLElement | null>(null);
  const editorPanelRef = useRef<ImperativePanelHandle>(null);
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
    storeRef,
  });

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

  function exitLearnerPlayer() {
    if (interactivePoc.controls.mode === 'learner-editing') {
      interactivePoc.controls.onResumeTeacher();

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
      await tutorialStore.addFile(value);
      interactivePoc.onFileCreated(value);
      return;
    }

    if (method === 'add' && type === 'folder') {
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
    localStorage.setItem(INTERACTIVE_WORKSPACE_LAYOUT_KEY, JSON.stringify({
      explanationOpen,
      terminalOpen,
      explanationSize,
      terminalSize,
    }));
  }, [explanationOpen, terminalOpen, explanationSize, terminalSize]);

  useEffect(() => {
    if (tutorialStore.hasSolution()) {
      setHelpAction('solve');
    } else {
      setHelpAction('reset');
    }
  }, [storeRef]);

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
      onOpenLearnerLesson={openLearnerLesson}
    />
  );

  const editor = (
    <div className="h-full min-h-0">
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
        allowEditPatterns={editorConfig.fileTree.allowEdits || undefined}
        selectedFile={selectedFile}
        onEditorScroll={interactivePoc.onEditorScroll}
        onEditorChange={interactivePoc.onEditorChange}
      />
    </div>
  );

  const editorSurface = (
    <InteractiveWorkspaceSurface
      explanationHtml={explanationHtml}
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
          audience={experience.screen === 'learner-player' ? 'learner' : 'teacher'}
          resources={interactivePoc.controls.presentationResources}
          layout={interactivePoc.controls.presentationLayout}
          hasLearnerOverride={interactivePoc.controls.hasLearnerPresentationOverride}
          explanationHtml={explanationHtml}
          canEditDeck={experience.screen === 'teacher-materials'}
          onModeChange={experience.screen === 'teacher-materials' || experience.screen === 'teacher-recording'
            ? interactivePoc.controls.onTeacherPresentationModeChange
            : interactivePoc.controls.onLearnerPresentationModeChange}
          onDeckAction={experience.screen === 'teacher-materials' || experience.screen === 'teacher-recording'
            ? interactivePoc.controls.onTeacherDeckAction
            : interactivePoc.controls.onLearnerDeckAction}
          onDeckChange={interactivePoc.controls.onUpdatePresentationDeck}
          onFollowTeacher={interactivePoc.controls.onFollowTeacherPresentation}
          onPreviewHostChange={onImmersivePreviewHostChange}
          cameraMediaUrl={interactivePoc.controls.mediaKind === 'webcam' ? interactivePoc.controls.mediaPreviewUrl : ''}
          onCameraMediaElementRef={interactivePoc.controls.onMediaElementRef}
        />
      }
    >
      {editor}
    </InteractiveWorkspaceSurface>
  );

  const editorExperience = (
    <InteractiveExperienceRoot screen={experience.screen} theme={theme} hydrated={isClientReady} mount={experienceMount}>
      <InteractiveManagementShell active={!isImmersiveExperience}>
        {managementControls}
      </InteractiveManagementShell>
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
        <InteractiveRecordingStudio model={interactivePoc.controls} lessonId={lesson.id} initialFile={initialFile} onStop={() => void stopConfiguredRecording()} />
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
          actions={interactivePoc.controls.recordingStorageSource === 'published' ? undefined : (
            <>
              <InteractiveButton icon="i-ph-floppy-disk" onClick={interactivePoc.controls.onSaveDraft} disabled={!interactivePoc.controls.canSaveDraft}>Save Draft</InteractiveButton>
              <InteractiveButton variant="primary" icon="i-ph-upload-simple" onClick={interactivePoc.controls.onPublishRecording} disabled={!interactivePoc.controls.canPublishRecording}>Publish</InteractiveButton>
            </>
          )}
        />
      ) : null}
      {experience.screen === 'learner-player' ? (
        <InteractiveImmersiveHeader
          eyebrow="Interactive lesson"
          title={lesson.id}
          status={interactivePoc.controls.mode === 'learner-editing' ? 'My Experiment' : 'Teacher Lecture'}
          statusTone={interactivePoc.controls.mode === 'learner-editing' ? 'warning' : 'positive'}
          currentTimeMs={interactivePoc.controls.playheadMs}
          onExit={exitLearnerPlayer}
          exitLabel="Lessons"
        />
      ) : null}
      {editorSurface}
      {experience.screen === 'teacher-review' ? (
        <InteractiveVideoControls
          audience="teacher"
          model={interactivePoc.controls}
          onPlay={interactivePoc.controls.playbackStatus === 'paused' ? interactivePoc.controls.onContinuePlayback : previewCurrentDraft}
          onPause={interactivePoc.controls.onPausePreviewPlayback}
        />
      ) : null}
      {experience.screen === 'learner-player' ? (
        <InteractiveVideoControls
          audience="learner"
          model={interactivePoc.controls}
          onPlay={interactivePoc.controls.playbackStatus === 'paused' ? interactivePoc.controls.onContinuePlayback : interactivePoc.controls.onPlayRecording}
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

  const toggleTerminal = useCallback(() => {
    if (terminalPanelRef.current?.isCollapsed()) {
      showTerminal();
    } else if (terminalPanelRef.current) {
      terminalPanelRef.current.collapse();
    }
  }, []);

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
