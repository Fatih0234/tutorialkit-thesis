import { normalizeFiles, normalizePath } from '../path.js';
import type { FilesSnapshot } from '../types.js';
import type { LearnerBranch, LearnerHistoryEvent, LearnerFileChangedPayload } from './types.js';

export function materializeLearnerBranch(
  originFiles: FilesSnapshot,
  events: LearnerHistoryEvent[],
  untilEventSeq: number,
): FilesSnapshot {
  const files = normalizeFiles(originFiles);
  const orderedEvents = [...events].sort((a, b) => a.seq - b.seq);
  let previousSeq = 0;

  for (const event of orderedEvents) {
    if (!Number.isInteger(event.seq) || event.seq <= previousSeq) {
      throw new Error('Learner history events must have unique ascending positive sequences.');
    }

    previousSeq = event.seq;

    if (event.seq > untilEventSeq) {
      break;
    }

    applyEvent(files, event);
  }

  return { ...files };
}

export function materializeLearnerBranchGraph(
  teacherOriginFiles: FilesSnapshot,
  targetBranch: LearnerBranch,
  branches: LearnerBranch[],
  eventsByBranch: ReadonlyMap<string, LearnerHistoryEvent[]>,
  untilEventSeq = targetBranch.headEventSeq,
): FilesSnapshot {
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const visiting = new Set<string>();

  function materializeBase(branch: LearnerBranch): FilesSnapshot {
    if (!branch.parent) {
      return normalizeFiles(teacherOriginFiles);
    }

    if (visiting.has(branch.id)) {
      throw new Error('Learner branch ancestry contains a cycle.');
    }

    const parent = branchById.get(branch.parent.branchId);

    if (!parent) {
      throw new Error(`Missing parent learner branch: ${branch.parent.branchId}`);
    }

    visiting.add(branch.id);

    const parentBase = materializeBase(parent);
    const result = materializeLearnerBranch(parentBase, eventsByBranch.get(parent.id) ?? [], branch.parent.eventSeq);
    visiting.delete(branch.id);

    return result;
  }

  return materializeLearnerBranch(
    materializeBase(targetBranch),
    eventsByBranch.get(targetBranch.id) ?? [],
    untilEventSeq,
  );
}

function applyEvent(files: FilesSnapshot, event: LearnerHistoryEvent) {
  if (event.type === 'file.changed' || event.type === 'file.created') {
    const payload = event.payload as Partial<LearnerFileChangedPayload>;

    if (!event.filePath || typeof payload.content !== 'string') {
      throw new Error(`${event.type} requires a normalized file path and string content.`);
    }

    files[normalizePath(event.filePath)] = payload.content;

    return;
  }

  if (event.type === 'file.deleted') {
    if (!event.filePath) {
      throw new Error('file.deleted requires a file path.');
    }

    delete files[normalizePath(event.filePath)];

    return;
  }

  if (event.type === 'file.renamed') {
    const payload = event.payload as { from?: unknown; to?: unknown };

    if (typeof payload.from !== 'string' || typeof payload.to !== 'string') {
      throw new Error('file.renamed requires from and to paths.');
    }

    const from = normalizePath(payload.from);
    const to = normalizePath(payload.to);

    if (files[from] !== undefined) {
      files[to] = files[from];
      delete files[from];
    }

    return;
  }

  if (event.type === 'folder.deleted') {
    const path = folderPath(event);

    for (const filePath of Object.keys(files)) {
      if (filePath === path || filePath.startsWith(`${path}/`)) {
        delete files[filePath];
      }
    }

    return;
  }

  if (event.type === 'folder.renamed') {
    const payload = event.payload as { from?: unknown; to?: unknown };

    if (typeof payload.from !== 'string' || typeof payload.to !== 'string') {
      throw new Error('folder.renamed requires from and to paths.');
    }

    const from = normalizePath(payload.from);
    const to = normalizePath(payload.to);

    for (const [filePath, content] of Object.entries({ ...files })) {
      if (filePath.startsWith(`${from}/`)) {
        files[`${to}${filePath.slice(from.length)}`] = content;
        delete files[filePath];
      }
    }
  }
}

function folderPath(event: LearnerHistoryEvent) {
  if (event.filePath) {
    return normalizePath(event.filePath);
  }

  const payload = event.payload as { path?: unknown };

  if (typeof payload.path !== 'string') {
    throw new Error(`${event.type} requires a folder path.`);
  }

  return normalizePath(payload.path);
}
