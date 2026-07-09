import {
  IndexedDBInteractiveTimelineStorage,
  InteractiveMediaRecorder,
  TimelinePlaybackClock,
  TimelineRecorder,
  applyLearnerDelta,
  diffFiles,
  getLearnerDeltaConflicts,
  getRecordingMediaAssetMetadata,
  materializeTeacherState,
  normalizeFiles,
  normalizePath,
  simpleHashFiles,
  type EditorScrolledPayload,
  type FileChangedPayload,
  type FilesSnapshot,
  type InteractiveTimelineStorage,
  type LearnerDelta,
  type RecordingMediaAsset,
  type RecordingMediaKind,
  type TeacherRecording,
  type TimelineEvent,
  type TutorialStore,
} from '@tutorialkit/runtime';
import { useEffect, useRef, useState } from 'react';

export type InteractiveMode = 'teacher-playback' | 'learner-editing' | 'idle';
export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'finished' | 'missing-recording';
export type DraftStatus = 'unsaved' | 'saved' | 'loaded' | 'discarded' | 'missing';
export type MediaStatus = 'unavailable' | 'permission-needed' | 'recording' | 'saved' | 'loaded' | 'error';
export type MediaKindStatus = 'none' | RecordingMediaKind;

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
  draftStatus: DraftStatus;
  currentDraftId: string;
  recordingDurationMs: number;
  mediaStatus: MediaStatus;
  mediaKind: MediaKindStatus;
  mediaDurationMs: number;
  mediaError: string;
  mediaPreviewUrl: string;
  mediaMimeType: string;
  canStartRecording: boolean;
  canStartMediaRecording: boolean;
  canStopRecording: boolean;
  canSaveDraft: boolean;
  canLoadDraft: boolean;
  canPreviewDraft: boolean;
  canDiscardDraft: boolean;
  canPlayRecording: boolean;
  canPausePlayback: boolean;
  canResumeTeacher: boolean;
  canSaveLearnerDelta: boolean;
  canRestoreLearnerDelta: boolean;
  onStartRecording: () => void;
  onStartMicRecording: () => void;
  onStartCameraRecording: () => void;
  onStopRecording: () => void;
  onSaveDraft: () => void;
  onLoadDraft: () => void;
  onPreviewDraft: () => void;
  onDiscardDraft: () => void;
  onPlayRecording: () => void;
  onPausePlayback: () => void;
  onResumeTeacher: () => void;
  onSaveLearnerDelta: () => void;
  onRestoreLearnerDelta: () => void;
  onMediaElementRef: (element: HTMLMediaElement | null) => void;
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
const FAKE_MEDIA_RECORDER_KEY = 'interactive-poc.fakeMediaRecorder';
const interactiveTimelineStorage: InteractiveTimelineStorage = new IndexedDBInteractiveTimelineStorage();

function isFakeMediaRecorderEnabled(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(FAKE_MEDIA_RECORDER_KEY) === 'true';
  } catch {
    return false;
  }
}

function canUseMediaRecorder(): boolean {
  return (
    isFakeMediaRecorderEnabled() ||
    (typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof globalThis.MediaRecorder !== 'undefined')
  );
}

function getInitialMediaStatus(): MediaStatus {
  return canUseMediaRecorder() ? 'permission-needed' : 'unavailable';
}

