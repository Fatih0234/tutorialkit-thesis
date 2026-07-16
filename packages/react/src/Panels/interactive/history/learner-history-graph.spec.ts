import { describe, expect, it } from 'vitest';
import { buildLearnerHistoryGraph, buildLearnerTimelineGroups, getLatestLearnerGraphSelection, type LearnerTimelineBranchSummary } from './learner-history-graph.js';

const root: LearnerTimelineBranchSummary = {
  branchId: 'root',
  teacherTimestampMs: 8000,
  lastAppliedTeacherEventSeq: 4,
  commits: [{ id: 'commit-a', branchId: 'root', eventSeq: 2, name: 'quiet-cedar', createdAt: '2025-01-01T00:00:01Z' }],
  headEventSeq: 3,
  latestCommitId: 'commit-a',
  dirty: true,
  headUpdatedAt: '2025-01-01T00:00:04Z',
  fileChanges: [{ path: '/main.py', status: 'modified' }],
  createdAt: '2025-01-01T00:00:00Z',
};

const child: LearnerTimelineBranchSummary = {
  branchId: 'child',
  teacherTimestampMs: 8000,
  lastAppliedTeacherEventSeq: 4,
  parent: { branchId: 'root', eventSeq: 2, commitId: 'commit-a' },
  commits: [{ id: 'commit-b', branchId: 'child', eventSeq: 1, name: 'soft-river', createdAt: '2025-01-01T00:00:03Z' }],
  headEventSeq: 1,
  latestCommitId: 'commit-b',
  dirty: false,
  headUpdatedAt: '2025-01-01T00:00:03Z',
  fileChanges: [{ path: '/helper.py', status: 'added' }],
  createdAt: '2025-01-01T00:00:02Z',
};

describe('learner history graph presentation', () => {
  it('groups checkpoints and dirty heads at their exact lesson position', () => {
    const groups = buildLearnerTimelineGroups([root, child]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ checkpointCount: 2, dirtyHeadCount: 1, branchCount: 2 });
  });

  it('includes complete fork topology without individual autosave nodes', () => {
    const graph = buildLearnerHistoryGraph(buildLearnerTimelineGroups([root, child])[0]);
    expect(graph.nodes.map((node) => node.kind)).toEqual(['origin', 'commit', 'head', 'origin', 'commit', 'head']);
    expect(graph.nodes.map((node) => node.label)).toEqual([
      'Started here', 'Checkpoint 1', 'Autosaved draft',
      'Alternative 1 started here', 'Checkpoint 1', 'Alternative 1 · Latest work',
    ]);
    expect(graph.nodes.some((node) => node.id.includes('event'))).toBe(false);
    const forkEdge = graph.edges.find((edge) => edge.id === 'child:parent');
    const parentCommit = graph.nodes.find((node) => node.id === 'commit-a');
    expect(forkEdge?.fromX).toBe(parentCommit?.x);
    expect(forkEdge?.fromY).toBe(parentCommit?.y);
  });

  it('selects the latest dirty head, otherwise the newest checkpoint', () => {
    const group = buildLearnerTimelineGroups([root, child])[0];
    expect(getLatestLearnerGraphSelection(group)).toEqual({ branchId: 'root', kind: 'head' });
    expect(getLatestLearnerGraphSelection(buildLearnerTimelineGroups([{ ...root, dirty: false }])[0])).toEqual({
      branchId: 'root',
      kind: 'commit',
      commitId: 'commit-a',
    });
  });

  it('renders a dirty branch with no checkpoint as an autosaved history group', () => {
    const dirtyOnly = { ...root, branchId: 'draft', commits: [], latestCommitId: undefined };
    expect(buildLearnerTimelineGroups([dirtyOnly])[0]).toMatchObject({ checkpointCount: 0, dirtyHeadCount: 1 });
  });
});
