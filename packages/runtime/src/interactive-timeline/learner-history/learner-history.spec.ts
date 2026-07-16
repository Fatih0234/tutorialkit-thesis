import { describe, expect, it } from 'vitest';
import { simpleHashFiles } from '../learner-delta.js';
import {
  appendLearnerHistoryEvent,
  createLearnerBranch,
  createLearnerCommit,
  forkLearnerBranch,
  markWorkingTreeCommitted,
} from './branch.js';
import { materializeLearnerBranch, materializeLearnerBranchGraph } from './materialize.js';
import { convertLegacyLearnerDelta } from './migration.js';
import { generateLearnerCommitName } from './naming.js';

const origin = {
  teacherRecordingId: 'recording',
  teacherRecordingVersion: 1,
  teacherTimestampMs: 100,
  lastAppliedTeacherEventSeq: 4,
  baseTeacherFilesHash: simpleHashFiles({ '/src/App.js': 'base' }),
};

describe('learner history', () => {
  it('creates a normalized branch and appends ordered immutable events', () => {
    const created = createLearnerBranch({
      id: 'branch',
      userId: 'learner',
      lessonId: 'lesson',
      origin,
      initialFiles: { 'src/App.js': 'base' },
      now: '2026-01-01T00:00:00.000Z',
    });
    const first = appendLearnerHistoryEvent({
      branch: created.branch,
      id: 'event-1',
      now: '2026-01-01T00:00:01.000Z',
      type: 'file.changed',
      filePath: 'src/App.js',
      payload: { content: 'changed' },
    });

    expect(created.workingTree.filesSnapshot).toEqual({ '/src/App.js': 'base' });
    expect(first.event).toMatchObject({ branchId: 'branch', seq: 1, filePath: '/src/App.js' });
    expect(first.branch.headEventSeq).toBe(1);
    expect(created.branch.headEventSeq).toBe(0);
  });

  it('materializes file changes, creation, deletion, and rename', () => {
    const events = [
      { schemaVersion: 1 as const, id: '1', branchId: 'b', seq: 1, createdAt: '1', type: 'file.changed' as const, filePath: 'a.js', payload: { content: 'A1' } },
      { schemaVersion: 1 as const, id: '2', branchId: 'b', seq: 2, createdAt: '2', type: 'file.created' as const, filePath: 'b.js', payload: { content: 'B' } },
      { schemaVersion: 1 as const, id: '3', branchId: 'b', seq: 3, createdAt: '3', type: 'file.renamed' as const, payload: { from: 'b.js', to: 'c.js' } },
      { schemaVersion: 1 as const, id: '4', branchId: 'b', seq: 4, createdAt: '4', type: 'file.deleted' as const, filePath: 'a.js', payload: {} },
    ];

    expect(materializeLearnerBranch({ '/a.js': 'A' }, events, 3)).toEqual({ '/a.js': 'A1', '/c.js': 'B' });
    expect(materializeLearnerBranch({ '/a.js': 'A' }, events, 4)).toEqual({ '/c.js': 'B' });
  });

  it('forks historical state without changing the parent branch', () => {
    const parent = createLearnerBranch({ id: 'parent', userId: 'u', lessonId: 'l', origin, initialFiles: { '/a': 'base' } });
    const first = appendLearnerHistoryEvent({ branch: parent.branch, id: 'p1', type: 'file.changed', filePath: '/a', payload: { content: 'one' } });
    const second = appendLearnerHistoryEvent({ branch: first.branch, id: 'p2', type: 'file.changed', filePath: '/a', payload: { content: 'two' } });
    const child = forkLearnerBranch({
      id: 'child',
      parentBranch: second.branch,
      parentEventSeq: 1,
      initialFiles: { '/a': 'one' },
    });
    const childEvent = appendLearnerHistoryEvent({ branch: child.branch, id: 'c1', type: 'file.changed', filePath: '/a', payload: { content: 'forked' } });
    const events = new Map([
      ['parent', [first.event, second.event]],
      ['child', [childEvent.event]],
    ]);

    expect(materializeLearnerBranchGraph({ '/a': 'base' }, childEvent.branch, [second.branch, childEvent.branch], events)).toEqual({ '/a': 'forked' });
    expect(materializeLearnerBranchGraph({ '/a': 'base' }, second.branch, [second.branch, childEvent.branch], events)).toEqual({ '/a': 'two' });
    expect(second.branch.headEventSeq).toBe(2);
    expect(childEvent.branch.parent).toEqual({ branchId: 'parent', eventSeq: 1, commitId: undefined });
  });

  it('creates commits only when the working tree differs from the latest commit', () => {
    const created = createLearnerBranch({ userId: 'u', lessonId: 'l', origin, initialFiles: { '/a': 'one' } });
    const first = createLearnerCommit({ branch: created.branch, workingTree: created.workingTree, name: 'calm-orbit', id: 'c1' });
    expect(first?.filesHash).toBe(simpleHashFiles({ '/a': 'one' }));

    const clean = markWorkingTreeCommitted(created.workingTree, first!);
    expect(createLearnerCommit({ branch: created.branch, workingTree: clean, name: 'unused' })).toBeUndefined();
  });

  it('generates collision-safe human-readable names', () => {
    expect(generateLearnerCommitName(['calm-orbit', 'calm-orbit-2'], () => 0)).toBe('calm-orbit-3');
  });

  it('converts a legacy delta into a recoverable imported commit', () => {
    const migrated = convertLegacyLearnerDelta({
      id: 'legacy',
      userId: 'learner',
      lessonId: 'lesson',
      teacherRecordingId: 'recording',
      teacherRecordingVersion: 1,
      teacherTimestampMs: 100,
      lastAppliedTeacherEventSeq: 4,
      baseTeacherFilesHash: origin.baseTeacherFilesHash,
      addedOrModified: { '/new.js': 'new' },
      removed: ['/old.js'],
      createdAt: '2026-01-01T00:00:00.000Z',
    }, { '/old.js': 'old' });

    expect(migrated.commits[0]).toMatchObject({ name: 'Imported experiment', eventSeq: 2 });
    expect(materializeLearnerBranch({ '/old.js': 'old' }, migrated.events, 2)).toEqual({ '/new.js': 'new' });
  });

  it('rejects malformed event ordering', () => {
    expect(() => materializeLearnerBranch({}, [
      { schemaVersion: 1, id: 'bad', branchId: 'b', seq: 0, createdAt: 'now', type: 'file.deleted', filePath: '/a', payload: {} },
    ], 1)).toThrow(/ascending positive sequences/);
  });
});
