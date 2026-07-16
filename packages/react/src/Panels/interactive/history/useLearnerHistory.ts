import {
  IndexedDBLearnerHistoryStorage,
  RemoteLearnerHistoryStorage,
  appendLearnerHistoryEvent,
  createLearnerBranch,
  createLearnerCommit,
  forkLearnerBranch,
  generateLearnerCommitName,
  markWorkingTreeCommitted,
  convertLegacyLearnerDelta,
  materializeLearnerBranch,
  normalizeFiles,
  normalizePath,
  simpleHashFiles,
  type FilesSnapshot,
  type LearnerBranch,
  type LearnerBranchAggregate,
  type LearnerBranchQuery,
  type LearnerCommit,
  type LearnerFileChangedPayload,
  type LearnerHistoryEvent,
  type LearnerHistoryRemoteStorage,
  type LearnerHistoryStorage,
  type LearnerOrigin,
  type LearnerDelta,
  type LearnerWorkingTree,
} from '@tutorialkit/runtime';
import { useEffect, useRef, useState } from 'react';
import { logLearnerHistoryEvent } from './observability.js';

const storage = new IndexedDBLearnerHistoryStorage();
const remoteStorage = new RemoteLearnerHistoryStorage();

interface CreateBranchOptions {
  userId: string;
  lessonId: string;
  origin: LearnerOrigin;
  initialFiles: FilesSnapshot;
  selectedFile?: string;
}

interface FileChangeOptions {
  filePath: string;
  content: string;
  selection?: { anchor: number; head: number };
  filesSnapshot: FilesSnapshot;
  selectedFile?: string;
}

export interface LearnerBranchHistorySummary {
  branch: LearnerBranch;
  commits: Array<Pick<LearnerCommit, 'id' | 'branchId' | 'eventSeq' | 'name' | 'parentCommitId' | 'createdAt'>>;
  headEventSeq: number;
  latestCommitId?: string;
  dirty: boolean;
  headUpdatedAt: string;
  filesSnapshot: FilesSnapshot;
}

