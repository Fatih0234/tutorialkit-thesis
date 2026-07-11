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
  clonePresentationLayout,
  createPresentationLayout,
  devLogin as devLoginUser,
  diffFiles,
  downloadRecordingPackage,
  exportRecordingPackage,
  getRecordingMediaAssetMetadata,
  importRecordingPackage,
  listDevUsers,
  loadCurrentUser,
  logout as logoutCurrentUser,
  materializeTeacherState,
  normalizeFiles,
  normalizePath,
  normalizePresentationLayout,
  parseRecordingPackage,
  saveTeacherRecording,
  setDeckProgress,
  setPresentationMode,
  stepDeckReveal,
  stepDeckSlide,
  simpleHashFiles,
  type DeckPresentationResource,
  type EditorScrolledPayload,
  type FileChangedPayload,
  type FilesSnapshot,
  type InteractiveTimelineStorage,
  type InteractiveUser,
  type LearnerDelta,
  type LearnerDeltaQuery,
  type PresentationChangedPayload,
  type PresentationLayout,
  type PresentationMode,
  type PresentationResource,
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
  workStatus?: 'not checked' | 'no saved work' | 'saved work';
}

interface EditorChangeUpdate {
  content: string;
  selection?: unknown;
}

interface EditorScrollPosition {
  top: number;
  left: number;
}

export interface LearnerCheckpointView {
  id: string;
  teacherTimestampMs: number;
  createdAt: string;
  changedFileCount: number;
  addedOrModifiedCount: number;
  removedCount: number;
  versionCount: number;
  selectedFile?: string;
}

export type DeckAction = 'next-reveal' | 'previous-reveal' | 'next-slide' | 'previous-slide' | 'select-slide';

export interface InteractivePocControlsModel {
  isRecording: boolean;
  presentationResources: PresentationResource[];
  teacherPresentationLayout: PresentationLayout;
  presentationLayout: PresentationLayout;
  hasLearnerPresentationOverride: boolean;
  isPlaying: boolean;
  mode: InteractiveMode;
  playbackStatus: PlaybackStatus;
  eventCount: number;
  playheadMs: number;
  pausedTeacherTimestampMs: number;
  learnerDeltaCount: number;
  learnerDeltaStatus: string;
  learnerCheckpoints: LearnerCheckpointView[];
  activeLearnerCheckpointId: string;
  isLearnerWorkspaceDirty: boolean;
  isResumeConfirmationVisible: boolean;
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
  liveMediaStream: MediaStream | null;
  draftRecordings: InteractiveRecordingLibraryItem[];
  publishedRecordings: InteractiveRecordingLibraryItem[];
  selectedDraftId: string;
  selectedPublishedRecordingId: string;
  recordingLibraryStatus: string;
  exportStatus: string;
  importStatus: string;
  demoDataStatus: string;
  importPackageFileName: string;
  includeLearnerDeltasInExport: boolean;
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
  canExportRecording: boolean;
  canImportRecordingPackage: boolean;
  canImportPublishedPackage: boolean;
  canSeedDemoData: boolean;
  canResetDemoData: boolean;
  canPlayRecording: boolean;
  canPausePlayback: boolean;
  canSeekPlayback: boolean;
  canEnterLearnerWorkspace: boolean;
  canResumeTeacher: boolean;
  canSaveLearnerDelta: boolean;
  onDevLogin: (userId: string) => void;
  onLogout: () => void;
  onRefreshRecordingLibrary: () => void;
  onTeacherPresentationModeChange: (resourceId: string, mode: PresentationMode) => void;
  onLearnerPresentationModeChange: (resourceId: string, mode: PresentationMode) => void;
  onTeacherDeckAction: (deckId: string, action: DeckAction, slideIndex?: number) => void;
  onLearnerDeckAction: (deckId: string, action: DeckAction, slideIndex?: number) => void;
  onUpdatePresentationDeck: (deck: DeckPresentationResource) => void;
  onFollowTeacherPresentation: () => void;
  onSelectDraftRecording: (recordingId: string) => void;
  onSelectPublishedRecording: (recordingId: string) => void;
  onStartRecording: () => Promise<boolean>;
  onStartMicRecording: () => Promise<boolean>;
  onStartCameraRecording: () => Promise<boolean>;
  onStopRecording: () => Promise<void>;
  onSaveDraft: () => void;
  onLoadDraft: (recordingId?: string) => void;
  onPreviewDraft: (recordingId?: string) => void;
  onDiscardDraft: () => void;
  onDeleteSelectedDraft: () => void;
  onPublishRecording: () => void;
  onLoadPublishedRecording: (recordingId?: string) => void;
  onPreviewPublishedRecording: (recordingId?: string) => void;
  onToggleIncludeLearnerDeltasInExport: (checked: boolean) => void;
  onSelectImportPackageFile: (file: File | null) => void;
  onExportRecording: () => void;
  onImportPackageAsDraft: () => void;
  onImportPackageAsPublished: () => void;
  onDemoSeed: () => void;
  onResetDemoData: () => void;
  onPlayRecording: () => void;
  onContinuePlayback: () => void;
  onPausePlayback: () => void;
  onPausePreviewPlayback: () => void;
  onRestartPlayback: () => void;
  onSeekPlayback: (timestampMs: number) => void;
  onResumeTeacher: () => void;
  onSaveLearnerDelta: () => void;
  onOpenLearnerCheckpoint: (checkpointId: string) => void;
  onSaveAndResumeTeacher: () => void;
  onDiscardAndResumeTeacher: () => void;
  onCancelResumeTeacher: () => void;
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
  onFileCreated: (filePath: string, content?: string) => void;
  onWorkspaceLayoutChange: () => void;
  onEditorScroll: (position: EditorScrollPosition) => void;
  onEditorChange: (update: EditorChangeUpdate) => void;
}

