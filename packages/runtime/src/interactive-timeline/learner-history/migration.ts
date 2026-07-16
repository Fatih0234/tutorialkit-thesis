import { applyLearnerDelta, simpleHashFiles } from '../learner-delta.js';
import { normalizeFiles } from '../path.js';
import type { FilesSnapshot, LearnerDelta } from '../types.js';
import { createLearnerBranch } from './branch.js';
import type { LearnerCommit, LearnerHistoryEvent } from './types.js';

export function convertLegacyLearnerDelta(
  delta: LearnerDelta,
  originFilesInput: FilesSnapshot,
): ReturnType<typeof createLearnerBranch> & { events: LearnerHistoryEvent[]; commits: LearnerCommit[] } {
  const originFiles = normalizeFiles(originFilesInput);
  const resultFiles = applyLearnerDelta(originFiles, delta);
  const { branch, workingTree } = createLearnerBranch({
    id: `imported-branch-${delta.id}`,
    userId: delta.userId,
    lessonId: delta.lessonId,
    origin: {
      teacherRecordingId: delta.teacherRecordingId,
      teacherRecordingVersion: delta.teacherRecordingVersion,
      teacherTimestampMs: delta.teacherTimestampMs,
      lastAppliedTeacherEventSeq: delta.lastAppliedTeacherEventSeq ?? Number.MAX_SAFE_INTEGER,
      baseTeacherFilesHash: delta.baseTeacherFilesHash,
    },
    initialFiles: resultFiles,
    selectedFile: delta.selectedFile,
    now: delta.createdAt,
  });
  const events: LearnerHistoryEvent[] = [];

  for (const filePath of delta.removed) {
    events.push({
      schemaVersion: 1,
      id: `imported-event-${delta.id}-${events.length + 1}`,
      branchId: branch.id,
      seq: events.length + 1,
      createdAt: delta.createdAt,
      type: 'file.deleted',
      filePath,
      payload: { importedDeltaId: delta.id },
    });
  }

  for (const [filePath, content] of Object.entries(delta.addedOrModified)) {
    events.push({
      schemaVersion: 1,
      id: `imported-event-${delta.id}-${events.length + 1}`,
      branchId: branch.id,
      seq: events.length + 1,
      createdAt: delta.createdAt,
      type: originFiles[filePath] === undefined ? 'file.created' : 'file.changed',
      filePath,
      payload: { content, importedDeltaId: delta.id },
    });
  }

  const eventSeq = events.length;
  const commit: LearnerCommit = {
    schemaVersion: 1,
    id: `imported-commit-${delta.id}`,
    branchId: branch.id,
    eventSeq,
    name: 'Imported experiment',
    filesHash: simpleHashFiles(resultFiles),
    filesSnapshot: resultFiles,
    selectedFile: delta.selectedFile,
    createdAt: delta.createdAt,
  };

  return {
    branch: { ...branch, headEventSeq: eventSeq },
    workingTree: {
      ...workingTree,
      filesSnapshot: resultFiles,
      latestEventSeq: eventSeq,
      latestCommitId: commit.id,
      latestCommitFilesHash: commit.filesHash,
      dirty: false,
    },
    events,
    commits: [commit],
  };
}
