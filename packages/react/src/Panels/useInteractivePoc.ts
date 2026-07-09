import {
  IndexedDBInteractiveTimelineStorage,
  InteractiveMediaRecorder,
  RemoteInteractiveTimelineStorage,
  TimelinePlaybackClock,
  TimelineRecorder,
  INTERACTIVE_DEFAULT_LEARNER_USER_ID,
  INTERACTIVE_DEV_USERS,
  INTERACTIVE_LEGACY_LOCAL_LEARNER_USER_ID,
  applyLearnerDelta,
  canPublishInteractiveRecording,
  canSaveInteractiveLearnerWork,
  devLogin as devLoginUser,
  diffFiles,
  getLearnerDeltaConflicts,
  getRecordingMediaAssetMetadata,
  listDevUsers,
  loadCurrentUser,
  logout as logoutCurrentUser,
  materializeTeacherState,
  normalizeFiles,
  normalizePath,
  simpleHashFiles,
  type EditorScrolledPayload,
  type FileChangedPayload,
  type FilesSnapshot,
  type InteractiveTimelineStorage,
  type InteractiveUser,
  type LearnerDelta,
  type LearnerDeltaQuery,
  type RecordingMediaAsset,
  type RecordingMediaKind,
  type TeacherRecording,
  type TeacherRecordingDraftSummary,
  type TimelineEvent,
  type TutorialStore,
} from '@tutorialkit/runtime';
import { useEffect, useRef, useState } from 'react';

export type InteractiveMode = 'teacher-playback' | 'learner-editing' | 'idle';
export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'finished' | 'missing-recording';
export type DraftStatus = 'unsaved' | 'saved' | 'loaded' | 'discarded' | 'missing';
export type PublishedStatus = 'idle' | 'publishing' | 'published' | 'loaded' | 'missing' | 'error';
export type RecordingStorageSource = 'local-draft' | 'published' | 'none';
export type MediaStatus = 'unavailable' | 'permission-needed' | 'recording' | 'saved' | 'loaded' | 'error';
export type MediaKindStatus = 'none' | RecordingMediaKind;
export type RecordingLibrarySource = 'draft' | 'published';