const PLAYBACK_GUARD_RELEASE_DELAY_MS = 250;
const FAKE_MEDIA_RECORDER_KEY = 'interactive-poc.fakeMediaRecorder';
const DEMO_RECORDING_ID_PREFIX = 'demo-';
const localTimelineStorage: InteractiveTimelineStorage = new IndexedDBInteractiveTimelineStorage();
const remoteTimelineStorage = new RemoteInteractiveTimelineStorage();
const CAMERA_PRESENTATION_RESOURCE: PresentationResource = { id: 'instructor-camera', kind: 'camera', title: 'Instructor Camera' };
const DEFAULT_PRESENTATION_RESOURCES: PresentationResource[] = [
  { id: 'website-preview', kind: 'preview', title: 'Website Preview' },
  { id: 'lesson-explanation', kind: 'explanation', title: 'Explanation' },
  {
    id: 'javascript-counter-deck', kind: 'deck', title: 'Building a JavaScript Counter', accent: 'indigo',
    slides: [
      { id: 'counter-state', title: 'JavaScript remembers state', eyebrow: 'Counter concept · 1', elements: [
        { id: 'state-intro', kind: 'paragraph', text: 'A variable stores the current count between button clicks.', revealStep: 0 },
        { id: 'state-read', kind: 'bullet', text: 'Read the current value.', revealStep: 1 },
        { id: 'state-change', kind: 'bullet', text: 'Increment it after every click.', revealStep: 2 },
      ] },
      { id: 'counter-dom', title: 'Events update the DOM', eyebrow: 'Counter concept · 2', elements: [
        { id: 'dom-listener', kind: 'bullet', text: 'A click listener runs JavaScript.', revealStep: 1 },
        { id: 'dom-text', kind: 'bullet', text: 'textContent displays the new value.', revealStep: 2 },
        { id: 'dom-code', kind: 'code', language: 'javascript', code: "button.addEventListener('click', () => {\n  count += 1;\n  output.textContent = count;\n});", revealStep: 3 },
      ] },
    ],
  },
];

function clonePresentationResources(resources: PresentationResource[]): PresentationResource[] {
  return structuredClone(resources);
}

function withInstructorCamera(resources: PresentationResource[]): PresentationResource[] {
  return resources.some((resource) => resource.kind === 'camera')
    ? resources
    : [...resources, CAMERA_PRESENTATION_RESOURCE];
}

