import { useStore } from '@nanostores/react';
import {
  TimelineRecorder,
  applyLearnerDelta,
  diffFiles,
  loadLatestLearnerDelta,
  loadLearnerDeltas,
  loadTeacherRecording,
  materializeTeacherState,
  normalizeFiles,
  normalizePath,
  saveLearnerDelta,
  saveTeacherRecording,
  simpleHashFiles,
  type EditorScrolledPayload,
  type FileChangedPayload,
  type FilesSnapshot,
  type LearnerDelta,
  type TeacherRecording,
  type TimelineEvent,
  type TutorialStore,
} from '@tutorialkit/runtime';
import type { I18n } from '@tutorialkit/types';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { DialogProvider } from '../core/Dialog.js';
import type { Theme } from '../core/types.js';
import resizePanelStyles from '../styles/resize-panel.module.css';
import { classNames } from '../utils/classnames.js';
import { EditorPanel } from './EditorPanel.js';
import { PreviewPanel, type ImperativePreviewHandle } from './PreviewPanel.js';
import { TerminalPanel } from './TerminalPanel.js';

const DEFAULT_TERMINAL_SIZE = 25;

type FileTreeChangeEvent = Parameters<NonNullable<ComponentProps<typeof EditorPanel>['onFileTreeChange']>>[0];
type EditorChangeUpdate = Parameters<NonNullable<ComponentProps<typeof EditorPanel>['onEditorChange']>>[0];
type EditorScrollPosition = Parameters<NonNullable<ComponentProps<typeof EditorPanel>['onEditorScroll']>>[0];
type InteractiveMode = 'teacher-playback' | 'learner-editing' | 'idle';
type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'finished' | 'missing-recording';

const PLAYBACK_GUARD_RELEASE_DELAY_MS = 250;

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

  return (
    <PanelGroup className={resizePanelStyles.PanelGroup} id="right-panel-group" direction="vertical">
      <DialogProvider value={dialog}>
        <EditorSection
          theme={theme}
          tutorialStore={tutorialStore}
          hasEditor={hasEditor}
          hasPreviews={hasPreviews}
          hideTerminalPanel={hideTerminalPanel}
        />
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
        hasEditor={hasEditor}
        hasPreviews={hasPreviews}
      />
    </PanelGroup>
  );
}

