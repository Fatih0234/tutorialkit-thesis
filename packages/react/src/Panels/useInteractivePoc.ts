import {
  LocalStorageInteractiveTimelineStorage,
  TimelinePlaybackClock,
  TimelineRecorder,
  applyLearnerDelta,
  diffFiles,
  getLearnerDeltaConflicts,
  materializeTeacherState,
  normalizeFiles,
  normalizePath,
  simpleHashFiles,
  type EditorScrolledPayload,
  type FileChangedPayload,
  type FilesSnapshot,
  type InteractiveTimelineStorage,
  type LearnerDelta,
  type TeacherRecording,
  type TimelineEvent,
  type TutorialStore,
} from '@tutorialkit/runtime';
import { useEffect, useRef, useState } from 'react';

export type InteractiveMode = 'teacher-playback' | 'learner-editing' | 'idle';
export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'finished' | 'missing-recording';

interface EditorChangeUpdate {
  content: string;
  selection?: unknown;
}

interface EditorScrollPosition {
  top: number;
  left: number;
}

export interface InteractivePocControlsModel {
  isRecording: boolean;
  isPlaying: boolean;
  mode: InteractiveMode;
  playbackStatus: PlaybackStatus;
  eventCount: number;
  playheadMs: number;
  pausedTeacherTimestampMs: number;
  learnerDeltaCount: number;
  learnerDeltaStatus: string;
  conflictStatus: 'none' | 'conflict';
  conflictedFiles: string[];
  canStartRecording: boolean;
  canStopRecording: boolean;
  canPlayRecording: boolean;
  canPausePlayback: boolean;
  canResumeTeacher: boolean;
  canSaveLearnerDelta: boolean;
  canRestoreLearnerDelta: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPlayRecording: () => void;
  onPausePlayback: () => void;
  onResumeTeacher: () => void;
  onSaveLearnerDelta: () => void;
  onRestoreLearnerDelta: () => void;
}

export interface UseInteractivePocOptions {
  tutorialStore: TutorialStore;
  lessonId: string;
  selectedFile: string | undefined;
  lessonFullyLoaded: boolean;
  storeRef: unknown;
}

export interface UseInteractivePocResult {
  controls: InteractivePocControlsModel;
  onFileSelect: (filePath: string | undefined) => void;
  onEditorScroll: (position: EditorScrollPosition) => void;
  onEditorChange: (update: EditorChangeUpdate) => void;
}

const PLAYBACK_GUARD_RELEASE_DELAY_MS = 250;
const interactiveTimelineStorage: InteractiveTimelineStorage = new LocalStorageInteractiveTimelineStorage();