function createDefaultPresentationLayout(): PresentationLayout {
  let layout = createPresentationLayout(DEFAULT_PRESENTATION_RESOURCES);
  layout = setPresentationMode(DEFAULT_PRESENTATION_RESOURCES, layout, 'website-preview', 'minimized');
  return setPresentationMode(DEFAULT_PRESENTATION_RESOURCES, layout, 'javascript-counter-deck', 'minimized');
}

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
  const learnerWorkspaceDirtyRef = useRef(false);
  const learnerWorkspaceSavedHashRef = useRef('');
  const learnerSaveGuardUntilRef = useRef(0);
  const workspaceLayoutGuardUntilRef = useRef(0);
  const importPackageFileRef = useRef<File | null>(null);
  const currentUserRef = useRef<InteractiveUser | null>(null);
  const presentationResourcesRef = useRef<PresentationResource[]>(clonePresentationResources(DEFAULT_PRESENTATION_RESOURCES));
  const teacherPresentationLayoutRef = useRef<PresentationLayout>(createDefaultPresentationLayout());
  const learnerPresentationOverrideRef = useRef<PresentationLayout | null>(null);
  const [presentationResources, setPresentationResources] = useState<PresentationResource[]>(() => clonePresentationResources(DEFAULT_PRESENTATION_RESOURCES));
  const [teacherPresentationLayout, setTeacherPresentationLayout] = useState<PresentationLayout>(createDefaultPresentationLayout);
  const [learnerPresentationOverride, setLearnerPresentationOverride] = useState<PresentationLayout | null>(null);
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
  const [learnerDeltaCount, setLearnerDeltaCount] = useState(0);
  const [learnerDeltaStatus, setLearnerDeltaStatus] = useState('idle');
  const [learnerCheckpoints, setLearnerCheckpoints] = useState<LearnerCheckpointView[]>([]);
  const [activeLearnerCheckpointId, setActiveLearnerCheckpointId] = useState('');
  const [isLearnerWorkspaceDirty, setIsLearnerWorkspaceDirty] = useState(false);
  const [isResumeConfirmationVisible, setIsResumeConfirmationVisible] = useState(false);
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
  const [liveMediaStream, setLiveMediaStream] = useState<MediaStream | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [mediaMimeType, setMediaMimeType] = useState('');
  const [draftRecordings, setDraftRecordings] = useState<InteractiveRecordingLibraryItem[]>([]);
  const [publishedRecordings, setPublishedRecordings] = useState<InteractiveRecordingLibraryItem[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [selectedPublishedRecordingId, setSelectedPublishedRecordingId] = useState('');
  const [recordingLibraryStatus, setRecordingLibraryStatus] = useState('idle');
  const [exportStatus, setExportStatus] = useState('idle');
  const [importStatus, setImportStatus] = useState('idle');
  const [demoDataStatus, setDemoDataStatus] = useState('idle');
  const [importPackageFileName, setImportPackageFileName] = useState('none');
  const [includeLearnerDeltasInExport, setIncludeLearnerDeltasInExport] = useState(false);

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

  function setLearnerWorkspaceDirty(isDirty: boolean) {
    learnerWorkspaceDirtyRef.current = isDirty;
    setIsLearnerWorkspaceDirty(isDirty);
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

  async function syncLearnerDeltaState(recording?: TeacherRecording, storage = getActiveLearnerStorage()) {
    const resolvedRecording = recording ?? (await storage.loadTeacherRecording());
    const deltas = resolvedRecording ? await loadScopedLearnerDeltas(resolvedRecording, storage) : [];
    const checkpointGroups = new Map<number, LearnerDelta[]>();

    for (const delta of deltas) {
      const timestampMs = Math.max(0, Math.round(delta.teacherTimestampMs));
      const group = checkpointGroups.get(timestampMs) ?? [];

      group.push(delta);
      checkpointGroups.set(timestampMs, group);
    }

    const checkpoints = [...checkpointGroups.entries()]
      .map(([teacherTimestampMs, versions]) => {
        const sortedVersions = [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const latest = sortedVersions.at(-1)!;
        const addedOrModifiedCount = Object.keys(latest.addedOrModified).length;
        const removedCount = latest.removed.length;

        return {
          id: latest.id,
          teacherTimestampMs,
          createdAt: latest.createdAt,
          changedFileCount: addedOrModifiedCount + removedCount,
          addedOrModifiedCount,
          removedCount,
          versionCount: versions.length,
          selectedFile: latest.selectedFile,
        } satisfies LearnerCheckpointView;
      })
      .sort((a, b) => a.teacherTimestampMs - b.teacherTimestampMs);

    setHasTeacherRecording(Boolean(resolvedRecording));
    setLearnerDeltaCount(deltas.length);
    setLearnerCheckpoints(checkpoints);
    setActiveLearnerCheckpointId((currentId) =>
      currentId && deltas.some((delta) => delta.id === currentId) ? currentId : '',
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

  function releaseRecordingTransitionGuard() {
    const token = playbackGuardTokenRef.current;

    window.setTimeout(() => {
      if (playbackGuardTokenRef.current === token) {
        isApplyingPlaybackRef.current = false;
      }
    }, 0);
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

  function setPresentationResourcesAndLayout(resources: PresentationResource[], layout: PresentationLayout) {
    const nextResources = clonePresentationResources(resources);
    const nextLayout = normalizePresentationLayout(nextResources, layout);

    presentationResourcesRef.current = nextResources;
    teacherPresentationLayoutRef.current = nextLayout;
    learnerPresentationOverrideRef.current = null;
    setPresentationResources(nextResources);
    setTeacherPresentationLayout(nextLayout);
    setLearnerPresentationOverride(null);
  }

  function applyTeacherPresentationLayout(layout: PresentationLayout) {
    const nextLayout = normalizePresentationLayout(presentationResourcesRef.current, layout);
    teacherPresentationLayoutRef.current = nextLayout;
    learnerPresentationOverrideRef.current = null;
    setTeacherPresentationLayout(nextLayout);
    setLearnerPresentationOverride(null);
  }

  function restoreInitialPresentation(recording: TeacherRecording) {
    const recordedResources = recording.presentationResources?.length
      ? recording.presentationResources
      : DEFAULT_PRESENTATION_RESOURCES;
    const hasWebcam = recording.mediaAssets?.some((asset) => asset.kind === 'webcam') ?? false;
    const resources = hasWebcam ? withInstructorCamera(recordedResources) : recordedResources;
    let initialLayout = recording.initialPresentationLayout ?? createPresentationLayout(resources);

    if (hasWebcam && !recording.presentationResources?.some((resource) => resource.kind === 'camera')) {
      initialLayout = setPresentationMode(resources, initialLayout, CAMERA_PRESENTATION_RESOURCE.id, 'minimized');
    }

    setPresentationResourcesAndLayout(resources, initialLayout);
  }

  function onTeacherPresentationModeChange(resourceId: string, mode: PresentationMode) {
    const nextLayout = setPresentationMode(
      presentationResourcesRef.current,
      teacherPresentationLayoutRef.current,
      resourceId,
      mode,
    );

    applyTeacherPresentationLayout(nextLayout);

    if (modeRef.current === 'idle' && recorderRef.current?.isRecording()) {
      recorderRef.current.append<PresentationChangedPayload>('presentation.changed', {
        payload: { layout: clonePresentationLayout(nextLayout) },
      });
      syncEventCount();
    }
  }

  function onLearnerPresentationModeChange(resourceId: string, mode: PresentationMode) {
    const baseLayout = learnerPresentationOverrideRef.current ?? teacherPresentationLayoutRef.current;
    const nextLayout = setPresentationMode(presentationResourcesRef.current, baseLayout, resourceId, mode);
    learnerPresentationOverrideRef.current = nextLayout;
    setLearnerPresentationOverride(nextLayout);
  }

  function reduceDeckAction(layout: PresentationLayout, deckId: string, action: DeckAction, slideIndex?: number) {
    if (action === 'next-reveal') return stepDeckReveal(presentationResourcesRef.current, layout, deckId, 1);
    if (action === 'previous-reveal') return stepDeckReveal(presentationResourcesRef.current, layout, deckId, -1);
    if (action === 'next-slide') return stepDeckSlide(presentationResourcesRef.current, layout, deckId, 1);
    if (action === 'previous-slide') return stepDeckSlide(presentationResourcesRef.current, layout, deckId, -1);
    return setDeckProgress(presentationResourcesRef.current, layout, deckId, { slideIndex: slideIndex ?? 0, revealedStep: 0 });
  }

  function recordTeacherPresentationLayout(nextLayout: PresentationLayout) {
    applyTeacherPresentationLayout(nextLayout);
    if (modeRef.current === 'idle' && recorderRef.current?.isRecording()) {
      recorderRef.current.append<PresentationChangedPayload>('presentation.changed', {
        payload: { layout: clonePresentationLayout(nextLayout) },
      });
      syncEventCount();
    }
  }

  function onTeacherDeckAction(deckId: string, action: DeckAction, slideIndex?: number) {
    recordTeacherPresentationLayout(reduceDeckAction(teacherPresentationLayoutRef.current, deckId, action, slideIndex));
  }

  function onLearnerDeckAction(deckId: string, action: DeckAction, slideIndex?: number) {
    const base = learnerPresentationOverrideRef.current ?? teacherPresentationLayoutRef.current;
    const nextLayout = reduceDeckAction(base, deckId, action, slideIndex);
    learnerPresentationOverrideRef.current = nextLayout;
    setLearnerPresentationOverride(nextLayout);
  }

  function onUpdatePresentationDeck(deck: DeckPresentationResource) {
    const nextResources = presentationResourcesRef.current.map((resource) => resource.id === deck.id ? structuredClone(deck) : resource);
    const nextLayout = normalizePresentationLayout(nextResources, teacherPresentationLayoutRef.current);
    setPresentationResourcesAndLayout(nextResources, nextLayout);
  }

  function onFollowTeacherPresentation() {
    learnerPresentationOverrideRef.current = null;
    setLearnerPresentationOverride(null);
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

    const baseFiles: FilesSnapshot = normalizeFiles(recording.baseFiles);

    for (const [filePath, content] of Object.entries(baseFiles)) {
      tutorialStore.restoreFile(filePath, content);
    }
  }

  function applyPlaybackEvent(event: TimelineEvent) {
    if (event.type === 'presentation.changed') {
      const payload = event.payload as PresentationChangedPayload | undefined;

      if (payload?.layout) {
        applyTeacherPresentationLayout(payload.layout);
      }

      return;
    }

    if (event.type === 'file.opened') {
      const payload = event.payload as { filePath?: string } | undefined;
      const filePath = event.filePath ?? payload?.filePath;

      if (filePath) {
        tutorialStore.setSelectedFile(normalizePath(filePath));
      }

      return;
    }

    if (event.type === 'file.created') {
      const payload = event.payload as { content?: string } | undefined;

      if (event.filePath) {
        tutorialStore.restoreFile(normalizePath(event.filePath), payload?.content ?? '');
      }

      return;
    }

    if (event.type === 'file.changed') {
      const payload = event.payload as FileChangedPayload | undefined;

      if (event.filePath && typeof payload?.content === 'string') {
        tutorialStore.restoreFile(normalizePath(event.filePath), payload.content);
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

  function restoreTeacherWorkspaceAt(currentTimeMs: number, recording = playbackRecordingRef.current) {
    if (!recording) {
      return;
    }

    const targetMs = Math.max(0, Math.round(currentTimeMs));
    const events = getSortedPlaybackEvents(recording);

    startPlaybackGuard();
    isApplyingPlaybackRef.current = true;
    restoreInitialPresentation(recording);
    applyRecordingBaseFiles(recording);

    let nextEventIndex = 0;

    while (nextEventIndex < events.length && events[nextEventIndex]!.tMs <= targetMs) {
      applyPlaybackEvent(events[nextEventIndex]!);
      nextEventIndex += 1;
    }

    playbackEventsRef.current = events;
    nextPlaybackEventIndexRef.current = nextEventIndex;
    setPlaybackTimestampMs(targetMs);
  }

  function replayEventsAt(currentTimeMs: number, recording = playbackRecordingRef.current) {
    restoreTeacherWorkspaceAt(currentTimeMs, recording);
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
      restoreInitialPresentation(recording);
      applyRecordingBaseFiles(recording);
    }

    const mediaElement = playbackMediaAssetRef.current?.blob ? getMediaPlaybackElement() : undefined;
    const playbackEndMs = getPlaybackEndMs(playbackEventsRef.current, recording, playbackMediaAssetRef.current);

    setRecordingDurationMs(playbackEndMs);
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

  function pausePlayback(nextMode: InteractiveMode, rememberLearnerTimestamp: boolean) {
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
    setHasPausedTeacherTimestamp(rememberLearnerTimestamp);
    stopPlayback('paused', nextMode);
  }

  function onContinuePlayback() {
    const recording = playbackRecordingRef.current;

    if (!recording || isRecording || modeRef.current !== 'idle') {
      return;
    }

    playRecordingFrom(playheadMsRef.current, { resetToBase: false }, recording);
  }

  function onPausePlayback() {
    if (isPlaying) {
      pausePlayback('learner-editing', true);
      setActiveLearnerCheckpointId('');
      learnerWorkspaceSavedHashRef.current = simpleHashFiles(getCurrentLearnerFiles());
      setLearnerWorkspaceDirty(false);
      return;
    }

    if (!playbackRecordingRef.current || modeRef.current !== 'idle') {
      return;
    }

    const pausedMs = playheadMsRef.current;

    setPausedTimestampMs(pausedMs);
    setHasPausedTeacherTimestamp(true);
    setPlaybackStatus('paused');
    setActiveLearnerCheckpointId('');
    learnerWorkspaceSavedHashRef.current = simpleHashFiles(getCurrentLearnerFiles());
    setLearnerWorkspaceDirty(false);
    setInteractiveMode('learner-editing');
  }

  function onPausePreviewPlayback() {
    pausePlayback('idle', false);
  }

  function onRestartPlayback() {
    const recording = playbackRecordingRef.current;

    if (!recording || isRecording) {
      return;
    }

    setHasPausedTeacherTimestamp(false);
    setPausedTimestampMs(0);
    playRecordingFrom(-1, { resetToBase: true }, recording);
  }

  function onSeekPlayback(timestampMs: number) {
    const recording = playbackRecordingRef.current;

    if (!recording || isRecording || modeRef.current === 'learner-editing') {
      return;
    }

    const events = getSortedPlaybackEvents(recording);
    const playbackEndMs = getPlaybackEndMs(events, recording, playbackMediaAssetRef.current);
    const targetMs = Math.max(0, Math.min(playbackEndMs, Math.round(timestampMs)));

    stopPlaybackDrivers({ pauseMedia: true });
    playbackEventsRef.current = events;
    playbackRecordingRef.current = recording;
    setInteractiveMode('teacher-playback');
    replayEventsAt(targetMs, recording);

    const mediaElement = playbackMediaAssetRef.current?.blob ? getMediaPlaybackElement() : undefined;

    if (mediaElement) {
      mediaElement.currentTime = targetMs / 1000;
    }

    setIsPlaying(false);
    setPlaybackStatus('paused');
    setPlaybackTimestampMs(targetMs);
    setPausedTimestampMs(targetMs);
    setHasPausedTeacherTimestamp(false);
    setInteractiveMode('idle');
    releasePlaybackGuardSoon();
  }

  function resumeTeacherPlayback() {
    const recording = playbackRecordingRef.current;

    if (!recording || modeRef.current !== 'learner-editing') {
      return;
    }

    const resumeTimestampMs = pausedTeacherTimestampMsRef.current;

    setIsResumeConfirmationVisible(false);
    setActiveLearnerCheckpointId('');
    learnerWorkspaceSavedHashRef.current = '';
    setLearnerWorkspaceDirty(false);
    setHasPausedTeacherTimestamp(false);
    setInteractiveMode('teacher-playback');
    restoreTeacherWorkspaceAt(resumeTimestampMs, recording);

    const mediaElement = playbackMediaAssetRef.current?.blob ? getMediaPlaybackElement() : undefined;

    if (mediaElement) {
      mediaElement.currentTime = resumeTimestampMs / 1000;
    }

    playRecordingFrom(resumeTimestampMs, { resetToBase: false }, recording);
  }

  function onResumeTeacher() {
    if (modeRef.current !== 'learner-editing') {
      return;
    }

    if (learnerWorkspaceDirtyRef.current) {
      setIsResumeConfirmationVisible(true);
      return;
    }

    resumeTeacherPlayback();
  }

  async function onSaveAndResumeTeacher() {
    if (await saveLearnerDelta()) {
      resumeTeacherPlayback();
    }
  }

  function onDiscardAndResumeTeacher() {
    resumeTeacherPlayback();
  }

  function onCancelResumeTeacher() {
    setIsResumeConfirmationVisible(false);
  }

  async function startRecording(mediaKindToRecord: MediaKindStatus): Promise<boolean> {
    if (!lessonFullyLoaded || modeRef.current !== 'idle') {
      return false;
    }

    stopPlaybackDrivers({ pauseMedia: true });
    const baseFiles: FilesSnapshot = getCurrentLearnerFiles();
    const recorder = new TimelineRecorder();
    let mediaRecorder: InteractiveMediaRecorder | null = null;
    let mediaPrepareError = '';

    setLiveMediaStream(null);
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
    const recordingResources = mediaRecorder && mediaKindToRecord === 'webcam'
      ? withInstructorCamera(presentationResourcesRef.current)
      : presentationResourcesRef.current;
    const recordingLayout = mediaRecorder && mediaKindToRecord === 'webcam'
      ? setPresentationMode(recordingResources, teacherPresentationLayoutRef.current, CAMERA_PRESENTATION_RESOURCE.id, 'minimized')
      : normalizePresentationLayout(recordingResources, teacherPresentationLayoutRef.current);

    setPresentationResourcesAndLayout(recordingResources, recordingLayout);

    const recording = getRecordingWithOwner(recorder.start({
      lessonId,
      version: 1,
      baseFiles,
      startedAtMs,
      presentationResources: recordingResources,
      initialPresentationLayout: recordingLayout,
    }));

    if (selectedFile) {
      recorder.append('file.opened', {
        filePath: selectedFile,
        payload: { filePath: normalizePath(selectedFile) },
        tMs: 0,
      });
    }

    if (mediaRecorder) {
      mediaRecorder.start({ recordingId: recording.id, startedAtMs });
      setLiveMediaStream(mediaRecorder.mediaStream ?? null);
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

    // Moving the editor and persistent preview into the recording shell may emit delayed
    // CodeMirror resize scroll callbacks. They are layout effects, not teacher intent.
    workspaceLayoutGuardUntilRef.current = Date.now() + 1500;
    startPlaybackGuard();
    releaseRecordingTransitionGuard();

    return true;
  }

  function onStartRecording() {
    return startRecording('none');
  }

  function onStartMicRecording() {
    return startRecording('audio');
  }

  function onStartCameraRecording() {
    return startRecording('webcam');
  }

  async function onStopRecording() {
    const stopped = recorderRef.current?.stop();
    const mediaRecorder = mediaRecorderRef.current;

    recorderRef.current = null;
    mediaRecorderRef.current = null;
    setLiveMediaStream(null);

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

      const localAssets = await localTimelineStorage.listMediaAssetsForRecording(recordingWithMedia.id);
      await Promise.all(localAssets.map((asset) => localTimelineStorage.deleteMediaAsset(asset.id)));
      await localTimelineStorage.deleteTeacherRecordingDraft(recordingWithMedia.id);
      saveTeacherRecording(recordingWithMedia);

      playbackRecordingRef.current = recordingWithMedia;
      setCurrentRecordingSource('published');
      setPublishedStatus('published');
      setPublishedRecordingId(recordingWithMedia.id);
      setSelectedPublishedRecordingId(recordingWithMedia.id);
      setSelectedDraftId('');
      setCurrentDraftRecording(null, 'missing');
      setRecordingDurationMs(recordingWithMedia.durationMs);
      setEventCount(recordingWithMedia.events.length);
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

  function onToggleIncludeLearnerDeltasInExport(checked: boolean) {
    setIncludeLearnerDeltasInExport(checked);
  }

  function onSelectImportPackageFile(file: File | null) {
    importPackageFileRef.current = file;
    setImportPackageFileName(file?.name ?? 'none');
    setImportStatus(file ? 'package selected' : 'idle');
  }

  async function getExportPackageSource() {
    const publishedId =
      selectedPublishedRecordingId ||
      (currentRecordingSourceRef.current === 'published' ? playbackRecordingRef.current?.id : undefined) ||
      (publishedRecordingId !== 'none' ? publishedRecordingId : undefined);

    if (publishedId) {
      return { recordingId: publishedId, storage: remoteTimelineStorage };
    }

    const draftId = selectedDraftId || currentDraftRecordingRef.current?.id;

    if (draftId) {
      return { recordingId: draftId, storage: localTimelineStorage };
    }

    return undefined;
  }

  async function exportSelectedRecording() {
    setExportStatus('exporting');

    try {
      const source = await getExportPackageSource();

      if (!source) {
        setExportStatus('error: choose a recording before exporting');
        return;
      }

      const user = currentUserRef.current;
      const recordingPackage = await exportRecordingPackage(source.recordingId, {
        storage: source.storage,
        includeLearnerDeltas: includeLearnerDeltasInExport,
        learnerDeltaQuery: includeLearnerDeltasInExport && user ? { userId: user.id } : undefined,
        packageMetadata: {
          title: 'Interactive recording export',
          description: 'Portable export package for thesis demos.',
          exportedByUserId: user?.id,
        },
      });
      const filename = await downloadRecordingPackage(recordingPackage);

      setExportStatus(`exported package ${recordingPackage.teacherRecording.id} to ${filename}`);
    } catch (error) {
      setExportStatus(error instanceof Error ? `error: export failed: ${error.message}` : 'error: export failed');
    }
  }

  function onExportRecording() {
    void exportSelectedRecording();
  }

  function formatImportPackageError(error: unknown) {
    if (error instanceof SyntaxError) {
      return 'error: import package could not be read. Choose a valid Export Package JSON file.';
    }

    if (error instanceof Error) {
      if (error.message.toLowerCase().includes('unsupported recording package formatversion')) {
        return 'error: unsupported package version. Export the package again with this app.';
      }

      return `error: import package failed: ${error.message}`;
    }

    return 'error: import package failed';
  }

  async function importSelectedPackage(modeToImport: 'local-draft' | 'published') {
    const file = importPackageFileRef.current;

    if (!file) {
      setImportStatus('error: choose an Export Package before importing');
      return;
    }

    if (modeToImport === 'published' && !canPublishInteractiveRecording(currentUserRef.current)) {
      setImportStatus('error: teacher sign-in required');
      return;
    }

    setImportStatus(modeToImport === 'published' ? 'importing published' : 'importing draft');

    try {
      const recordingPackage = await parseRecordingPackage(file);
      const storage = modeToImport === 'published' ? remoteTimelineStorage : localTimelineStorage;
      const result = await importRecordingPackage(recordingPackage, {
        storage,
        mode: modeToImport,
        importAsCopy: true,
        importedByUserId: currentUserRef.current?.id,
      });
      const recording = result.teacherRecording;

      playbackRecordingRef.current = recording;
      setRecordingDurationMs(recording.durationMs);
      setEventCount(recording.events.length);

      if (result.mediaAssets.length > 0) {
        setCurrentMediaAssets(result.mediaAssets, 'loaded');
      } else {
        setNoMedia(getInitialMediaStatus());
      }

      if (modeToImport === 'published') {
        setCurrentRecordingSource('published');
        setPublishedStatus('published');
        setPublishedRecordingId(recording.id);
        setSelectedPublishedRecordingId(recording.id);
        const warningText = result.warnings.length > 0 ? ` (${result.warnings.join(' ')})` : '';

        setImportStatus(`imported published copy ${recording.id}${warningText}`);
        await syncLearnerDeltaState(recording, remoteTimelineStorage);
      } else {
        setCurrentRecordingSource('local-draft');
        setCurrentDraftRecording(recording, 'loaded');
        setSelectedDraftId(recording.id);
        const warningText = result.warnings.length > 0 ? ` (${result.warnings.join(' ')})` : '';

        setImportStatus(`imported draft copy ${recording.id}${warningText}`);
        await syncLearnerDeltaState(recording, localTimelineStorage);
      }

      await refreshRecordingLibrary();
    } catch (error) {
      setImportStatus(formatImportPackageError(error));
    }
  }

  function onImportPackageAsDraft() {
    void importSelectedPackage('local-draft');
  }

  function onImportPackageAsPublished() {
    void importSelectedPackage('published');
  }

  function isDemoRecordingId(recordingId: string | undefined | null): boolean {
    return Boolean(recordingId?.startsWith(DEMO_RECORDING_ID_PREFIX));
  }

  async function deleteLocalDemoDrafts() {
    const drafts = await localTimelineStorage.listTeacherRecordingDrafts();

    for (const draft of drafts) {
      if (!isDemoRecordingId(draft.id)) {
        continue;
      }

      const assets = await localTimelineStorage.listMediaAssetsForRecording(draft.id);

      await Promise.all(assets.map((asset) => localTimelineStorage.deleteMediaAsset(asset.id)));
      await localTimelineStorage.deleteTeacherRecordingDraft(draft.id);
    }

    try {
      window.localStorage.removeItem('interactive-poc.teacherRecording');
      window.localStorage.removeItem('interactive-poc.learnerDeltas');
    } catch {
      // localStorage is best-effort for the explicit demo reset control.
    }
  }

  async function resetDemoData() {
    if (!canPublishInteractiveRecording(currentUserRef.current)) {
      setDemoDataStatus('teacher sign-in required');
      return;
    }

    setDemoDataStatus('resetting');

    try {
      await remoteTimelineStorage.resetDemoData();
      await deleteLocalDemoDrafts();

      if (isDemoRecordingId(currentDraftRecordingRef.current?.id)) {
        currentDraftRecordingRef.current = null;
        setDraftStatus('discarded');
        setCurrentDraftId('none');
      }

      if (isDemoRecordingId(playbackRecordingRef.current?.id)) {
        playbackRecordingRef.current = null;
        setCurrentRecordingSource('none');
        setPublishedStatus('idle');
        setPublishedRecordingId('none');
      }

      setSelectedDraftId('');
      setSelectedPublishedRecordingId('');
      setRecordingDurationMs(0);
      setEventCount(0);
      setNoMedia(getInitialMediaStatus());
      setDemoDataStatus('reset');
      await syncLearnerDeltaState(undefined, localTimelineStorage);
      await refreshRecordingLibrary();
    } catch (error) {
      setDemoDataStatus(error instanceof Error ? `error: ${error.message}` : 'error');
    }
  }

  function onResetDemoData() {
    void resetDemoData();
  }

  async function seedDemoData() {
    if (!canPublishInteractiveRecording(currentUserRef.current)) {
      setDemoDataStatus('teacher sign-in required');
      return;
    }

    setDemoDataStatus('seeding');

    try {
      const recording = await remoteTimelineStorage.seedDemoData();

      if (!recording) {
        setDemoDataStatus('missing seeded recording');
        return;
      }

      playbackRecordingRef.current = recording;
      setCurrentRecordingSource('published');
      setPublishedStatus('published');
      setPublishedRecordingId(recording.id);
      setSelectedPublishedRecordingId(recording.id);
      setRecordingDurationMs(recording.durationMs);
      setEventCount(recording.events.length);
      await syncMediaAssetsForRecording(recording, 'loaded', remoteTimelineStorage);
      await syncLearnerDeltaState(recording, remoteTimelineStorage);
      setDemoDataStatus(`seeded ${recording.id}`);
      await refreshRecordingLibrary();
    } catch (error) {
      setDemoDataStatus(error instanceof Error ? `error: ${error.message}` : 'error');
    }
  }

  function onDemoSeed() {
    void seedDemoData();
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

  async function saveLearnerDelta() {
    if (modeRef.current !== 'learner-editing' || !hasPausedTeacherTimestamp) {
      return false;
    }

    const user = currentUserRef.current;

    if (!user || !canSaveInteractiveLearnerWork(user)) {
      setLearnerDeltaStatus('sign in required');
      return false;
    }

    const storage = getActiveLearnerStorage();
    const recording = playbackRecordingRef.current ?? (await storage.loadTeacherRecording());

    setHasTeacherRecording(Boolean(recording));

    if (!recording) {
      setLearnerDeltaStatus('lecture unavailable');
      return false;
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
    setActiveLearnerCheckpointId(delta.id);
    learnerWorkspaceSavedHashRef.current = simpleHashFiles(learnerFiles);
    learnerSaveGuardUntilRef.current = Date.now() + 300;
    setLearnerWorkspaceDirty(false);
    setLearnerDeltaStatus('saved');
    await syncLearnerDeltaState(recording, storage);

    window.setTimeout(() => {
      if (modeRef.current === 'learner-editing') {
        learnerWorkspaceSavedHashRef.current = simpleHashFiles(getCurrentLearnerFiles());
        setLearnerWorkspaceDirty(false);
      }
    }, 300);

    return true;
  }

  function onSaveLearnerDelta() {
    void saveLearnerDelta();
  }

  function replaceWorkspaceFiles(filesInput: FilesSnapshot) {
    const files = normalizeFiles(filesInput);
    const currentFilePaths = tutorialStore.files
      .get()
      .filter((file) => file.type === 'file')
      .map((file) => normalizePath(file.path));

    for (const filePath of currentFilePaths) {
      if (!(filePath in files)) {
        tutorialStore.removeFile(filePath);
      }
    }

    for (const [filePath, content] of Object.entries(files)) {
      tutorialStore.restoreFile(filePath, content);
    }
  }

  async function openLearnerCheckpoint(checkpointId: string) {
    if (!canSaveInteractiveLearnerWork(currentUserRef.current)) {
      setLearnerDeltaStatus('sign in required');
      return;
    }

    const storage = getActiveLearnerStorage();
    const recording = playbackRecordingRef.current ?? (await storage.loadTeacherRecording());
    const deltas = recording ? await loadScopedLearnerDeltas(recording, storage) : [];
    const delta = deltas.find((candidate) => candidate.id === checkpointId);

    if (!recording || !delta) {
      setLearnerDeltaStatus('experiment unavailable');
      return;
    }

    const baseTeacherFiles = normalizeFiles(materializeTeacherState(recording, delta.teacherTimestampMs));

    if (
      delta.teacherRecordingId !== recording.id ||
      delta.teacherRecordingVersion !== recording.version ||
      simpleHashFiles(baseTeacherFiles) !== delta.baseTeacherFilesHash
    ) {
      setLearnerDeltaStatus('experiment belongs to another lecture version');
      return;
    }

    const restoredFiles = applyLearnerDelta(baseTeacherFiles, delta);

    stopPlaybackDrivers({ pauseMedia: true });
    startPlaybackGuard();
    isApplyingPlaybackRef.current = true;

    try {
      replaceWorkspaceFiles(restoredFiles);

      if (delta.selectedFile && restoredFiles[normalizePath(delta.selectedFile)] !== undefined) {
        tutorialStore.setSelectedFile(normalizePath(delta.selectedFile));
      }

      setPlaybackTimestampMs(delta.teacherTimestampMs);
      setPausedTimestampMs(delta.teacherTimestampMs);
      setHasPausedTeacherTimestamp(true);
      setPlaybackStatus('paused');
      setIsPlaying(false);
      setInteractiveMode('learner-editing');
      setActiveLearnerCheckpointId(delta.id);
      learnerWorkspaceSavedHashRef.current = simpleHashFiles(restoredFiles);
      setLearnerWorkspaceDirty(false);
      setLearnerDeltaStatus('experiment opened');

      const mediaElement = playbackMediaAssetRef.current?.blob ? getMediaPlaybackElement() : undefined;

      if (mediaElement) {
        mediaElement.currentTime = delta.teacherTimestampMs / 1000;
      }
    } finally {
      releasePlaybackGuardSoon();
      await syncLearnerDeltaState(recording, storage);
    }
  }

  function onOpenLearnerCheckpoint(checkpointId: string) {
    void openLearnerCheckpoint(checkpointId);
  }

  function onFileSelect(filePath: string | undefined) {
    tutorialStore.setSelectedFile(filePath);

    if (!filePath || modeRef.current !== 'idle' || isApplyingPlaybackRef.current || !recorderRef.current?.isRecording()) {
      return;
    }

    recorderRef.current.recordFileOpened(filePath);
    syncEventCount();
  }

  function onFileCreated(filePath: string, content = '') {
    if (
      modeRef.current === 'learner-editing' &&
      !isApplyingPlaybackRef.current &&
      Date.now() >= learnerSaveGuardUntilRef.current
    ) {
      setLearnerWorkspaceDirty(simpleHashFiles(getCurrentLearnerFiles()) !== learnerWorkspaceSavedHashRef.current);
      return;
    }

    if (modeRef.current !== 'idle' || isApplyingPlaybackRef.current || !recorderRef.current?.isRecording()) {
      return;
    }

    recorderRef.current.recordFileCreated(filePath, { content });
    syncEventCount();
  }

  function onWorkspaceLayoutChange() {
    workspaceLayoutGuardUntilRef.current = Date.now() + 400;
  }

  function onEditorScroll(position: EditorScrollPosition) {
    tutorialStore.setCurrentDocumentScrollPosition(position);

    const filePath = getCurrentFilePath();

    if (
      !filePath ||
      modeRef.current !== 'idle' ||
      isApplyingPlaybackRef.current ||
      Date.now() < workspaceLayoutGuardUntilRef.current ||
      !recorderRef.current?.isRecording()
    ) {
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

    if (
      modeRef.current === 'learner-editing' &&
      !isApplyingPlaybackRef.current &&
      Date.now() >= learnerSaveGuardUntilRef.current
    ) {
      setLearnerWorkspaceDirty(simpleHashFiles(getCurrentLearnerFiles()) !== learnerWorkspaceSavedHashRef.current);
    }

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
  const hasExportableRecording = Boolean(
    selectedPublishedRecordingId ||
      selectedDraftId ||
      currentDraftRecordingRef.current?.id ||
      (currentRecordingSourceRef.current === 'published' && playbackRecordingRef.current?.id),
  );
  const hasSelectedImportPackage = importPackageFileName !== 'none';

  return {
    controls: {
      isRecording,
      presentationResources,
      teacherPresentationLayout,
      presentationLayout: learnerPresentationOverride ?? teacherPresentationLayout,
      hasLearnerPresentationOverride: learnerPresentationOverride !== null,
      isPlaying,
      mode,
      playbackStatus,
      eventCount,
      playheadMs,
      pausedTeacherTimestampMs,
      learnerDeltaCount,
      learnerDeltaStatus,
      learnerCheckpoints,
      activeLearnerCheckpointId,
      isLearnerWorkspaceDirty,
      isResumeConfirmationVisible,
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
      liveMediaStream,
      draftRecordings,
      publishedRecordings,
      selectedDraftId,
      selectedPublishedRecordingId,
      recordingLibraryStatus,
      exportStatus,
      importStatus,
      demoDataStatus,
      importPackageFileName,
      includeLearnerDeltasInExport,
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
      canExportRecording: hasExportableRecording && !isRecording && mode === 'idle' && exportStatus !== 'exporting',
      canImportRecordingPackage: hasSelectedImportPackage && !isRecording && mode === 'idle' && !importStatus.startsWith('importing'),
      canImportPublishedPackage:
        hasSelectedImportPackage &&
        !isRecording &&
        mode === 'idle' &&
        !importStatus.startsWith('importing') &&
        canPublishAsTeacher,
      canSeedDemoData: !isRecording && mode === 'idle' && canPublishAsTeacher && demoDataStatus !== 'seeding',
      canResetDemoData: !isRecording && mode !== 'teacher-playback' && canPublishAsTeacher && demoDataStatus !== 'resetting',
      canPlayRecording: !isRecording && mode === 'idle',
      canPausePlayback: isPlaying,
      canSeekPlayback: Boolean(playbackRecordingRef.current) && !isRecording && mode !== 'learner-editing',
      canEnterLearnerWorkspace: Boolean(playbackRecordingRef.current) && !isRecording && mode !== 'learner-editing',
      canResumeTeacher: mode === 'learner-editing',
      canSaveLearnerDelta,
      onDevLogin,
      onLogout,
      onRefreshRecordingLibrary,
      onTeacherPresentationModeChange,
      onLearnerPresentationModeChange,
      onTeacherDeckAction,
      onLearnerDeckAction,
      onUpdatePresentationDeck,
      onFollowTeacherPresentation,
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
      onToggleIncludeLearnerDeltasInExport,
      onSelectImportPackageFile,
      onExportRecording,
      onImportPackageAsDraft,
      onImportPackageAsPublished,
      onDemoSeed,
      onResetDemoData,
      onPlayRecording,
      onContinuePlayback,
      onPausePlayback,
      onPausePreviewPlayback,
      onRestartPlayback,
      onSeekPlayback,
      onResumeTeacher,
      onSaveLearnerDelta,
      onOpenLearnerCheckpoint,
      onSaveAndResumeTeacher: () => void onSaveAndResumeTeacher(),
      onDiscardAndResumeTeacher,
      onCancelResumeTeacher,
      onMediaElementRef,
    },
    onFileSelect,
    onFileCreated,
    onWorkspaceLayoutChange,
    onEditorScroll,
    onEditorChange,
  };
}