export interface InteractiveRecordingLibraryItem extends TeacherRecordingDraftSummary {
  source: RecordingLibrarySource;
  workStatus?: 'not checked' | 'no saved work' | 'saved work' | 'conflict warning';
}

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
  publishedStatus: PublishedStatus;
  publishedRecordingId: string;
  publishedError: string;
  recordingStorageSource: RecordingStorageSource;
  recordingDurationMs: number;
  mediaStatus: MediaStatus;
  mediaKind: MediaKindStatus;
  mediaDurationMs: number;
  mediaError: string;
  mediaPreviewUrl: string;
  mediaMimeType: string;
  draftRecordings: InteractiveRecordingLibraryItem[];
  publishedRecordings: InteractiveRecordingLibraryItem[];
  selectedDraftId: string;
  selectedPublishedRecordingId: string;
  recordingLibraryStatus: string;
  currentUser: InteractiveUser | null;
  devUsers: InteractiveUser[];
  authStatus: string;
  authError: string;
  canPublishAsTeacher: boolean;
  canUseLearnerWork: boolean;
  canStartRecording: boolean;
  canStartMediaRecording: boolean;
  canStopRecording: boolean;
  canSaveDraft: boolean;
  canLoadDraft: boolean;
  canPreviewDraft: boolean;
  canDiscardDraft: boolean;
  canPublishRecording: boolean;
  canLoadPublishedRecording: boolean;
  canPreviewPublishedRecording: boolean;
  canDeleteSelectedDraft: boolean;
  canPlayRecording: boolean;
  canPausePlayback: boolean;
  canResumeTeacher: boolean;
  canSaveLearnerDelta: boolean;
  canRestoreLearnerDelta: boolean;
  onDevLogin: (userId: string) => void;
  onLogout: () => void;
  onRefreshRecordingLibrary: () => void;
  onSelectDraftRecording: (recordingId: string) => void;
  onSelectPublishedRecording: (recordingId: string) => void;
  onStartRecording: () => void;
  onStartMicRecording: () => void;
  onStartCameraRecording: () => void;
  onStopRecording: () => void;
  onSaveDraft: () => void;
  onLoadDraft: (recordingId?: string) => void;
  onPreviewDraft: (recordingId?: string) => void;
  onDiscardDraft: () => void;
  onDeleteSelectedDraft: () => void;
  onPublishRecording: () => void;
  onLoadPublishedRecording: (recordingId?: string) => void;
  onPreviewPublishedRecording: (recordingId?: string) => void;
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
const localTimelineStorage: InteractiveTimelineStorage = new IndexedDBInteractiveTimelineStorage();
const remoteTimelineStorage: InteractiveTimelineStorage = new RemoteInteractiveTimelineStorage();

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
  const currentRecordingSourceRef = useRef<RecordingStorageSource>('none');
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
  const currentUserRef = useRef<InteractiveUser | null>(null);
  const [currentUser, setCurrentUserState] = useState<InteractiveUser | null>(null);
  const [devUsers, setDevUsers] = useState<InteractiveUser[]>(() => [...INTERACTIVE_DEV_USERS]);
  const [authStatus, setAuthStatus] = useState('loading');
  const [authError, setAuthError] = useState('none');
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
  const [publishedStatus, setPublishedStatus] = useState<PublishedStatus>('idle');
  const [publishedRecordingId, setPublishedRecordingId] = useState('none');
  const [publishedError, setPublishedError] = useState('none');
  const [recordingStorageSource, setRecordingStorageSource] = useState<RecordingStorageSource>('none');
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [mediaStatus, setMediaStatus] = useState<MediaStatus>(getInitialMediaStatus);
  const [mediaKind, setMediaKind] = useState<MediaKindStatus>('none');
  const [mediaDurationMs, setMediaDurationMs] = useState(0);
  const [mediaError, setMediaError] = useState('none');
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [mediaMimeType, setMediaMimeType] = useState('');
  const [draftRecordings, setDraftRecordings] = useState<InteractiveRecordingLibraryItem[]>([]);
  const [publishedRecordings, setPublishedRecordings] = useState<InteractiveRecordingLibraryItem[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [selectedPublishedRecordingId, setSelectedPublishedRecordingId] = useState('');
  const [recordingLibraryStatus, setRecordingLibraryStatus] = useState('idle');

  function getCurrentFilePath() {
    return selectedFile ?? tutorialStore.currentDocument.get()?.filePath;
  }

  function syncEventCount() {
    setEventCount(recorderRef.current?.getRecording()?.events.length ?? currentDraftRecordingRef.current?.events.length ?? 0);
  }

  function setCurrentRecordingSource(source: RecordingStorageSource) {
    currentRecordingSourceRef.current = source;
    setRecordingStorageSource(source);
  }

  function setCurrentUser(user: InteractiveUser | null) {
    currentUserRef.current = user;
    setCurrentUserState(user);
  }

  function getActiveLearnerStorage() {
    return currentRecordingSourceRef.current === 'published' ? remoteTimelineStorage : localTimelineStorage;
  }

  function getLearnerDeltaQuery(recording: TeacherRecording): LearnerDeltaQuery {
    return {
      lessonId: recording.lessonId || lessonId,
      teacherRecordingId: recording.id,
      teacherRecordingVersion: recording.version,
    };
  }

  function getAllowedLearnerUserIds() {
    const user = currentUserRef.current;

    if (!user || !canSaveInteractiveLearnerWork(user)) {
      return [];
    }

    const userIds = [user.id];

    if (user.id === INTERACTIVE_DEFAULT_LEARNER_USER_ID) {
      userIds.push(INTERACTIVE_LEGACY_LOCAL_LEARNER_USER_ID);
    }

    return userIds;
  }

  async function loadScopedLearnerDeltas(recording: TeacherRecording, storage: InteractiveTimelineStorage) {
    const allowedUserIds = new Set(getAllowedLearnerUserIds());

    if (allowedUserIds.size === 0) {
      return [];
    }

    const deltas = await storage.loadLearnerDeltas(getLearnerDeltaQuery(recording));

    return deltas.filter((delta) => allowedUserIds.has(delta.userId));
  }

  function toRecordingLibraryItem(
    summary: TeacherRecordingDraftSummary,
    source: RecordingLibrarySource,
    workStatus: InteractiveRecordingLibraryItem['workStatus'] = 'not checked',
  ): InteractiveRecordingLibraryItem {
    return {
      ...summary,
      source,
      workStatus: source === 'published' ? workStatus : undefined,
    };
  }

  function preserveSelectedRecordingId(currentId: string, items: InteractiveRecordingLibraryItem[]) {
    if (currentId && items.some((item) => item.id === currentId)) {
      return currentId;
    }

    return items[0]?.id ?? '';
  }

  async function refreshRecordingLibrary() {
    setRecordingLibraryStatus('loading');

    try {
      const [localDrafts, remotePublished] = await Promise.all([
        localTimelineStorage.listTeacherRecordingDrafts(),
        remoteTimelineStorage.listTeacherRecordingDrafts(),
      ]);
      const nextDrafts = localDrafts.map((summary) => toRecordingLibraryItem(summary, 'draft'));
      const nextPublished = remotePublished.map((summary) => toRecordingLibraryItem(summary, 'published'));

      setDraftRecordings(nextDrafts);
      setPublishedRecordings(nextPublished);
      setSelectedDraftId((currentId) => preserveSelectedRecordingId(currentId, nextDrafts));
      setSelectedPublishedRecordingId((currentId) => preserveSelectedRecordingId(currentId, nextPublished));
      setRecordingLibraryStatus('ready');
    } catch (error) {
      setRecordingLibraryStatus(error instanceof Error ? `error: ${error.message}` : 'error');
    }
  }

  function onRefreshRecordingLibrary() {
    void refreshRecordingLibrary();
  }

  function onSelectDraftRecording(recordingId: string) {
    setSelectedDraftId(recordingId);
  }

  function onSelectPublishedRecording(recordingId: string) {
    setSelectedPublishedRecordingId(recordingId);
  }

  async function refreshAuthState() {
    setAuthStatus('loading');

    try {
      const [user, users] = await Promise.all([loadCurrentUser(), listDevUsers()]);

      setDevUsers(users.length > 0 ? users : [...INTERACTIVE_DEV_USERS]);
      setCurrentUser(user);
      setAuthStatus(user ? 'signed-in' : 'signed-out');
      setAuthError('none');
    } catch (error) {
      setAuthStatus('error');
      setAuthError(error instanceof Error ? error.message : 'Unable to load dev identity.');
    }
  }

  async function syncAfterAuthChange() {
    const recording = playbackRecordingRef.current ?? currentDraftRecordingRef.current ?? undefined;

    await syncLearnerDeltaState(recording, getActiveLearnerStorage());
    await refreshRecordingLibrary();
  }

  async function signInAsDevUser(userId: string) {
    setAuthStatus('signing-in');
    setAuthError('none');

    try {
      const user = await devLoginUser(userId);

      setCurrentUser(user);
      setAuthStatus(user ? 'signed-in' : 'signed-out');
      await syncAfterAuthChange();
    } catch (error) {
      setAuthStatus('error');
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in.');
    }
  }

  function onDevLogin(userId: string) {
    void signInAsDevUser(userId);
  }

  async function signOut() {
    setAuthStatus('signing-out');
    setAuthError('none');

    try {
      await logoutCurrentUser();
      setCurrentUser(null);
      setAuthStatus('signed-out');
      await syncAfterAuthChange();
    } catch (error) {
      setAuthStatus('error');
      setAuthError(error instanceof Error ? error.message : 'Unable to sign out.');
    }
  }

  function onLogout() {
    void signOut();
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

  function getCurrentTeacherOwnerId() {
    const user = currentUserRef.current;

    return user && canPublishInteractiveRecording(user) ? user.id : undefined;
  }

  function getRecordingWithOwner(recording: TeacherRecording): TeacherRecording {
    const ownerUserId = getCurrentTeacherOwnerId();

    if (!ownerUserId) {
      return recording;
    }

    return {
      ...recording,
      createdByUserId: recording.createdByUserId ?? ownerUserId,
      ownerUserId: recording.ownerUserId ?? ownerUserId,
    };
  }

  function getMediaAssetWithOwner(asset: RecordingMediaAsset): RecordingMediaAsset {
    const ownerUserId = getCurrentTeacherOwnerId();

    return ownerUserId ? { ...asset, ownerUserId: asset.ownerUserId ?? ownerUserId } : asset;
  }

  function getRecordingWithMediaMetadata(recording: TeacherRecording, assets: RecordingMediaAsset[]): TeacherRecording {
    const recordingWithOwner = getRecordingWithOwner(recording);
    const mediaAssets = assets.map((asset) => getRecordingMediaAssetMetadata(getMediaAssetWithOwner(asset)));

    if (mediaAssets.length === 0) {
      const { mediaAssets: _removedMediaAssets, ...recordingWithoutMedia } = recordingWithOwner;

      return recordingWithoutMedia;
    }

    return {
      ...recordingWithOwner,
      mediaAssets,
    };
  }

  async function loadMediaAssetsForRecording(
    recording: TeacherRecording,
    storage: InteractiveTimelineStorage,
  ): Promise<RecordingMediaAsset[]> {
    const metadataAssets = recording.mediaAssets ?? [];
    const loadedAssets: RecordingMediaAsset[] = [];

    for (const metadata of metadataAssets) {
      const asset = await storage.loadMediaAsset(metadata.id);

      if (asset) {
        loadedAssets.push(asset);
      }
    }

    if (loadedAssets.length > 0) {
      return loadedAssets;
    }

    return storage.listMediaAssetsForRecording(recording.id);
  }

  async function syncMediaAssetsForRecording(
    recording: TeacherRecording,
    status: MediaStatus,
    storage: InteractiveTimelineStorage,
  ) {
    const assets = await loadMediaAssetsForRecording(recording, storage);

    if (assets.length > 0) {
      setCurrentMediaAssets(assets, status);
      return assets;
    }

    if ((recording.mediaAssets?.length ?? 0) > 0) {
      setNoMedia('error', 'Recording references media, but no media blob was found in the active storage adapter.');
      return [];
    }

    setNoMedia(status);
    return [];
  }

  async function getLatestMatchingLearnerDelta(recording?: TeacherRecording, storage = getActiveLearnerStorage()) {
    const resolvedRecording = recording ?? (await storage.loadTeacherRecording());
    const delta = resolvedRecording ? (await loadScopedLearnerDeltas(resolvedRecording, storage)).at(-1) : undefined;

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

  async function syncLearnerDeltaState(recording?: TeacherRecording, storage = getActiveLearnerStorage()) {
    const resolvedRecording = recording ?? (await storage.loadTeacherRecording());
    const matchingDelta = resolvedRecording ? await getLatestMatchingLearnerDelta(resolvedRecording, storage) : undefined;
    const deltas = resolvedRecording ? await loadScopedLearnerDeltas(resolvedRecording, storage) : [];

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
    const storage = getActiveLearnerStorage();
    const existingPublishedRecording =
      currentRecordingSourceRef.current === 'published' ? playbackRecordingRef.current : null;
    const recording = existingPublishedRecording ?? (await storage.loadTeacherRecording()) ?? null;

    playbackRecordingRef.current = recording;

    if (recording) {
      await syncMediaAssetsForRecording(recording, 'loaded', storage);
    } else {
      setNoMedia(getInitialMediaStatus());
    }

    await syncLearnerDeltaState(recording ?? undefined, storage);
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
    const recording = getRecordingWithOwner(recorder.start({ lessonId, version: 1, baseFiles, startedAtMs }));

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
    setCurrentRecordingSource('local-draft');
    setPublishedStatus('idle');
    setPublishedRecordingId('none');
    setPublishedError('none');
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

    const assets = mediaAsset?.blob ? [getMediaAssetWithOwner(mediaAsset)] : [];
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

    const assets = currentMediaAssetsRef.current.map(getMediaAssetWithOwner);
    const recordingWithMedia = getRecordingWithMediaMetadata(recording, assets);

    currentMediaAssetsRef.current = assets;
    await localTimelineStorage.saveTeacherRecordingDraft(recordingWithMedia);

    let mediaSaveFailed = false;

    for (const asset of assets) {
      try {
        await localTimelineStorage.saveMediaAsset(asset);
      } catch (error) {
        mediaSaveFailed = true;
        setMediaError(error instanceof Error ? error.message : 'Unable to save media asset.');
      }
    }

    playbackRecordingRef.current = recordingWithMedia;
    setCurrentRecordingSource('local-draft');
    setCurrentDraftRecording(recordingWithMedia, 'saved');
    setSelectedDraftId(recordingWithMedia.id);
    setMediaStatus(mediaSaveFailed ? 'error' : 'saved');
    await syncLearnerDeltaState(recordingWithMedia, localTimelineStorage);
    await refreshRecordingLibrary();
  }

  async function loadDraftRecording(recordingId = selectedDraftId) {
    const drafts =
      draftRecordings.length > 0
        ? draftRecordings
        : await localTimelineStorage
            .listTeacherRecordingDrafts()
            .then((items) => items.map((summary) => toRecordingLibraryItem(summary, 'draft')));
    const targetId = recordingId || drafts[0]?.id;

    if (!targetId) {
      setCurrentDraftRecording(null, 'missing');
      setNoMedia(getInitialMediaStatus());
      await refreshRecordingLibrary();
      return undefined;
    }

    const recording = await localTimelineStorage.loadTeacherRecordingDraft(targetId);

    if (!recording) {
      setCurrentDraftRecording(null, 'missing');
      setNoMedia(getInitialMediaStatus());
      await refreshRecordingLibrary();
      return undefined;
    }

    playbackRecordingRef.current = recording;
    setSelectedDraftId(recording.id);
    setCurrentRecordingSource('local-draft');
    setCurrentDraftRecording(recording, 'loaded');
    await syncMediaAssetsForRecording(recording, 'loaded', localTimelineStorage);
    await syncLearnerDeltaState(recording, localTimelineStorage);
    await refreshRecordingLibrary();

    return recording;
  }

  async function onLoadDraft(recordingId?: string) {
    await loadDraftRecording(recordingId);
  }

  async function onPreviewDraft(recordingId?: string) {
    const targetId = recordingId || selectedDraftId;
    const currentRecording = currentDraftRecordingRef.current;
    const recording =
      currentRecording && (!targetId || currentRecording.id === targetId)
        ? currentRecording
        : await loadDraftRecording(targetId);

    if (!recording || isRecording) {
      setDraftStatus('missing');
      return;
    }

    if ((recording.mediaAssets?.length ?? 0) > 0 && currentMediaAssetsRef.current.length === 0) {
      await syncMediaAssetsForRecording(recording, 'loaded', localTimelineStorage);
    }

    playbackRecordingRef.current = recording;
    setSelectedDraftId(recording.id);
    setCurrentRecordingSource('local-draft');
    await syncLearnerDeltaState(recording, localTimelineStorage);
    setHasPausedTeacherTimestamp(false);
    setPausedTimestampMs(0);
    playRecordingFrom(-1, { resetToBase: true }, recording);
  }

  async function onPublishRecording() {
    const recording = currentDraftRecordingRef.current;

    if (!canPublishInteractiveRecording(currentUserRef.current)) {
      setPublishedStatus('error');
      setPublishedError('Sign in as a teacher to publish recordings.');
      return;
    }

    if (!recording || isRecording) {
      setPublishedStatus('missing');
      setPublishedError('No stopped draft is available to publish.');
      return;
    }

    const assets = currentMediaAssetsRef.current.map(getMediaAssetWithOwner);
    const recordingWithMedia = getRecordingWithMediaMetadata(recording, assets);

    currentMediaAssetsRef.current = assets;
    setPublishedStatus('publishing');
    setPublishedError('none');

    try {
      await remoteTimelineStorage.saveTeacherRecording(recordingWithMedia);

      for (const asset of assets) {
        await remoteTimelineStorage.saveMediaAsset(asset);
      }

      playbackRecordingRef.current = recordingWithMedia;
      setCurrentRecordingSource('published');
      setPublishedStatus('published');
      setPublishedRecordingId(recordingWithMedia.id);
      setSelectedPublishedRecordingId(recordingWithMedia.id);
      setCurrentDraftRecording(recordingWithMedia, draftStatus === 'missing' ? 'loaded' : draftStatus);
      setMediaStatus(assets.length > 0 ? 'saved' : mediaStatus);
      await syncLearnerDeltaState(recordingWithMedia, remoteTimelineStorage);
      await refreshRecordingLibrary();
    } catch (error) {
      setPublishedStatus('error');
      setPublishedError(error instanceof Error ? error.message : 'Unable to publish recording.');
    }
  }

  async function loadPublishedRecording(recordingId = selectedPublishedRecordingId) {
    setPublishedStatus('idle');
    setPublishedError('none');

    try {
      const published =
        publishedRecordings.length > 0
          ? publishedRecordings
          : await remoteTimelineStorage
              .listTeacherRecordingDrafts()
              .then((items) => items.map((summary) => toRecordingLibraryItem(summary, 'published')));
      const targetId = recordingId || published[0]?.id;

      if (!targetId) {
        setPublishedStatus('missing');
        setPublishedRecordingId('none');
        await refreshRecordingLibrary();
        return undefined;
      }

      const recording = await remoteTimelineStorage.loadTeacherRecording(targetId);

      if (!recording) {
        setPublishedStatus('missing');
        setPublishedRecordingId('none');
        await refreshRecordingLibrary();
        return undefined;
      }

      playbackRecordingRef.current = recording;
      setSelectedPublishedRecordingId(recording.id);
      setCurrentRecordingSource('published');
      setPublishedStatus('loaded');
      setPublishedRecordingId(recording.id);
      setRecordingDurationMs(recording.durationMs);
      setEventCount(recording.events.length);
      await syncMediaAssetsForRecording(recording, 'loaded', remoteTimelineStorage);
      await syncLearnerDeltaState(recording, remoteTimelineStorage);
      await refreshRecordingLibrary();

      return recording;
    } catch (error) {
      setPublishedStatus('error');
      setPublishedError(error instanceof Error ? error.message : 'Unable to load published recording.');
      return undefined;
    }
  }

  async function onLoadPublishedRecording(recordingId?: string) {
    await loadPublishedRecording(recordingId);
  }

  async function onPreviewPublishedRecording(recordingId?: string) {
    const targetId = recordingId || selectedPublishedRecordingId;
    const currentRecording = playbackRecordingRef.current;
    const recording =
      currentRecording && currentRecordingSourceRef.current === 'published' && (!targetId || currentRecording.id === targetId)
        ? currentRecording
        : await loadPublishedRecording(targetId);

    if (!recording || currentRecordingSourceRef.current !== 'published') {
      setPublishedStatus('missing');
      return;
    }

    if ((recording.mediaAssets?.length ?? 0) > 0 && currentMediaAssetsRef.current.length === 0) {
      await syncMediaAssetsForRecording(recording, 'loaded', remoteTimelineStorage);
    }

    await syncLearnerDeltaState(recording, remoteTimelineStorage);
    setHasPausedTeacherTimestamp(false);
    setPausedTimestampMs(0);
    playRecordingFrom(-1, { resetToBase: true }, recording);
  }

  async function onDiscardDraft() {
    currentDraftRecordingRef.current = null;
    playbackRecordingRef.current = null;
    setCurrentRecordingSource('none');
    setDraftStatus('discarded');
    setCurrentDraftId('none');
    setRecordingDurationMs(0);
    setEventCount(0);
    setNoMedia(getInitialMediaStatus());
    await syncLearnerDeltaState(undefined, localTimelineStorage);
    await refreshRecordingLibrary();
  }

  async function onDeleteSelectedDraft() {
    const targetId = selectedDraftId || currentDraftRecordingRef.current?.id;

    if (!targetId || isRecording) {
      return;
    }

    try {
      const assets = await localTimelineStorage.listMediaAssetsForRecording(targetId);

      await Promise.all(assets.map((asset) => localTimelineStorage.deleteMediaAsset(asset.id)));
      await localTimelineStorage.deleteTeacherRecordingDraft(targetId);

      if (currentDraftRecordingRef.current?.id === targetId) {
        currentDraftRecordingRef.current = null;
        if (currentRecordingSourceRef.current === 'local-draft') {
          playbackRecordingRef.current = null;
          setCurrentRecordingSource('none');
        }
        setDraftStatus('discarded');
        setCurrentDraftId('none');
        setRecordingDurationMs(0);
        setEventCount(0);
        setNoMedia(getInitialMediaStatus());
      }

      setSelectedDraftId('');
      await refreshRecordingLibrary();
    } catch (error) {
      setDraftStatus('missing');
      setMediaError(error instanceof Error ? error.message : 'Unable to delete draft.');
    }
  }

  async function onSaveLearnerDelta() {
    if (modeRef.current !== 'learner-editing' || !hasPausedTeacherTimestamp) {
      return;
    }

    const user = currentUserRef.current;

    if (!user || !canSaveInteractiveLearnerWork(user)) {
      setLearnerDeltaStatus('sign in required');
      return;
    }

    const storage = getActiveLearnerStorage();
    const recording = playbackRecordingRef.current ?? (await storage.loadTeacherRecording());

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
      userId: user.id,
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

    await storage.saveLearnerDelta(delta);
    setLearnerDeltaStatus('saved');
    await syncLearnerDeltaState(recording, storage);
  }

  async function onRestoreLearnerDelta() {
    if (!canSaveInteractiveLearnerWork(currentUserRef.current)) {
      setLearnerDeltaStatus('sign in required');
      return;
    }

    const storage = getActiveLearnerStorage();
    const recording = playbackRecordingRef.current ?? (await storage.loadTeacherRecording());
    const delta = await getLatestMatchingLearnerDelta(recording, storage);

    if (!recording || !delta) {
      setLearnerDeltaStatus('missing matching delta');
      await syncLearnerDeltaState(recording, storage);
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
      await syncLearnerDeltaState(recording, storage);
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
    void (async () => {
      await refreshAuthState();
      await syncLearnerDeltaState(undefined, getActiveLearnerStorage());
      await refreshRecordingLibrary();
    })();
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
  const hasCurrentPublishedRecording = currentRecordingSourceRef.current === 'published' && playbackRecordingRef.current !== null;
  const hasDraftSelection = Boolean(selectedDraftId || currentDraftRecordingRef.current?.id || draftRecordings.length > 0);
  const canStartAnyRecording = !isRecording && mode === 'idle' && lessonFullyLoaded;
  const canPublishAsTeacher = canPublishInteractiveRecording(currentUser);
  const canUseLearnerWork = canSaveInteractiveLearnerWork(currentUser);
  const canSaveLearnerDelta = mode === 'learner-editing' && hasTeacherRecording && hasPausedTeacherTimestamp && canUseLearnerWork;
  const canRestoreLearnerDelta = hasRestorableLearnerDelta && !isRecording && mode !== 'teacher-playback' && canUseLearnerWork;

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
      publishedStatus,
      publishedRecordingId,
      publishedError,
      recordingStorageSource,
      recordingDurationMs,
      mediaStatus,
      mediaKind,
      mediaDurationMs,
      mediaError,
      mediaPreviewUrl,
      mediaMimeType,
      draftRecordings,
      publishedRecordings,
      selectedDraftId,
      selectedPublishedRecordingId,
      recordingLibraryStatus,
      currentUser,
      devUsers,
      authStatus,
      authError,
      canPublishAsTeacher,
      canUseLearnerWork,
      canStartRecording: canStartAnyRecording,
      canStartMediaRecording: canStartAnyRecording,
      canStopRecording: isRecording,
      canSaveDraft: hasCurrentDraftRecording && !isRecording && mode === 'idle',
      canLoadDraft: !isRecording && mode === 'idle',
      canPreviewDraft: (hasCurrentDraftRecording || hasDraftSelection) && !isRecording && mode === 'idle',
      canDiscardDraft: (hasCurrentDraftRecording || draftStatus !== 'missing') && !isRecording && mode !== 'teacher-playback',
      canPublishRecording:
        hasCurrentDraftRecording && !isRecording && mode === 'idle' && publishedStatus !== 'publishing' && canPublishAsTeacher,
      canLoadPublishedRecording: !isRecording && mode === 'idle' && publishedStatus !== 'publishing',
      canPreviewPublishedRecording:
        (hasCurrentPublishedRecording || Boolean(selectedPublishedRecordingId || publishedRecordings.length > 0)) &&
        !isRecording &&
        mode === 'idle',
      canDeleteSelectedDraft: hasDraftSelection && !isRecording && mode !== 'teacher-playback',
      canPlayRecording: !isRecording && mode === 'idle' && lessonFullyLoaded,
      canPausePlayback: isPlaying,
      canResumeTeacher: mode === 'learner-editing',
      canSaveLearnerDelta,
      canRestoreLearnerDelta,
      onDevLogin,
      onLogout,
      onRefreshRecordingLibrary,
      onSelectDraftRecording,
      onSelectPublishedRecording,
      onStartRecording,
      onStartMicRecording,
      onStartCameraRecording,
      onStopRecording,
      onSaveDraft,
      onLoadDraft,
      onPreviewDraft,
      onDiscardDraft,
      onDeleteSelectedDraft,
      onPublishRecording,
      onLoadPublishedRecording,
      onPreviewPublishedRecording,
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