export function useInteractivePoc({
  tutorialStore,
  lessonId,
  selectedFile,
  lessonFullyLoaded,
  storeRef,
}: UseInteractivePocOptions): UseInteractivePocResult {
  const recorderRef = useRef<TimelineRecorder | null>(null);
  const playbackClockRef = useRef<TimelinePlaybackClock | null>(null);
  const playbackRecordingRef = useRef<TeacherRecording | null>(null);
  const playbackEventsRef = useRef<TimelineEvent[]>([]);
  const nextPlaybackEventIndexRef = useRef(0);
  const isApplyingPlaybackRef = useRef(false);
  const playbackGuardTokenRef = useRef(0);
  const modeRef = useRef<InteractiveMode>('idle');
  const playheadMsRef = useRef(0);
  const pausedTeacherTimestampMsRef = useRef(0);
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
  const [conflictedFiles, setConflictedFiles] = useState<string[]>([]);

  function getCurrentFilePath() {
    return selectedFile ?? tutorialStore.currentDocument.get()?.filePath;
  }

  function syncEventCount() {
    setEventCount(recorderRef.current?.getRecording()?.events.length ?? 0);
  }

  function getLatestMatchingLearnerDelta(recording = interactiveTimelineStorage.loadTeacherRecording()) {
    const delta = interactiveTimelineStorage.loadLatestLearnerDelta();

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

  function syncLearnerDeltaState(recording = interactiveTimelineStorage.loadTeacherRecording()) {
    const matchingDelta = getLatestMatchingLearnerDelta(recording);

    setHasTeacherRecording(Boolean(recording));
    setLearnerDeltaCount(interactiveTimelineStorage.loadLearnerDeltas().length);
    setHasRestorableLearnerDelta(Boolean(matchingDelta));
    setConflictedFiles(recording && matchingDelta ? getLearnerDeltaConflicts(recording, matchingDelta).filePaths : []);
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

  function stopPlaybackClock() {
    playbackClockRef.current?.stop();
    playbackClockRef.current = null;
    playbackEventsRef.current = [];
    nextPlaybackEventIndexRef.current = 0;
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
    stopPlaybackClock();
    setIsPlaying(false);
    setPlaybackStatus(status);
    setInteractiveMode(nextMode);
    releasePlaybackGuardSoon();
  }

  function getCurrentPlaybackTimestampMs() {
    return playbackClockRef.current?.currentTimeMs ?? playheadMsRef.current;
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

  function applyDuePlaybackEvents(currentTimeMs: number) {
    setPlaybackTimestampMs(currentTimeMs);

    const events = playbackEventsRef.current;

    while (nextPlaybackEventIndexRef.current < events.length) {
      const event = events[nextPlaybackEventIndexRef.current];

      if (!event || event.tMs > currentTimeMs) {
        break;
      }

      if (modeRef.current !== 'teacher-playback') {
        return;
      }

      isApplyingPlaybackRef.current = true;
      applyPlaybackEvent(event);
      nextPlaybackEventIndexRef.current += 1;
    }

    setPlaybackTimestampMs(currentTimeMs);
  }

  function getPlaybackEndMs(events: TimelineEvent[]) {
    return events.at(-1)?.tMs ?? 0;
  }

  function playRecordingFrom(startMs: number, { resetToBase }: { resetToBase: boolean }) {
    const recording = playbackRecordingRef.current ?? interactiveTimelineStorage.loadTeacherRecording();

    stopPlaybackClock();

    if (!recording) {
      playbackRecordingRef.current = null;
      setIsPlaying(false);
      setInteractiveMode('idle');
      setPlaybackStatus('missing-recording');
      setPlaybackTimestampMs(0);
      return;
    }

    playbackRecordingRef.current = recording;
    playbackEventsRef.current = getSortedPlaybackEvents(recording);
    nextPlaybackEventIndexRef.current = playbackEventsRef.current.findIndex((event) => event.tMs > startMs);

    if (nextPlaybackEventIndexRef.current === -1) {
      nextPlaybackEventIndexRef.current = playbackEventsRef.current.length;
    }

    startPlaybackGuard();
    setIsPlaying(true);
    setInteractiveMode('teacher-playback');
    setPlaybackStatus('playing');
    setPlaybackTimestampMs(startMs);

    if (resetToBase) {
      applyRecordingBaseFiles(recording);
    }

    const playbackEndMs = getPlaybackEndMs(playbackEventsRef.current);

    if (nextPlaybackEventIndexRef.current >= playbackEventsRef.current.length || startMs >= playbackEndMs) {
      stopPlayback('finished');
      return;
    }

    const clock = new TimelinePlaybackClock({
      endTimeMs: playbackEndMs,
      onTick: applyDuePlaybackEvents,
      onFinish: () => stopPlayback('finished'),
    });

    playbackClockRef.current = clock;
    clock.playFrom(startMs);
  }

  function onPlayRecording() {
    const recording = interactiveTimelineStorage.loadTeacherRecording() ?? null;

    playbackRecordingRef.current = recording;
    syncLearnerDeltaState(recording ?? undefined);
    setHasPausedTeacherTimestamp(false);
    setPausedTimestampMs(0);
    playRecordingFrom(-1, { resetToBase: true });
  }

  function onPausePlayback() {
    if (!isPlaying) {
      return;
    }

    playbackClockRef.current?.pause();

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
    const recording = recorder.start({ lessonId, version: 1, baseFiles });

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

    interactiveTimelineStorage.saveTeacherRecording(stopped);
    setIsRecording(false);
    setEventCount(stopped.events.length);
    syncLearnerDeltaState(stopped);
  }

  function onSaveLearnerDelta() {
    if (modeRef.current !== 'learner-editing' || !hasPausedTeacherTimestamp) {
      return;
    }

    const recording = interactiveTimelineStorage.loadTeacherRecording();

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
      lessonId: recording.lessonId || lessonId,
      teacherRecordingId: recording.id,
      teacherRecordingVersion: recording.version,
      teacherTimestampMs,
      baseTeacherFilesHash: simpleHashFiles(baseTeacherFiles),
      addedOrModified,
      removed,
      selectedFile: selectedFilePath ? normalizePath(selectedFilePath) : undefined,
      createdAt: new Date().toISOString(),
    };

    interactiveTimelineStorage.saveLearnerDelta(delta);
    setLearnerDeltaStatus('saved');
    syncLearnerDeltaState(recording);
  }

  function onRestoreLearnerDelta() {
    const recording = interactiveTimelineStorage.loadTeacherRecording();
    const delta = getLatestMatchingLearnerDelta(recording);

    if (!recording || !delta) {
      setLearnerDeltaStatus('missing matching delta');
      syncLearnerDeltaState(recording);
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
      syncLearnerDeltaState(recording);
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

  useEffect(() => {
    syncLearnerDeltaState();
  }, [storeRef]);

  useEffect(() => {
    return () => {
      stopPlaybackClock();
      isApplyingPlaybackRef.current = false;
      modeRef.current = 'idle';
    };
  }, []);

  const canSaveLearnerDelta = mode === 'learner-editing' && hasTeacherRecording && hasPausedTeacherTimestamp;
  const canRestoreLearnerDelta = hasRestorableLearnerDelta && !isRecording && mode !== 'teacher-playback';

  return {
    controls: {
      isRecording,
      isPlaying,
      mode,
      playbackStatus,
      eventCount,
      playheadMs,
      pausedTeacherTimestampMs,
      learnerDeltaCount,
      learnerDeltaStatus,
      conflictStatus: conflictedFiles.length > 0 ? 'conflict' : 'none',
      conflictedFiles,
      canStartRecording: !isRecording && mode === 'idle' && lessonFullyLoaded,
      canStopRecording: isRecording,
      canPlayRecording: !isRecording && mode === 'idle' && lessonFullyLoaded,
      canPausePlayback: isPlaying,
      canResumeTeacher: mode === 'learner-editing',
      canSaveLearnerDelta,
      canRestoreLearnerDelta,
      onStartRecording,
      onStopRecording,
      onPlayRecording,
      onPausePlayback,
      onResumeTeacher,
      onSaveLearnerDelta,
      onRestoreLearnerDelta,
    },
    onFileSelect,
    onEditorScroll,
    onEditorChange,
  };
}
