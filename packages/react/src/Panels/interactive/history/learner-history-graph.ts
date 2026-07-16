export interface LearnerTimelineCommitSummary {
  id: string;
  branchId: string;
  eventSeq: number;
  name: string;
  parentCommitId?: string;
  createdAt: string;
}

export interface LearnerFileChangeSummary {
  path: string;
  status: 'added' | 'modified' | 'removed';
}

export interface LearnerTimelineBranchSummary {
  branchId: string;
  teacherTimestampMs: number;
  lastAppliedTeacherEventSeq: number;
  parent?: { branchId: string; eventSeq: number; commitId?: string };
  commits: LearnerTimelineCommitSummary[];
  headEventSeq: number;
  latestCommitId?: string;
  dirty: boolean;
  headUpdatedAt: string;
  createdAt: string;
  fileChanges: LearnerFileChangeSummary[];
}

export interface LearnerTimelineGroup {
  key: string;
  teacherTimestampMs: number;
  lastAppliedTeacherEventSeq: number;
  checkpointCount: number;
  dirtyHeadCount: number;
  branchCount: number;
  branches: LearnerTimelineBranchSummary[];
}

export type LearnerGraphNodeKind = 'origin' | 'commit' | 'head';

export interface LearnerGraphNode {
  id: string;
  branchId: string;
  kind: LearnerGraphNodeKind;
  x: number;
  y: number;
  eventSeq: number;
  commitId?: string;
  label: string;
  description?: string;
  dirty?: boolean;
}

export interface LearnerGraphEdge {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface LearnerHistoryGraph {
  nodes: LearnerGraphNode[];
  edges: LearnerGraphEdge[];
  width: number;
  height: number;
}

export interface LatestLearnerGraphSelection {
  branchId: string;
  kind: 'commit' | 'head';
  commitId?: string;
}

export function getLatestLearnerGraphSelection(group: LearnerTimelineGroup): LatestLearnerGraphSelection | undefined {
  const candidates: Array<LatestLearnerGraphSelection & { timestamp: string }> = group.branches.flatMap(
    (branch): Array<LatestLearnerGraphSelection & { timestamp: string }> => {
      if (branch.dirty) {
        return [{ branchId: branch.branchId, kind: 'head' as const, timestamp: branch.headUpdatedAt }];
      }

      const latestCommit = [...branch.commits].sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      )[0];

      return latestCommit
        ? [
            {
              branchId: branch.branchId,
              kind: 'commit' as const,
              commitId: latestCommit.id,
              timestamp: latestCommit.createdAt,
            },
          ]
        : [];
    },
  );

  const latest = candidates.sort(
    (a, b) => b.timestamp.localeCompare(a.timestamp) || b.branchId.localeCompare(a.branchId),
  )[0];

  if (!latest) {
    return undefined;
  }

  return { branchId: latest.branchId, kind: latest.kind, commitId: latest.commitId };
}

export function buildLearnerTimelineGroups(branches: LearnerTimelineBranchSummary[]): LearnerTimelineGroup[] {
  const groups = new Map<string, LearnerTimelineGroup>();

  for (const branch of branches) {
    if (branch.commits.length === 0 && !branch.dirty) {
      continue;
    }

    const key = `${branch.teacherTimestampMs}:${branch.lastAppliedTeacherEventSeq}`;
    const existing = groups.get(key);

    if (existing) {
      existing.branches.push(branch);
      existing.checkpointCount += branch.commits.length;
      existing.dirtyHeadCount += branch.dirty ? 1 : 0;
      existing.branchCount += 1;
    } else {
      groups.set(key, {
        key,
        teacherTimestampMs: branch.teacherTimestampMs,
        lastAppliedTeacherEventSeq: branch.lastAppliedTeacherEventSeq,
        checkpointCount: branch.commits.length,
        dirtyHeadCount: branch.dirty ? 1 : 0,
        branchCount: 1,
        branches: [branch],
      });
    }
  }

  return [...groups.values()].sort((a, b) => a.teacherTimestampMs - b.teacherTimestampMs);
}