export function useInteractivePoc({
  tutorialStore,
  lessonId,
  selectedFile,
  lessonFullyLoaded,
  storeRef,
}: UseInteractivePocOptions): UseInteractivePocResult {
  const recorderRef = useRef<TimelineRecorder | null>(null);
  const mediaRecorderRef = useRef<InteractiveMediaRecorder | null>(null);
  const currentDraftRecordingRef = useRef<TeacherRecording | null>(null);
  const currentMediaAssetsRef = useRef<RecordingMediaAsset[]>([]);
  const playbackClockRef = useRef<TimelinePlaybackClock | null>(null);
  const playbackRecordingRef = useRef<TeacherRecording | null>(null);
  const playbackEventsRef = useRef<TimelineEvent[]>([]);
  const playbackMediaAssetRef = useRef<RecordingMediaAsset | null>(null);
  const nextPlaybackEventIndexRef = useRef(0);
  const isApplyingPlaybackRef = useRef(false);
  const playbackGuardTokenRef = useRef(0);
  const modeRef = useRef<InteractiveMode>('idle');
  const playheadMsRef = useRef(0);
  const pausedTeacherTimestampMsRef = useRef(0);
  const visibleMediaElementRef = useRef<HTMLMediaElement | null>(null);
  const hiddenMediaElementRef = useRef<HTMLMediaElement | null>(null);
  const mediaPlaybackFrameIdRef = useRef<number | undefined>(undefined);
  const mediaObjectUrlRef = useRef('');
  const mediaKindRef = useRef<MediaKindStatus>('none');
  const mediaPlaybackEndMsRef = useRef(0);
  const playbackUsesMediaRef = useRef(false);
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
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('missing');
  const [currentDraftId, setCurrentDraftId] = useState('none');
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [mediaStatus, setMediaStatus] = useState<MediaStatus>(getInitialMediaStatus);
  const [mediaKind, setMediaKind] = useState<MediaKindStatus>('none');
  const [mediaDurationMs, setMediaDurationMs] = useState(0);
  const [mediaError, setMediaError] = useState('none');
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [mediaMimeType, setMediaMimeType] = useState('');

  function getCurrentFilePath() {
    return selectedFile ?? tutorialStore.currentDocument.get()?.filePath;
  }

  function syncEventCount() {
    setEventCount(recorderRef.current?.getRecording()?.events.length ?? currentDraftRecordingRef.current?.events.length ?? 0);
  }

  function setCurrentDraftRecording(recording: TeacherRecording | null, status: DraftStatus) {
    currentDraftRecordingRef.current = recording;
    setDraftStatus(status);
    setCurrentDraftId(recording?.id ?? 'none');
    setRecordingDurationMs(recording?.durationMs ?? 0);
    setEventCount(recording?.events.length ?? 0);
  }

  function revokeCurrentMediaObjectUrl() {
    if (mediaObjectUrlRef.current) {
      URL.revokeObjectURL(mediaObjectUrlRef.current);
      mediaObjectUrlRef.current = '';
    }
  }

  function setNoMedia(status: MediaStatus = getInitialMediaStatus(), error = 'none') {
    currentMediaAssetsRef.current = [];
    playbackMediaAssetRef.current = null;
    mediaKindRef.current = 'none';
    revokeCurrentMediaObjectUrl();
    setMediaKind('none');
    setMediaDurationMs(0);
    setMediaMimeType('');
    setMediaPreviewUrl('');
    setMediaStatus(status);
    setMediaError(error);
  }

  function setCurrentMediaAssets(assets: RecordingMediaAsset[], status: MediaStatus, error = 'none') {
    currentMediaAssetsRef.current = assets;

    const [asset] = assets;

    playbackMediaAssetRef.current = asset?.blob ? asset : null;
    mediaKindRef.current = asset?.kind ?? 'none';
    revokeCurrentMediaObjectUrl();

    if (asset?.blob) {
      const objectUrl = URL.createObjectURL(asset.blob);

      mediaObjectUrlRef.current = objectUrl;
      setMediaPreviewUrl(objectUrl);
    } else {
      setMediaPreviewUrl('');
    }

    setMediaKind(asset?.kind ?? 'none');
    setMediaDurationMs(asset?.durationMs ?? 0);
    setMediaMimeType(asset?.mimeType ?? '');
    setMediaStatus(status);
    setMediaError(error);
  }

  function getRecordingWithMediaMetadata(recording: TeacherRecording, assets: RecordingMediaAsset[]): TeacherRecording {
    const mediaAssets = assets.map(getRecordingMediaAssetMetadata);

    if (mediaAssets.length === 0) {
      const { mediaAssets: _removedMediaAssets, ...recordingWithoutMedia } = recording;

      return recordingWithoutMedia;
    }

    return {
      ...recording,
      mediaAssets,
    };
  }

  async function loadMediaAssetsForRecording(recording: TeacherRecording): Promise<RecordingMediaAsset[]> {
    const metadataAssets = recording.mediaAssets ?? [];
    const loadedAssets: RecordingMediaAsset[] = [];

    for (const metadata of metadataAssets) {
      const asset = await interactiveTimelineStorage.loadMediaAsset(metadata.id);

      if (asset) {
        loadedAssets.push(asset);
      }
    }

    if (loadedAssets.length > 0) {
      return loadedAssets;
    }

    return interactiveTimelineStorage.listMediaAssetsForRecording(recording.id);
  }

  async function syncMediaAssetsForRecording(recording: TeacherRecording, status: MediaStatus) {
    const assets = await loadMediaAssetsForRecording(recording);

    if (assets.length > 0) {
      setCurrentMediaAssets(assets, status);
      return assets;
    }

    if ((recording.mediaAssets?.length ?? 0) > 0) {
      setNoMedia('error', 'Recording references media, but no media blob was found in IndexedDB.');
      return [];
    }

    setNoMedia(status);
    return [];
  }

  async function getLatestMatchingLearnerDelta(recording?: TeacherRecording) {
    const resolvedRecording = recording ?? (await interactiveTimelineStorage.loadTeacherRecording());
    const delta = await interactiveTimelineStorage.loadLatestLearnerDelta();

    if (!resolvedRecording || !delta) {
      return undefined;
    }

    if (
      delta.teacherRecordingId !== resolvedRecording.id ||
      delta.teacherRecordingVersion !== resolvedRecording.version ||
      simpleHashFiles(materializeTeacherState(resolvedRecording, delta.teacherTimestampMs)) !== delta.baseTeacherFilesHash
    ) {
      return undefined;
    }

    return delta;
  }

  async function syncLearnerDeltaState(recording?: TeacherRecording) {
    const resolvedRecording = recording ?? (await interactiveTimelineStorage.loadTeacherRecording());
    const matchingDelta = resolvedRecording ? await getLatestMatchingLearnerDelta(resolvedRecording) : undefined;
    const deltas = await interactiveTimelineStorage.loadLearnerDeltas();

    setHasTeacherRecording(Boolean(resolvedRecording));
    setLearnerDeltaCount(deltas.length);
    setHasRestorableLearnerDelta(Boolean(matchingDelta));
    setConflictedFiles(
      resolvedRecording && matchingDelta ? getLearnerDeltaConflicts(resolvedRecording, matchingDelta).filePaths : [],
    );
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

  function stopFallbackPlaybackClock() {
    playbackClockRef.current?.stop();
    playbackClockRef.current = null;
  }

  function stopMediaPlaybackLoop({ pauseMedia }: { pauseMedia: boolean }) {
    if (mediaPlaybackFrameIdRef.current !== undefined) {
      window.cancelAnimationFrame(mediaPlaybackFrameIdRef.current);
      mediaPlaybackFrameIdRef.current = undefined;
    }

    const mediaElement = getMediaPlaybackElement();

    if (pauseMedia) {
      mediaElement?.pause();
    }

    playbackUsesMediaRef.current = false;
  }

  function resetPlaybackState() {
    playbackEventsRef.current = [];
    nextPlaybackEventIndexRef.current = 0;
    mediaPlaybackEndMsRef.current = 0;
  }

  function stopPlaybackDrivers({ pauseMedia }: { pauseMedia: boolean }) {
    stopFallbackPlaybackClock();
    stopMediaPlaybackLoop({ pauseMedia });
    resetPlaybackState();
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
    stopPlaybackDrivers({ pauseMedia: true });
    setIsPlaying(false);
    setPlaybackStatus(status);
    setInteractiveMode(nextMode);
    releasePlaybackGuardSoon();
  }

  function getCurrentPlaybackTimestampMs() {
    if (playbackUsesMediaRef.current) {
      const mediaElement = getMediaPlaybackElement();

      if (mediaElement) {
        return Math.max(0, Math.round(mediaElement.currentTime * 1000));
      }
    }

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

  function replayEventsAt(currentTimeMs: number, recording = playbackRecordingRef.current) {
    if (!recording) {
      return;
    }

    startPlaybackGuard();
    applyRecordingBaseFiles(recording);
    nextPlaybackEventIndexRef.current = 0;
    applyDuePlaybackEvents(currentTimeMs);
  }

  function getPlaybackEndMs(events: TimelineEvent[], recording: TeacherRecording, mediaAsset?: RecordingMediaAsset | null) {
    return Math.max(events.at(-1)?.tMs ?? 0, recording.durationMs ?? 0, mediaAsset?.durationMs ?? 0);
  }

  function onMediaElementRef(element: HTMLMediaElement | null) {
    visibleMediaElementRef.current = element;
  }

  function getMediaPlaybackElement(): HTMLMediaElement | undefined {
    const objectUrl = mediaObjectUrlRef.current;

    if (!objectUrl || mediaKindRef.current === 'none') {
      return undefined;
    }

    const visibleElement = visibleMediaElementRef.current;

    if (visibleElement) {
      return visibleElement;
    }

    const expectedTagName = mediaKindRef.current === 'webcam' ? 'video' : 'audio';
    const hiddenElement = hiddenMediaElementRef.current;

    if (!hiddenElement || hiddenElement.tagName.toLowerCase() !== expectedTagName) {
      hiddenElement?.pause();
      const nextElement = document.createElement(expectedTagName) as HTMLMediaElement;

      nextElement.preload = 'auto';
      hiddenMediaElementRef.current = nextElement;
    }

    const mediaElement = hiddenMediaElementRef.current;

    if (!mediaElement) {
      return undefined;
    }

    if (mediaElement.src !== objectUrl) {
      mediaElement.src = objectUrl;
      mediaElement.load();
    }

    return mediaElement;
  }

  function startMediaPlaybackLoop(mediaElement: HTMLMediaElement) {
    stopMediaPlaybackLoop({ pauseMedia: false });
    playbackUsesMediaRef.current = true;

    const handleFrame = () => {
      if (!playbackUsesMediaRef.current || modeRef.current !== 'teacher-playback') {
        mediaPlaybackFrameIdRef.current = undefined;
        return;
      }

      const currentTimeMs = Math.max(0, Math.round(mediaElement.currentTime * 1000));

      applyDuePlaybackEvents(currentTimeMs);

      if (mediaElement.ended || currentTimeMs >= mediaPlaybackEndMsRef.current) {
        stopPlayback('finished');
        return;
      }

      mediaPlaybackFrameIdRef.current = window.requestAnimationFrame(handleFrame);
    };

    mediaPlaybackFrameIdRef.current = window.requestAnimationFrame(handleFrame);
  }

  function attachMediaPlaybackListeners(mediaElement: HTMLMediaElement) {
    mediaElement.onseeked = () => {
      if (modeRef.current !== 'teacher-playback') {
        return;
      }

      replayEventsAt(mediaElement.currentTime * 1000);
    };
    mediaElement.onended = () => stopPlayback('finished');
  }

  function playRecordingFrom(startMs: number, { resetToBase }: { resetToBase: boolean }, recordingOverride?: TeacherRecording) {
    const recording = recordingOverride ?? playbackRecordingRef.current;

    stopPlaybackDrivers({ pauseMedia: true });

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

    const mediaElement = playbackMediaAssetRef.current?.blob ? getMediaPlaybackElement() : undefined;
    const playbackEndMs = getPlaybackEndMs(playbackEventsRef.current, recording, playbackMediaAssetRef.current);

    mediaPlaybackEndMsRef.current = playbackEndMs;

    if (playbackEndMs <= 0 || startMs >= playbackEndMs) {
      stopPlayback('finished');
      return;
    }

    if (mediaElement) {
      const mediaStartMs = Math.max(0, startMs);

      attachMediaPlaybackListeners(mediaElement);
      mediaElement.currentTime = mediaStartMs / 1000;
      applyDuePlaybackEvents(mediaStartMs);
      startMediaPlaybackLoop(mediaElement);
      void mediaElement.play().catch((error: unknown) => {
        setMediaStatus('error');
        setMediaError(error instanceof Error ? error.message : 'Unable to play media.');
        stopPlayback('paused', 'idle');
      });
      return;
    }

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

  async function onPlayRecording() {
    const recording = (await interactiveTimelineStorage.loadTeacherRecording()) ?? null;

    playbackRecordingRef.current = recording;

    if (recording) {
      await syncMediaAssetsForRecording(recording, 'loaded');
    } else {
      setNoMedia(getInitialMediaStatus());
    }

    await syncLearnerDeltaState(recording ?? undefined);
    setHasPausedTeacherTimestamp(false);
    setPausedTimestampMs(0);
    playRecordingFrom(-1, { resetToBase: true }, recording ?? undefined);
  }

  function onPausePlayback() {
    if (!isPlaying) {
      return;
    }

    playbackClockRef.current?.pause();

    if (playbackUsesMediaRef.current) {
      getMediaPlaybackElement()?.pause();
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

  async function startRecording(mediaKindToRecord: MediaKindStatus) {
    if (!lessonFullyLoaded || modeRef.current !== 'idle') {
      return;
    }

    stopPlaybackDrivers({ pauseMedia: true });
    const baseFiles: FilesSnapshot = normalizeFiles(tutorialStore.takeSnapshot().files);
    const recorder = new TimelineRecorder();
    let mediaRecorder: InteractiveMediaRecorder | null = null;
    let mediaPrepareError = '';

    setNoMedia(mediaKindToRecord === 'none' ? getInitialMediaStatus() : 'permission-needed');

    if (mediaKindToRecord !== 'none') {
      mediaRecorder = new InteractiveMediaRecorder({ fake: isFakeMediaRecorderEnabled() });

      try {
        await mediaRecorder.prepare(mediaKindToRecord);
      } catch (error) {
        mediaPrepareError = error instanceof Error ? error.message : 'Unable to start media recording.';
        mediaRecorder = null;
        setMediaStatus(canUseMediaRecorder() ? 'error' : 'unavailable');
        setMediaError(mediaPrepareError);
      }
    }

    const startedAtMs = Date.now();
    const recording = recorder.start({ lessonId, version: 1, baseFiles, startedAtMs });

    if (mediaRecorder) {
      mediaRecorder.start({ recordingId: recording.id, startedAtMs });
      setMediaStatus('recording');
      setMediaKind(mediaKindToRecord);
      mediaKindRef.current = mediaKindToRecord;
      setMediaError('none');
    } else if (mediaPrepareError) {
      setMediaKind('none');
      mediaKindRef.current = 'none';
    }

    recorderRef.current = recorder;
    mediaRecorderRef.current = mediaRecorder;
    currentDraftRecordingRef.current = recording;
    currentMediaAssetsRef.current = [];
    setDraftStatus('unsaved');
    setCurrentDraftId(recording.id);
    setRecordingDurationMs(0);
    setIsRecording(true);
    setEventCount(recording.events.length);
  }

  function onStartRecording() {
    void startRecording('none');
  }

  function onStartMicRecording() {
    void startRecording('audio');
  }

  function onStartCameraRecording() {
    void startRecording('webcam');
  }

  async function onStopRecording() {
    const stopped = recorderRef.current?.stop();
    const mediaRecorder = mediaRecorderRef.current;

    recorderRef.current = null;
    mediaRecorderRef.current = null;

    if (!stopped) {
      mediaRecorder?.abort();
      setIsRecording(false);
      return;
    }

    let mediaAsset: RecordingMediaAsset | undefined;
    let mediaStopFailed = false;

    try {
      mediaAsset = await mediaRecorder?.stop();
    } catch (error) {
      mediaStopFailed = true;
      setMediaStatus('error');
      setMediaError(error instanceof Error ? error.message : 'Unable to stop media recording.');
    }

    const assets = mediaAsset?.blob ? [mediaAsset] : [];
    const recordingWithMedia = getRecordingWithMediaMetadata(stopped, assets);

    setIsRecording(false);
    setCurrentDraftRecording(recordingWithMedia, 'unsaved');

    if (assets.length > 0) {
      setCurrentMediaAssets(assets, 'loaded');
    } else if (!mediaStopFailed) {
      setNoMedia(getInitialMediaStatus());
    }
  }

  async function onSaveDraft() {
    const recording = currentDraftRecordingRef.current;

    if (!recording || isRecording) {
      setDraftStatus('missing');
      return;
    }

    const assets = currentMediaAssetsRef.current;
    const recordingWithMedia = getRecordingWithMediaMetadata(recording, assets);

    await interactiveTimelineStorage.saveTeacherRecordingDraft(recordingWithMedia);

    let mediaSaveFailed = false;

    for (const asset of assets) {
      try {
        await interactiveTimelineStorage.saveMediaAsset(asset);
      } catch (error) {
        mediaSaveFailed = true;
        setMediaError(error instanceof Error ? error.message : 'Unable to save media asset.');
      }
    }

    playbackRecordingRef.current = recordingWithMedia;
    setCurrentDraftRecording(recordingWithMedia, 'saved');
    setMediaStatus(mediaSaveFailed ? 'error' : 'saved');
    await syncLearnerDeltaState(recordingWithMedia);
  }

  async function onLoadDraft() {
    const [latestDraft] = await interactiveTimelineStorage.listTeacherRecordingDrafts();

    if (!latestDraft) {
      setCurrentDraftRecording(null, 'missing');
      setNoMedia(getInitialMediaStatus());
      return;
    }

    const recording = await interactiveTimelineStorage.loadTeacherRecordingDraft(latestDraft.id);

    if (!recording) {
      setCurrentDraftRecording(null, 'missing');
      setNoMedia(getInitialMediaStatus());
      return;
    }

    playbackRecordingRef.current = recording;
    setCurrentDraftRecording(recording, 'loaded');
    await syncMediaAssetsForRecording(recording, 'loaded');
    await syncLearnerDeltaState(recording);
  }

  async function onPreviewDraft() {
    const recording = currentDraftRecordingRef.current;

    if (!recording || isRecording) {
      setDraftStatus('missing');
      return;
    }

    if ((recording.mediaAssets?.length ?? 0) > 0 && currentMediaAssetsRef.current.length === 0) {
      await syncMediaAssetsForRecording(recording, 'loaded');
    }

    playbackRecordingRef.current = recording;
    await syncLearnerDeltaState(recording);
    setHasPausedTeacherTimestamp(false);
    setPausedTimestampMs(0);
    playRecordingFrom(-1, { resetToBase: true }, recording);
  }

  async function onDiscardDraft() {
    currentDraftRecordingRef.current = null;
    playbackRecordingRef.current = null;
    setDraftStatus('discarded');
    setCurrentDraftId('none');
    setRecordingDurationMs(0);
    setEventCount(0);
    setNoMedia(getInitialMediaStatus());
    await syncLearnerDeltaState();
  }

  async function onSaveLearnerDelta() {
    if (modeRef.current !== 'learner-editing' || !hasPausedTeacherTimestamp) {
      return;
    }

    const recording = await interactiveTimelineStorage.loadTeacherRecording();

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

    await interactiveTimelineStorage.saveLearnerDelta(delta);
    setLearnerDeltaStatus('saved');
    await syncLearnerDeltaState(recording);
  }

  async function onRestoreLearnerDelta() {
    const recording = await interactiveTimelineStorage.loadTeacherRecording();
    const delta = await getLatestMatchingLearnerDelta(recording);

    if (!recording || !delta) {
      setLearnerDeltaStatus('missing matching delta');
      await syncLearnerDeltaState(recording);
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
      await syncLearnerDeltaState(recording);
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
    void syncLearnerDeltaState();
  }, [storeRef]);

  useEffect(() => {
    return () => {
      stopPlaybackDrivers({ pauseMedia: true });
      mediaRecorderRef.current?.abort();
      hiddenMediaElementRef.current?.pause();
      hiddenMediaElementRef.current = null;
      revokeCurrentMediaObjectUrl();
      isApplyingPlaybackRef.current = false;
      modeRef.current = 'idle';
    };
  }, []);

  const hasCurrentDraftRecording = currentDraftRecordingRef.current !== null;
  const canStartAnyRecording = !isRecording && mode === 'idle' && lessonFullyLoaded;
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
      draftStatus,
      currentDraftId,
      recordingDurationMs,
      mediaStatus,
      mediaKind,
      mediaDurationMs,
      mediaError,
      mediaPreviewUrl,
      mediaMimeType,
      canStartRecording: canStartAnyRecording,
      canStartMediaRecording: canStartAnyRecording,
      canStopRecording: isRecording,
      canSaveDraft: hasCurrentDraftRecording && !isRecording && mode === 'idle',
      canLoadDraft: !isRecording && mode === 'idle',
      canPreviewDraft: hasCurrentDraftRecording && !isRecording && mode === 'idle',
      canDiscardDraft: (hasCurrentDraftRecording || draftStatus !== 'missing') && !isRecording && mode !== 'teacher-playback',
      canPlayRecording: !isRecording && mode === 'idle' && lessonFullyLoaded,
      canPausePlayback: isPlaying,
      canResumeTeacher: mode === 'learner-editing',
      canSaveLearnerDelta,
      canRestoreLearnerDelta,
      onStartRecording,
      onStartMicRecording,
      onStartCameraRecording,
      onStopRecording,
      onSaveDraft,
      onLoadDraft,
      onPreviewDraft,
      onDiscardDraft,
      onPlayRecording,
      onPausePlayback,
      onResumeTeacher,
      onSaveLearnerDelta,
      onRestoreLearnerDelta,
      onMediaElementRef,
    },
    onFileSelect,
    onEditorScroll,
    onEditorChange,
  };
}