function EditorSection({ theme, tutorialStore, hasEditor }: PanelProps) {
  const [helpAction, setHelpAction] = useState<'solve' | 'reset'>('reset');
  const selectedFile = useStore(tutorialStore.selectedFile);
  const currentDocument = useStore(tutorialStore.currentDocument);
  const lessonFullyLoaded = useStore(tutorialStore.lessonFullyLoaded);
  const editorConfig = useStore(tutorialStore.editorConfig);
  const storeRef = useStore(tutorialStore.ref);
  const files = useStore(tutorialStore.files);
  const recorderRef = useRef<TimelineRecorder | null>(null);
  const playbackTimersRef = useRef<number[]>([]);
  const playbackRecordingRef = useRef<TeacherRecording | null>(null);
  const isApplyingPlaybackRef = useRef(false);
  const playbackGuardTokenRef = useRef(0);
  const modeRef = useRef<InteractiveMode>('idle');
  const playheadMsRef = useRef(0);
  const pausedTeacherTimestampMsRef = useRef(0);
  const playbackStartedAtRef = useRef(0);
  const playbackStartTimestampMsRef = useRef(0);
  const [isRecording, setIsRecording] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<InteractiveMode>('idle');
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('idle');
  const [playheadMs, setPlayheadMs] = useState(0);
  const [pausedTeacherTimestampMs, setPausedTeacherTimestampMs] = useState(0);
  const [hasPausedTeacherTimestamp, setHasPausedTeacherTimestamp] = useState(false);
  const [hasTeacherRecording, setHasTeacherRecording] = useState(false);
  const [hasRestorableLearnerDelta, setHasRestorableLearnerDelta] = useState(false);
  const [learnerDeltaCount, setLearnerDeltaCount] = useState(0);
  const [learnerDeltaStatus, setLearnerDeltaStatus] = useState('idle');

  const lesson = tutorialStore.lesson!;

  function getCurrentFilePath() {
    return selectedFile ?? tutorialStore.currentDocument.get()?.filePath;
  }

  function syncEventCount() {
    setEventCount(recorderRef.current?.getRecording()?.events.length ?? 0);
  }

  function getLatestMatchingLearnerDelta(recording = loadTeacherRecording()) {
    const delta = loadLatestLearnerDelta();

    if (!recording || !delta) {
      return undefined;
    }

    if (
      delta.teacherRecordingId !== recording.id ||
      delta.teacherRecordingVersion !== recording.version ||
      simpleHashFiles(materializeTeacherState(recording, delta.teacherTimestampMs)) !== delta.baseTeacherFilesHash
    ) {
      return undefined;
    }

    return delta;
  }

  function syncLearnerDeltaCount() {
    const recording = loadTeacherRecording();

    setHasTeacherRecording(Boolean(recording));
    setLearnerDeltaCount(loadLearnerDeltas().length);
    setHasRestorableLearnerDelta(Boolean(getLatestMatchingLearnerDelta(recording)));
  }

  function createLearnerDeltaId() {
    return `learner-delta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function getCurrentLearnerFiles() {
    const snapshotFiles = normalizeFiles(tutorialStore.takeSnapshot().files);

    for (const [filePath, document] of Object.entries(tutorialStore.documents.get())) {
      if (document && !document.loading && document.type === 'file' && typeof document.value === 'string') {
        snapshotFiles[normalizePath(filePath)] = document.value;
      }
    }

    return snapshotFiles;
  }

  function getClockNowMs() {
    return globalThis.performance?.now?.() ?? Date.now();
  }

  function setInteractiveMode(nextMode: InteractiveMode) {
    modeRef.current = nextMode;
    setMode(nextMode);
  }

  function setPlaybackTimestampMs(nextPlayheadMs: number) {
    const normalizedMs = Math.max(0, Math.round(nextPlayheadMs));

    playheadMsRef.current = normalizedMs;
    setPlayheadMs(normalizedMs);
  }

  function setPausedTimestampMs(nextPausedTimestampMs: number) {
    const normalizedMs = Math.max(0, Math.round(nextPausedTimestampMs));

    pausedTeacherTimestampMsRef.current = normalizedMs;
    setPausedTeacherTimestampMs(normalizedMs);
  }

  function clearPlaybackTimers() {
    for (const timer of playbackTimersRef.current) {
      window.clearTimeout(timer);
    }

    playbackTimersRef.current = [];
  }

  function startPlaybackGuard() {
    playbackGuardTokenRef.current += 1;
    isApplyingPlaybackRef.current = true;
  }

  function releasePlaybackGuardSoon() {
    const token = playbackGuardTokenRef.current;

    window.setTimeout(() => {
      if (playbackGuardTokenRef.current === token) {
        isApplyingPlaybackRef.current = false;
      }
    }, PLAYBACK_GUARD_RELEASE_DELAY_MS);
  }

  function stopPlayback(status: PlaybackStatus, nextMode: InteractiveMode = 'idle') {
    clearPlaybackTimers();
    playbackStartedAtRef.current = 0;
    playbackStartTimestampMsRef.current = playheadMsRef.current;
    setIsPlaying(false);
    setPlaybackStatus(status);
    setInteractiveMode(nextMode);
    releasePlaybackGuardSoon();
  }

  function getCurrentPlaybackTimestampMs() {
    if (modeRef.current !== 'teacher-playback' || playbackStartedAtRef.current === 0) {
      return playheadMsRef.current;
    }

    return Math.max(
      playheadMsRef.current,
      playbackStartTimestampMsRef.current + getClockNowMs() - playbackStartedAtRef.current,
    );
  }

  function getSortedPlaybackEvents(recording: TeacherRecording): TimelineEvent[] {
    return [...recording.events].sort((a, b) => {
      if (a.tMs !== b.tMs) {
        return a.tMs - b.tMs;
      }

      return a.seq - b.seq;
    });
  }

  function applyRecordingBaseFiles(recording: TeacherRecording) {
    tutorialStore.reset();

    const existingFilePaths = new Set(tutorialStore.files.get().map((file) => normalizePath(file.path)));
    const baseFiles: FilesSnapshot = normalizeFiles(recording.baseFiles);

    for (const [filePath, content] of Object.entries(baseFiles)) {
      if (existingFilePaths.has(filePath)) {
        tutorialStore.updateFile(filePath, content);
      }
    }
  }

  function applyPlaybackEvent(event: TimelineEvent) {
    setPlaybackTimestampMs(event.tMs);

    if (event.type === 'file.opened') {
      const payload = event.payload as { filePath?: string } | undefined;
      const filePath = event.filePath ?? payload?.filePath;

      if (filePath) {
        tutorialStore.setSelectedFile(normalizePath(filePath));
      }

      return;
    }

    if (event.type === 'file.changed') {
      const payload = event.payload as FileChangedPayload | undefined;

      if (event.filePath && typeof payload?.content === 'string') {
        tutorialStore.updateFile(normalizePath(event.filePath), payload.content);
      }

      return;
    }

    if (event.type === 'editor.scrolled') {
      const payload = event.payload as EditorScrolledPayload | undefined;

      if (event.filePath) {
        tutorialStore.setSelectedFile(normalizePath(event.filePath));
      }

      if (typeof payload?.top === 'number' && typeof payload?.left === 'number') {
        tutorialStore.setCurrentDocumentScrollPosition({ top: payload.top, left: payload.left });
      }
    }
  }

  function playRecordingFrom(startMs: number, { resetToBase }: { resetToBase: boolean }) {
    const recording = playbackRecordingRef.current ?? loadTeacherRecording();

    clearPlaybackTimers();

    if (!recording) {
      playbackRecordingRef.current = null;
      setIsPlaying(false);
      setInteractiveMode('idle');
      setPlaybackStatus('missing-recording');
      setPlaybackTimestampMs(0);
      return;
    }

    playbackRecordingRef.current = recording;
    startPlaybackGuard();
    setIsPlaying(true);
    setInteractiveMode('teacher-playback');
    setPlaybackStatus('playing');
    setPlaybackTimestampMs(startMs);
    playbackStartTimestampMsRef.current = Math.max(0, Math.round(startMs));
    playbackStartedAtRef.current = getClockNowMs();

    if (resetToBase) {
      applyRecordingBaseFiles(recording);
    }

    const events = getSortedPlaybackEvents(recording).filter((event) => event.tMs > startMs);

    if (events.length === 0) {
      stopPlayback('finished');
      return;
    }

    playbackTimersRef.current = events.map((event, index) =>
      window.setTimeout(
        () => {
          if (modeRef.current !== 'teacher-playback') {
            return;
          }

          isApplyingPlaybackRef.current = true;
          applyPlaybackEvent(event);

          if (index === events.length - 1) {
            stopPlayback('finished');
          }
        },
        Math.max(0, event.tMs - startMs),
      ),
    );
  }

  function onPlayRecording() {
    const recording = loadTeacherRecording() ?? null;

    playbackRecordingRef.current = recording;
    setHasTeacherRecording(Boolean(recording));
    setHasPausedTeacherTimestamp(false);
    setPausedTimestampMs(0);
    playRecordingFrom(-1, { resetToBase: true });
  }

  function onPausePlayback() {
    if (!isPlaying) {
      return;
    }

    const pausedMs = getCurrentPlaybackTimestampMs();

    setPlaybackTimestampMs(pausedMs);
    setPausedTimestampMs(pausedMs);
    setHasPausedTeacherTimestamp(true);
    stopPlayback('paused', 'learner-editing');
  }

  function onResumeTeacher() {
    if (modeRef.current !== 'learner-editing') {
      return;
    }

    playRecordingFrom(pausedTeacherTimestampMsRef.current, { resetToBase: false });
  }

  function onStartRecording() {
    if (!lessonFullyLoaded || modeRef.current !== 'idle') {
      return;
    }

    const baseFiles: FilesSnapshot = normalizeFiles(tutorialStore.takeSnapshot().files);
    const recorder = new TimelineRecorder();
    const recording = recorder.start({ lessonId: lesson.id, version: 1, baseFiles });

    recorderRef.current = recorder;
    setIsRecording(true);
    setEventCount(recording.events.length);
  }

  function onStopRecording() {
    const stopped = recorderRef.current?.stop();

    if (!stopped) {
      setIsRecording(false);
      return;
    }

    saveTeacherRecording(stopped);
    setHasTeacherRecording(true);
    setIsRecording(false);
    setEventCount(stopped.events.length);
    syncLearnerDeltaCount();
  }

  function onSaveLearnerDelta() {
    if (modeRef.current !== 'learner-editing' || !hasPausedTeacherTimestamp) {
      return;
    }

    const recording = loadTeacherRecording();

    setHasTeacherRecording(Boolean(recording));

    if (!recording) {
      return;
    }

    const teacherTimestampMs = pausedTeacherTimestampMsRef.current;
    const baseTeacherFiles = normalizeFiles(materializeTeacherState(recording, teacherTimestampMs));
    const learnerFiles = getCurrentLearnerFiles();
    const { addedOrModified, removed } = diffFiles(baseTeacherFiles, learnerFiles);
    const selectedFilePath = getCurrentFilePath();
    const delta: LearnerDelta = {
      id: createLearnerDeltaId(),
      userId: 'local-poc-user',
      lessonId: recording.lessonId || lesson.id,
      teacherRecordingId: recording.id,
      teacherRecordingVersion: recording.version,
      teacherTimestampMs,
      baseTeacherFilesHash: simpleHashFiles(baseTeacherFiles),
      addedOrModified,
      removed,
      selectedFile: selectedFilePath ? normalizePath(selectedFilePath) : undefined,
      createdAt: new Date().toISOString(),
    };

    saveLearnerDelta(delta);
    setLearnerDeltaStatus('saved');
    syncLearnerDeltaCount();
  }

  function onRestoreLearnerDelta() {
    const recording = loadTeacherRecording();
    const delta = getLatestMatchingLearnerDelta(recording);

    if (!recording || !delta) {
      setLearnerDeltaStatus('missing matching delta');
      syncLearnerDeltaCount();
      return;
    }

    const baseTeacherFiles = normalizeFiles(materializeTeacherState(recording, delta.teacherTimestampMs));
    const restoredFiles = applyLearnerDelta(baseTeacherFiles, delta);
    const existingFilePaths = new Set(tutorialStore.files.get().map((file) => normalizePath(file.path)));

    startPlaybackGuard();

    try {
      for (const [filePath, content] of Object.entries(restoredFiles)) {
        const normalizedFilePath = normalizePath(filePath);

        if (existingFilePaths.has(normalizedFilePath)) {
          tutorialStore.updateFile(normalizedFilePath, content);
        }
      }

      if (delta.selectedFile) {
        const selectedFilePath = normalizePath(delta.selectedFile);

        if (existingFilePaths.has(selectedFilePath)) {
          tutorialStore.setSelectedFile(selectedFilePath);
        }
      }

      setLearnerDeltaStatus('restored');
    } finally {
      releasePlaybackGuardSoon();
      syncLearnerDeltaCount();
    }
  }

  function onFileSelect(filePath: string | undefined) {
    tutorialStore.setSelectedFile(filePath);

    if (!filePath || modeRef.current !== 'idle' || isApplyingPlaybackRef.current || !recorderRef.current?.isRecording()) {
      return;
    }

    recorderRef.current.recordFileOpened(filePath);
    syncEventCount();
  }

  function onEditorScroll(position: EditorScrollPosition) {
    tutorialStore.setCurrentDocumentScrollPosition(position);

    const filePath = getCurrentFilePath();

    if (!filePath || modeRef.current !== 'idle' || isApplyingPlaybackRef.current || !recorderRef.current?.isRecording()) {
      return;
    }

    recorderRef.current.append('editor.scrolled', {
      filePath,
      payload: { top: position.top, left: position.left },
    });
    syncEventCount();
  }

  function onEditorChange(update: EditorChangeUpdate) {
    if (typeof update.content !== 'string') {
      return;
    }

    tutorialStore.setCurrentDocumentContent(update.content);

    const filePath = getCurrentFilePath();

    if (!filePath || modeRef.current !== 'idle' || isApplyingPlaybackRef.current || !recorderRef.current?.isRecording()) {
      return;
    }

    recorderRef.current.recordFileChanged(filePath, { content: update.content, selection: update.selection });
    syncEventCount();
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

  async function onFileTreeChange({ method, type, value }: FileTreeChangeEvent) {
    if (method === 'add' && type === 'file') {
      return tutorialStore.addFile(value);
    }

    if (method === 'add' && type === 'folder') {
      return tutorialStore.addFolder(value);
    }
  }

  useEffect(() => {
    if (tutorialStore.hasSolution()) {
      setHelpAction('solve');
    } else {
      setHelpAction('reset');
    }

    setHasTeacherRecording(Boolean(loadTeacherRecording()));
    syncLearnerDeltaCount();
  }, [storeRef]);

  useEffect(() => {
    return () => {
      clearPlaybackTimers();
      isApplyingPlaybackRef.current = false;
      modeRef.current = 'idle';
    };
  }, []);

  const canSaveLearnerDelta = mode === 'learner-editing' && hasTeacherRecording && hasPausedTeacherTimestamp;
  const canRestoreLearnerDelta = hasRestorableLearnerDelta && !isRecording && mode !== 'teacher-playback';

  return (
    <Panel
      id={hasEditor ? 'editor-opened' : 'editor-closed'}
      defaultSize={hasEditor ? 50 : 0}
      minSize={10}
      maxSize={hasEditor ? 100 : 0}
      collapsible={!hasEditor}
      className="transition-theme bg-tk-elements-panel-backgroundColor text-tk-elements-panel-textColor"
    >
      <div
        aria-label="Interactive timeline debug controls"
        style={{
          alignItems: 'center',
          borderBottom: '1px solid var(--tk-elements-panel-borderColor)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          padding: '0.5rem',
        }}
      >
        <button
          type="button"
          onClick={onStartRecording}
          disabled={isRecording || mode !== 'idle' || !lessonFullyLoaded}
        >
          Start Recording
        </button>
        <button type="button" onClick={onStopRecording} disabled={!isRecording}>
          Stop Recording
        </button>
        <button
          type="button"
          onClick={onPlayRecording}
          disabled={isRecording || mode !== 'idle' || !lessonFullyLoaded}
        >
          Play Recording
        </button>
        <button type="button" onClick={onPausePlayback} disabled={!isPlaying}>
          Pause & Try It
        </button>
        <button type="button" onClick={onResumeTeacher} disabled={mode !== 'learner-editing'}>
          Resume Teacher
        </button>
        <button type="button" onClick={onSaveLearnerDelta} disabled={!canSaveLearnerDelta}>
          Save Learner Delta
        </button>
        <button type="button" onClick={onRestoreLearnerDelta} disabled={!canRestoreLearnerDelta}>
          Restore Learner Delta
        </button>
        <span>Mode: {mode}</span>
        <span>Recording status: {isRecording ? 'active' : 'inactive'}</span>
        <span>Event count: {eventCount}</span>
        <span>Playback status: {playbackStatus}</span>
        <span>Playhead ms: {playheadMs}</span>
        <span>Paused teacher timestamp ms: {pausedTeacherTimestampMs}</span>
        <span>Learner delta count: {learnerDeltaCount}</span>
        <span>Learner delta status: {learnerDeltaStatus}</span>
      </div>
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
        onFileSelect={onFileSelect}
        onFileTreeChange={onFileTreeChange}
        allowEditPatterns={editorConfig.fileTree.allowEdits || undefined}
        selectedFile={selectedFile}
        onEditorScroll={onEditorScroll}
        onEditorChange={onEditorChange}
      />
    </Panel>
  );
}

function PreviewsSection({
  tutorialStore,
  terminalPanelRef,
  terminalExpanded,
  hideTerminalPanel,
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
      <PreviewPanel
        ref={previewRef}
        tutorialStore={tutorialStore}
        i18n={lesson.data.i18n as I18n}
        showToggleTerminal={!hideTerminalPanel}
        toggleTerminal={toggleTerminal}
      />
    </Panel>
  );
}

function TerminalSection({
  tutorialStore,
  theme,
  terminalPanelRef,
  terminalExpanded,
  hideTerminalPanel,
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
      <TerminalPanel tutorialStore={tutorialStore} theme={theme} />
    </Panel>
  );
}