export function buildLearnerHistoryGraph(group: LearnerTimelineGroup): LearnerHistoryGraph {
  const branchesById = new Map(group.branches.map((branch) => [branch.branchId, branch]));
  const children = new Map<string, LearnerTimelineBranchSummary[]>();
  const roots: LearnerTimelineBranchSummary[] = [];

  for (const branch of group.branches) {
    if (branch.parent && branchesById.has(branch.parent.branchId)) {
      const siblings = children.get(branch.parent.branchId) ?? [];
      siblings.push(branch);
      children.set(branch.parent.branchId, siblings);
    } else {
      roots.push(branch);
    }
  }

  const byCreatedAt = (a: LearnerTimelineBranchSummary, b: LearnerTimelineBranchSummary) =>
    a.createdAt.localeCompare(b.createdAt) || a.branchId.localeCompare(b.branchId);
  roots.sort(byCreatedAt);

  for (const siblings of children.values()) {
    siblings.sort(byCreatedAt);
  }

  const ordered: LearnerTimelineBranchSummary[] = [];
  const visit = (branch: LearnerTimelineBranchSummary) => {
    ordered.push(branch);

    for (const child of children.get(branch.branchId) ?? []) {
      visit(child);
    }
  };

  for (const root of roots) {
    visit(root);
  }

  const nodes: LearnerGraphNode[] = [];
  const edges: LearnerGraphEdge[] = [];
  const nodesByBranch = new Map<string, LearnerGraphNode[]>();
  let maxX = 0;

  ordered.forEach((branch, row) => {
    const y = 24 + row * 64;
    const parentAnchor = branch.parent
      ? findParentAnchor(nodesByBranch.get(branch.parent.branchId), branch.parent)
      : undefined;
    const originX = parentAnchor ? parentAnchor.x + 42 : 28;
    const branchNodes: LearnerGraphNode[] = [
      {
        id: `${branch.branchId}:origin`,
        branchId: branch.branchId,
        kind: 'origin',
        x: originX,
        y,
        eventSeq: 0,
        label: branch.parent ? `Alternative ${row} started here` : 'Started here',
      },
    ];

    if (parentAnchor) {
      edges.push({
        id: `${branch.branchId}:parent`,
        fromX: parentAnchor.x,
        fromY: parentAnchor.y,
        toX: originX,
        toY: y,
      });
    }

    const commits = [...branch.commits].sort(
      (a, b) => a.eventSeq - b.eventSeq || a.createdAt.localeCompare(b.createdAt),
    );

    for (const [index, commit] of commits.entries()) {
      branchNodes.push({
        id: commit.id,
        branchId: branch.branchId,
        kind: 'commit',
        commitId: commit.id,
        eventSeq: commit.eventSeq,
        x: originX + (index + 1) * 112,
        y,
        label: `Checkpoint ${index + 1}`,
        description: commit.name,
      });
    }

    const lastNode = branchNodes.at(-1)!;
    branchNodes.push({
      id: `${branch.branchId}:head`,
      branchId: branch.branchId,
      kind: 'head',
      eventSeq: branch.headEventSeq,
      x: lastNode.x + 112,
      y,
      label: branch.parent
        ? `Alternative ${row} · ${branch.dirty ? 'Autosaved draft' : 'Latest work'}`
        : branch.dirty
          ? 'Autosaved draft'
          : 'Latest work',
      dirty: branch.dirty,
    });

    for (let index = 1; index < branchNodes.length; index += 1) {
      const from = branchNodes[index - 1];
      const to = branchNodes[index];
      edges.push({ id: `${branch.branchId}:${index}`, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y });
    }

    nodes.push(...branchNodes);
    nodesByBranch.set(branch.branchId, branchNodes);
    maxX = Math.max(maxX, branchNodes.at(-1)!.x);
  });

  return {
    nodes,
    edges,
    width: Math.max(360, maxX + 36),
    height: Math.max(64, ordered.length * 64),
  };
}

function findParentAnchor(
  parentNodes: LearnerGraphNode[] | undefined,
  parent: { eventSeq: number; commitId?: string },
) {
  if (!parentNodes?.length) {
    return undefined;
  }

  if (parent.commitId) {
    const exactCommit = parentNodes.find((node) => node.commitId === parent.commitId);

    if (exactCommit) {
      return exactCommit;
    }
  }

  const candidates = parentNodes.filter((node) => node.eventSeq <= parent.eventSeq);

  return candidates.at(-1) ?? parentNodes[0];
}