export function useLearnerHistory(
  historyStorage: LearnerHistoryStorage = storage,
  historyRemoteStorage: LearnerHistoryRemoteStorage = remoteStorage,
) {
  const branchRef = useRef<LearnerBranch>();
  const treeRef = useRef<LearnerWorkingTree>();
  const commitsRef = useRef<LearnerCommit[]>([]);
  const eventsRef = useRef<LearnerHistoryEvent[]>([]);
  const selectedFilesRef = useRef<FilesSnapshot>();
  const branchBaseFilesRef = useRef<FilesSnapshot>();
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistenceTokenRef = useRef(0);
  const remoteSyncTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const remoteSyncTokenRef = useRef(0);
  const [activeBranch, setActiveBranch] = useState<LearnerBranch>();
  const [branches, setBranches] = useState<LearnerBranch[]>([]);
  const [workingTree, setWorkingTree] = useState<LearnerWorkingTree>();
  const [branchBaseFiles, setBranchBaseFiles] = useState<FilesSnapshot>();
  const [commits, setCommits] = useState<LearnerCommit[]>([]);
  const [commitCountsByBranch, setCommitCountsByBranch] = useState<Record<string, number>>({});
  const [branchHistorySummaries, setBranchHistorySummaries] = useState<LearnerBranchHistorySummary[]>([]);
  const [events, setEvents] = useState<LearnerHistoryEvent[]>([]);
  const [selectedEventSeq, setSelectedEventSeq] = useState<number>();
  const [selectedCommitId, setSelectedCommitId] = useState<string>();
  const [viewMode, setViewMode] = useState<'none' | 'head' | 'historical'>('none');
  const [status, setStatus] = useState('idle');
  const [remoteStatus, setRemoteStatus] = useState('idle');
  const [lastCommitName, setLastCommitName] = useState('');

  const branchIdsKey = branches.map((branch) => branch.id).join(':');

  useEffect(() => {
    let cancelled = false;
    void Promise.all(branches.map(async (branch): Promise<LearnerBranchHistorySummary | undefined> => {
      const [storedCommits, storedTree] = await Promise.all([
        historyStorage.loadCommits(branch.id),
        historyStorage.loadWorkingTree(branch.id),
      ]);
      if (!storedTree) return undefined;
      return {
        branch,
        commits: storedCommits.map(toCommitSummary),
        headEventSeq: branch.headEventSeq,
        latestCommitId: storedTree.latestCommitId,
        dirty: storedTree.dirty,
        headUpdatedAt: storedTree.updatedAt,
        filesSnapshot: storedTree.filesSnapshot,
      };
    })).then((summaries) => {
      if (cancelled) return;
      const loaded = summaries.filter((summary): summary is LearnerBranchHistorySummary => Boolean(summary));
      setBranchHistorySummaries((current) => branches.flatMap((branch) => {
        const currentSummary = current.find((summary) => summary.branch.id === branch.id);
        if (branch.id === branchRef.current?.id && currentSummary) return [currentSummary];
        const loadedSummary = loaded.find((summary) => summary.branch.id === branch.id);
        return loadedSummary ? [loadedSummary] : currentSummary ? [currentSummary] : [];
      }));
    });
    return () => { cancelled = true; };
  }, [branchIdsKey, historyStorage]);

  useEffect(() => {
    if (!activeBranch || !workingTree) return;
    const activeSummary: LearnerBranchHistorySummary = {
      branch: activeBranch,
      commits: commits.map(toCommitSummary),
      headEventSeq: activeBranch.headEventSeq,
      latestCommitId: workingTree.latestCommitId,
      dirty: workingTree.dirty,
      headUpdatedAt: workingTree.updatedAt,
      filesSnapshot: workingTree.filesSnapshot,
    };
    setBranchHistorySummaries((current) => current.some((summary) => summary.branch.id === activeBranch.id)
      ? current.map((summary) => summary.branch.id === activeBranch.id ? activeSummary : summary)
      : [activeSummary, ...current]);
  }, [activeBranch, commits, workingTree]);

  useEffect(() => {
    const flushOnHide = () => {
      if (document.visibilityState === 'hidden') void syncActiveBranchRemote();
    };
    document.addEventListener('visibilitychange', flushOnHide);
    return () => {
      document.removeEventListener('visibilitychange', flushOnHide);
      if (remoteSyncTimerRef.current) clearTimeout(remoteSyncTimerRef.current);
    };
  }, []);

  function createBranch(options: CreateBranchOptions) {
    const created = createLearnerBranch(options);
    branchRef.current = created.branch;
    treeRef.current = created.workingTree;
    commitsRef.current = [];
    eventsRef.current = [];
    selectedFilesRef.current = created.workingTree.filesSnapshot;
    branchBaseFilesRef.current = created.workingTree.filesSnapshot;
    setBranchBaseFiles(created.workingTree.filesSnapshot);
    setActiveBranch(created.branch);
    setBranches((current) => [created.branch, ...current.filter((branch) => branch.id !== created.branch.id)]);
    setWorkingTree(created.workingTree);
    setCommits([]);
    setCommitCountsByBranch((current) => ({ ...current, [created.branch.id]: 0 }));
    setEvents([]);
    setSelectedEventSeq(0);
    setSelectedCommitId(undefined);
    setViewMode('head');
    setStatus('saving draft');
    void queuePersistence(() => persistBranchShell(created.branch, created.workingTree));
    void syncAggregateRemote(toAggregate(created.branch, created.workingTree, [], []));
    logLearnerHistoryEvent('branch.created', { branchId: created.branch.id, teacherTimestampMs: created.branch.origin.teacherTimestampMs });

    return created.branch;
  }

  function recordFileChange(options: FileChangeOptions) {
    const branch = branchRef.current;
    const tree = treeRef.current;

    if (!branch || !tree) {
      return;
    }

    const normalizedFiles = normalizeFiles(options.filesSnapshot);

    if (simpleHashFiles(normalizedFiles) === simpleHashFiles(tree.filesSnapshot)) {
      return;
    }

    const appended = appendLearnerHistoryEvent<LearnerFileChangedPayload>({
      branch,
      type: 'file.changed',
      filePath: options.filePath,
      payload: { content: options.content, selection: options.selection },
    });
    const nextTree: LearnerWorkingTree = {
      ...tree,
      filesSnapshot: normalizedFiles,
      selectedFile: options.selectedFile ? normalizePath(options.selectedFile) : tree.selectedFile,
      selectionByFile: options.selection
        ? { ...tree.selectionByFile, [normalizePath(options.filePath)]: options.selection }
        : tree.selectionByFile,
      latestEventSeq: appended.event.seq,
      dirty: simpleHashFiles(normalizedFiles) !== tree.latestCommitFilesHash,
      updatedAt: appended.event.createdAt,
    };

    branchRef.current = appended.branch;
    treeRef.current = nextTree;
    eventsRef.current = [...eventsRef.current, appended.event];
    selectedFilesRef.current = nextTree.filesSnapshot;
    setActiveBranch(appended.branch);
    setBranches((current) => current.map((candidate) => candidate.id === appended.branch.id ? appended.branch : candidate));
    setWorkingTree(nextTree);
    setEvents(eventsRef.current);
    setSelectedEventSeq(appended.event.seq);
    setSelectedCommitId(undefined);
    setViewMode('head');
    setStatus('saving draft');
    void queuePersistence(() => persistEvent(appended.branch, appended.event, nextTree));
    scheduleRemoteSync();
    logLearnerHistoryEvent('learner-event.appended', { branchId: appended.branch.id, eventSeq: appended.event.seq, type: appended.event.type });
  }

  function recordFileCreated(filePath: string, content: string, filesInput: FilesSnapshot) {
    const branch = branchRef.current;
    const tree = treeRef.current;

    if (!branch || !tree) {
      return;
    }

    const appended = appendLearnerHistoryEvent({
      branch,
      type: 'file.created',
      filePath,
      payload: { content },
    });
    const nextTree: LearnerWorkingTree = {
      ...tree,
      filesSnapshot: normalizeFiles(filesInput),
      selectedFile: normalizePath(filePath),
      latestEventSeq: appended.event.seq,
      dirty: true,
      updatedAt: appended.event.createdAt,
    };

    branchRef.current = appended.branch;
    treeRef.current = nextTree;
    eventsRef.current = [...eventsRef.current, appended.event];
    selectedFilesRef.current = nextTree.filesSnapshot;
    setActiveBranch(appended.branch);
    setBranches((current) => current.map((candidate) => candidate.id === appended.branch.id ? appended.branch : candidate));
    setWorkingTree(nextTree);
    setEvents(eventsRef.current);
    setSelectedEventSeq(appended.event.seq);
    setSelectedCommitId(undefined);
    setViewMode('head');
    setStatus('saving draft');
    void queuePersistence(() => persistEvent(appended.branch, appended.event, nextTree));
    scheduleRemoteSync();
    logLearnerHistoryEvent('learner-event.appended', { branchId: appended.branch.id, eventSeq: appended.event.seq, type: appended.event.type });
  }

  async function commitCurrent(filesInput: FilesSnapshot, selectedFile?: string): Promise<LearnerCommit | undefined> {
    let branch = branchRef.current;
    let tree = treeRef.current;

    if (!branch || !tree) {
      setStatus('nothing to save');
      return undefined;
    }

    const filesSnapshot = normalizeFiles(filesInput);

    if (simpleHashFiles(filesSnapshot) !== simpleHashFiles(tree.filesSnapshot)) {
      const selectedPath = selectedFile ? normalizePath(selectedFile) : tree.selectedFile;
      const content = selectedPath ? filesSnapshot[selectedPath] : undefined;

      if (selectedPath && typeof content === 'string') {
        recordFileChange({ filePath: selectedPath, content, filesSnapshot, selectedFile: selectedPath });
        branch = branchRef.current;
        tree = treeRef.current;
      }
    }

    if (!branch || !tree || !tree.dirty) {
      setStatus('nothing to save');
      return undefined;
    }

    const commit = createLearnerCommit({
      branch,
      workingTree: { ...tree, filesSnapshot, selectedFile: selectedFile ? normalizePath(selectedFile) : tree.selectedFile },
      parentCommitId: tree.latestCommitId,
      name: generateLearnerCommitName(commitsRef.current.map((candidate) => candidate.name)),
    });

    if (!commit) {
      setStatus('nothing to save');
      return undefined;
    }

    const nextTree = markWorkingTreeCommitted(
      { ...tree, filesSnapshot, selectedFile: commit.selectedFile },
      commit,
    );
    commitsRef.current = [...commitsRef.current, commit];
    treeRef.current = nextTree;
    selectedFilesRef.current = nextTree.filesSnapshot;
    setCommits(commitsRef.current);
    setCommitCountsByBranch((current) => ({ ...current, [branch.id]: commitsRef.current.length }));
    setWorkingTree(nextTree);
    setLastCommitName(commit.name);
    setSelectedEventSeq(commit.eventSeq);
    setSelectedCommitId(commit.id);
    setViewMode('head');
    setStatus('saving checkpoint');

    await persistenceQueueRef.current;

    try {
      await historyStorage.saveCommit(commit);
      await historyStorage.saveWorkingTree(nextTree);
      await historyStorage.saveBranch(branch);
      setStatus(`checkpoint saved: ${commit.name}`);
      await syncAggregateRemote(toAggregate(branch, nextTree, eventsRef.current, commitsRef.current));
      logLearnerHistoryEvent('commit.created', { branchId: branch.id, commitId: commit.id, eventSeq: commit.eventSeq });
    } catch {
      setStatus('saved in memory; local persistence failed');
    }

    return commit;
  }

  function importLegacyDelta(delta: LearnerDelta, originFiles: FilesSnapshot) {
    const migrated = convertLegacyLearnerDelta(delta, originFiles);
    branchRef.current = migrated.branch;
    treeRef.current = migrated.workingTree;
    commitsRef.current = migrated.commits;
    eventsRef.current = migrated.events;
    selectedFilesRef.current = migrated.workingTree.filesSnapshot;
    branchBaseFilesRef.current = originFiles;
    setBranchBaseFiles(originFiles);
    setActiveBranch(migrated.branch);
    setBranches((current) => [migrated.branch, ...current.filter((branch) => branch.id !== migrated.branch.id)]);
    setWorkingTree(migrated.workingTree);
    setCommits(migrated.commits);
    setCommitCountsByBranch((current) => ({ ...current, [migrated.branch.id]: migrated.commits.length }));
    setEvents(migrated.events);
    setSelectedEventSeq(migrated.branch.headEventSeq);
    setSelectedCommitId(migrated.commits[0]?.id);
    setViewMode('head');
    setLastCommitName(migrated.commits[0]?.name ?? '');
    setStatus('imported experiment');
    void queuePersistence(async () => {
      await historyStorage.saveBranch(migrated.branch);
      await historyStorage.appendEvents(migrated.branch.id, migrated.events);
      for (const commit of migrated.commits) await historyStorage.saveCommit(commit);
      await historyStorage.saveWorkingTree(migrated.workingTree);
    }, 'imported experiment');
    void syncAggregateRemote(toAggregate(migrated.branch, migrated.workingTree, migrated.events, migrated.commits));

    return migrated.branch;
  }

  async function restoreLatest(query: LearnerBranchQuery) {
    await pullRemoteBranches(query);
    const storedBranches = await historyStorage.listBranches(query);
    setBranches(storedBranches);
    const storedCommitEntries = await Promise.all(
      storedBranches.map(async (branch) => [branch.id, (await historyStorage.loadCommits(branch.id)).length] as const),
    );
    setCommitCountsByBranch(Object.fromEntries(storedCommitEntries));

    for (const branch of storedBranches) {
      const tree = await historyStorage.loadWorkingTree(branch.id);

      if (!tree) {
        continue;
      }

      const loadedCommits = await historyStorage.loadCommits(branch.id);
      const loadedEvents = await historyStorage.loadEvents(branch.id);
      branchRef.current = branch;
      treeRef.current = tree;
      commitsRef.current = loadedCommits;
      eventsRef.current = loadedEvents;
      selectedFilesRef.current = tree.filesSnapshot;
      branchBaseFilesRef.current = undefined;
      setBranchBaseFiles(undefined);
      setActiveBranch(branch);
      setWorkingTree(tree);
      setCommits(loadedCommits);
      setEvents(loadedEvents);
      setSelectedEventSeq(branch.headEventSeq);
      setSelectedCommitId(loadedCommits.at(-1)?.id);
      setViewMode('head');
      setLastCommitName(loadedCommits.at(-1)?.name ?? '');
      setStatus(tree.dirty ? 'dirty draft restored' : 'checkpoint restored');

      return { branch, tree, events: loadedEvents, commits: loadedCommits };
    }

    return undefined;
  }

  function selectEvent(originFiles: FilesSnapshot, eventSeq: number) {
    const branch = branchRef.current;

    if (!branch || eventSeq < 0 || eventSeq > branch.headEventSeq) {
      return undefined;
    }

    const files = materializeLearnerBranch(branchBaseFilesRef.current ?? originFiles, eventsRef.current, eventSeq);
    selectedFilesRef.current = files;
    setSelectedEventSeq(eventSeq);
    setSelectedCommitId(undefined);
    setViewMode(eventSeq === branch.headEventSeq ? 'head' : 'historical');
    setStatus(eventSeq === branch.headEventSeq ? 'head selected' : 'viewing earlier version');
    logLearnerHistoryEvent('history.position.selected', { branchId: branch.id, eventSeq });

    return files;
  }

  function selectCommit(commitId: string) {
    const branch = branchRef.current;
    const tree = treeRef.current;
    const commit = commitsRef.current.find((candidate) => candidate.id === commitId);

    if (!branch || !tree || !commit) {
      return undefined;
    }

    const isHead = commit.eventSeq === branch.headEventSeq && commit.filesHash === simpleHashFiles(tree.filesSnapshot);
    selectedFilesRef.current = commit.filesSnapshot;
    setSelectedEventSeq(commit.eventSeq);
    setSelectedCommitId(commit.id);
    setViewMode(isHead ? 'head' : 'historical');
    setStatus(isHead ? 'head selected' : `viewing checkpoint: ${commit.name}`);

    return { files: normalizeFiles(commit.filesSnapshot), selectedFile: commit.selectedFile };
  }

  function selectHead() {
    const branch = branchRef.current;
    const tree = treeRef.current;

    if (!branch || !tree) {
      return undefined;
    }

    selectedFilesRef.current = tree.filesSnapshot;
    setSelectedEventSeq(branch.headEventSeq);
    setSelectedCommitId(tree.latestCommitId);
    setViewMode('head');
    setStatus('head selected');

    return { files: normalizeFiles(tree.filesSnapshot), selectedFile: tree.selectedFile };
  }

  function forkFromSelectedHistory() {
    const parentBranch = branchRef.current;
    const selectedFiles = selectedFilesRef.current;

    if (!parentBranch || !selectedFiles || viewMode !== 'historical' || selectedEventSeq === undefined) {
      return undefined;
    }

    const created = forkLearnerBranch({
      parentBranch,
      parentEventSeq: selectedEventSeq,
      parentCommitId: selectedCommitId,
      initialFiles: selectedFiles,
      selectedFile: treeRef.current?.selectedFile,
    });
    branchRef.current = created.branch;
    treeRef.current = created.workingTree;
    eventsRef.current = [];
    commitsRef.current = [];
    branchBaseFilesRef.current = normalizeFiles(selectedFiles);
    setBranchBaseFiles(normalizeFiles(selectedFiles));
    selectedFilesRef.current = normalizeFiles(selectedFiles);
    setActiveBranch(created.branch);
    setBranches((current) => [created.branch, ...current]);
    setWorkingTree(created.workingTree);
    setEvents([]);
    setCommits([]);
    setCommitCountsByBranch((current) => ({ ...current, [created.branch.id]: 0 }));
    setSelectedEventSeq(0);
    setSelectedCommitId(undefined);
    setViewMode('head');
    setLastCommitName('');
    setStatus('branch forked');
    void queuePersistence(() => persistBranchShell(created.branch, created.workingTree), 'branch forked');
    void syncAggregateRemote(toAggregate(created.branch, created.workingTree, [], []));
    logLearnerHistoryEvent('branch.forked', { branchId: created.branch.id, parentBranchId: parentBranch.id, parentEventSeq: selectedEventSeq });

    return created.branch;
  }

  async function resolveBranchBaseFiles(branch: LearnerBranch, teacherOriginFiles: FilesSnapshot): Promise<FilesSnapshot> {
    if (!branch.parent) {
      return normalizeFiles(teacherOriginFiles);
    }

    const parent = branches.find((candidate) => candidate.id === branch.parent!.branchId)
      ?? await historyStorage.loadBranch(branch.parent.branchId);

    if (!parent) {
      throw new Error(`Missing parent learner branch: ${branch.parent.branchId}`);
    }

    const parentBase = await resolveBranchBaseFiles(parent, teacherOriginFiles);
    const parentEvents = await historyStorage.loadEvents(parent.id);
    return materializeLearnerBranch(parentBase, parentEvents, branch.parent.eventSeq);
  }

  async function resolveActiveBranchBase(teacherOriginFiles: FilesSnapshot) {
    const branch = branchRef.current;
    if (!branch) return undefined;
    const base = await resolveBranchBaseFiles(branch, teacherOriginFiles);
    branchBaseFilesRef.current = base;
    setBranchBaseFiles(base);
    return base;
  }

  async function switchBranch(branchId: string, teacherOriginFiles: FilesSnapshot) {
    const branch = branches.find((candidate) => candidate.id === branchId)
      ?? await historyStorage.loadBranch(branchId);

    if (!branch) {
      return undefined;
    }

    const [tree, loadedEvents, loadedCommits] = await Promise.all([
      historyStorage.loadWorkingTree(branch.id),
      historyStorage.loadEvents(branch.id),
      historyStorage.loadCommits(branch.id),
    ]);

    if (!tree) {
      return undefined;
    }

    branchRef.current = branch;
    treeRef.current = tree;
    eventsRef.current = loadedEvents;
    commitsRef.current = loadedCommits;
    branchBaseFilesRef.current = await resolveBranchBaseFiles(branch, teacherOriginFiles);
    setBranchBaseFiles(branchBaseFilesRef.current);
    selectedFilesRef.current = tree.filesSnapshot;
    setActiveBranch(branch);
    setWorkingTree(tree);
    setEvents(loadedEvents);
    setCommits(loadedCommits);
    setCommitCountsByBranch((current) => ({ ...current, [branch.id]: loadedCommits.length }));
    setSelectedEventSeq(branch.headEventSeq);
    setSelectedCommitId(tree.latestCommitId);
    setViewMode('head');
    setLastCommitName(loadedCommits.at(-1)?.name ?? '');
    setStatus('branch selected');

    return { branch, tree };
  }

  function clearActiveBranch() {
    if (remoteSyncTimerRef.current) clearTimeout(remoteSyncTimerRef.current);
    remoteSyncTimerRef.current = undefined;
    branchRef.current = undefined;
    treeRef.current = undefined;
    commitsRef.current = [];
    eventsRef.current = [];
    selectedFilesRef.current = undefined;
    branchBaseFilesRef.current = undefined;
    setBranchBaseFiles(undefined);
    setActiveBranch(undefined);
    setWorkingTree(undefined);
    setCommits([]);
    setEvents([]);
    setSelectedEventSeq(undefined);
    setSelectedCommitId(undefined);
    setViewMode('none');
    setLastCommitName('');
    setStatus('idle');
  }

  function toAggregate(
    branch: LearnerBranch,
    tree: LearnerWorkingTree,
    branchEvents: LearnerHistoryEvent[],
    branchCommits: LearnerCommit[],
  ): LearnerBranchAggregate {
    return {
      schemaVersion: 1,
      branch,
      events: branchEvents,
      commits: branchCommits,
      workingTree: tree,
    };
  }

  async function saveAggregateLocally(aggregate: LearnerBranchAggregate) {
    await historyStorage.saveBranch(aggregate.branch);
    await historyStorage.appendEvents(aggregate.branch.id, aggregate.events);
    for (const commit of aggregate.commits) await historyStorage.saveCommit(commit);
    await historyStorage.saveWorkingTree(aggregate.workingTree);
  }

  async function syncAggregateRemote(aggregate: LearnerBranchAggregate) {
    const token = ++remoteSyncTokenRef.current;
    setRemoteStatus('syncing');
    try {
      const result = await historyRemoteStorage.syncAggregate(aggregate);
      if (remoteSyncTokenRef.current !== token) return result;
      await saveAggregateLocally(result.aggregate);
      if (result.outcome === 'forked' && branchRef.current?.id === aggregate.branch.id) {
        branchRef.current = result.aggregate.branch;
        treeRef.current = result.aggregate.workingTree;
        eventsRef.current = result.aggregate.events;
        commitsRef.current = result.aggregate.commits;
        setActiveBranch(result.aggregate.branch);
        setWorkingTree(result.aggregate.workingTree);
        setEvents(result.aggregate.events);
        setCommits(result.aggregate.commits);
        setCommitCountsByBranch((current) => ({
          ...current,
          [result.aggregate.branch.id]: result.aggregate.commits.length,
        }));
        setBranches((current) => [result.aggregate.branch, ...current]);
      }
      setRemoteStatus(result.outcome === 'forked' ? 'divergence preserved as fork' : 'synced');
      return result;
    } catch {
      if (remoteSyncTokenRef.current === token) setRemoteStatus('sync pending');
      logLearnerHistoryEvent('history.sync.failed', { branchId: aggregate.branch.id });
      return undefined;
    }
  }

  function scheduleRemoteSync() {
    remoteSyncTokenRef.current += 1;
    setRemoteStatus('sync pending');
    if (remoteSyncTimerRef.current) clearTimeout(remoteSyncTimerRef.current);
    remoteSyncTimerRef.current = setTimeout(() => void syncActiveBranchRemote(), 2000);
  }

  async function syncActiveBranchRemote() {
    const branch = branchRef.current;
    const tree = treeRef.current;
    if (!branch || !tree) return undefined;
    await persistenceQueueRef.current;
    return syncAggregateRemote(toAggregate(branch, tree, eventsRef.current, commitsRef.current));
  }

  async function pullRemoteBranches(query: LearnerBranchQuery) {
    try {
      const aggregates = await historyRemoteStorage.listAggregates(query);
      for (const aggregate of aggregates) {
        const localBranch = await historyStorage.loadBranch(aggregate.branch.id);
        if (localBranch) {
          const localEvents = await historyStorage.loadEvents(localBranch.id);
          const localTree = await historyStorage.loadWorkingTree(localBranch.id);
          const localCommits = await historyStorage.loadCommits(localBranch.id);
          const localAggregate = localTree ? toAggregate(localBranch, localTree, localEvents, localCommits) : undefined;
          if (localAggregate && (localBranch.headEventSeq > aggregate.branch.headEventSeq
            || (localBranch.headEventSeq === aggregate.branch.headEventSeq
              && JSON.stringify(localEvents) !== JSON.stringify(aggregate.events)))) {
            await syncAggregateRemote(localAggregate);
            continue;
          }
        }
        await saveAggregateLocally(aggregate);
      }
      if (aggregates.length > 0) setRemoteStatus('synced');
    } catch {
      setRemoteStatus('offline; using local history');
    }
  }

  function queuePersistence(task: () => Promise<void>, successStatus = 'draft autosaved') {
    const token = ++persistenceTokenRef.current;
    const runTask = async () => {
      try {
        await task();
        if (persistenceTokenRef.current === token) {
          setStatus(successStatus);
        }
      } catch {
        if (persistenceTokenRef.current === token) {
          setStatus('draft in memory; local persistence failed');
        }
      }
    };
    persistenceQueueRef.current = persistenceQueueRef.current.then(runTask, runTask);
    return persistenceQueueRef.current;
  }

  async function persistBranchShell(branch: LearnerBranch, tree: LearnerWorkingTree) {
    await historyStorage.saveBranch(branch);
    await historyStorage.saveWorkingTree(tree);
  }

  async function persistEvent(
    branch: LearnerBranch,
    event: Parameters<LearnerHistoryStorage['appendEvents']>[1][number],
    tree: LearnerWorkingTree,
  ) {
    await historyStorage.appendEvents(branch.id, [event]);
    await historyStorage.saveWorkingTree(tree);
    await historyStorage.saveBranch(branch);
  }

  function toCommitSummary(commit: LearnerCommit): LearnerBranchHistorySummary['commits'][number] {
    return {
      id: commit.id,
      branchId: commit.branchId,
      eventSeq: commit.eventSeq,
      name: commit.name,
      parentCommitId: commit.parentCommitId,
      createdAt: commit.createdAt,
    };
  }

  const checkpointFiles = commits.at(-1)?.filesSnapshot ?? branchBaseFiles;
  const changedFilePaths = workingTree && checkpointFiles
    ? Object.keys(workingTree.filesSnapshot).filter((path) => workingTree.filesSnapshot[path] !== checkpointFiles[path])
    : [];

  return {
    activeBranch,
    branches,
    commitCountsByBranch,
    branchHistorySummaries,
    workingTree,
    changedFilePaths,
    commits,
    events,
    selectedEventSeq,
    selectedCommitId,
    viewMode,
    status,
    remoteStatus,
    lastCommitName,
    createBranch,
    recordFileChange,
    recordFileCreated,
    commitCurrent,
    restoreLatest,
    importLegacyDelta,
    selectEvent,
    selectCommit,
    selectHead,
    forkFromSelectedHistory,
    switchBranch,
    resolveActiveBranchBase,
    hasActiveBranch: () => Boolean(branchRef.current),
    clearActiveBranch,
  };
}
