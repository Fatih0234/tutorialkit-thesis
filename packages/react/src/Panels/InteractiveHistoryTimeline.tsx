import { useEffect, useMemo, useState } from 'react';
import { classNames } from '../utils/classnames.js';
import {
  buildLearnerHistoryGraph,
  buildLearnerTimelineGroups,
  getLatestLearnerGraphSelection,
  type LearnerGraphNode,
  type LearnerTimelineGroup,
} from './interactive/history/learner-history-graph.js';
import type { InteractivePocControlsModel } from './useInteractivePoc.js';

interface Props {
  model: InteractivePocControlsModel;
  isLearner: boolean;
}

export function InteractiveHistoryTimeline({ model, isLearner }: Props) {
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>();
  const durationMs = Math.max(1, model.recordingDurationMs);
  const timelineValueMs = model.recordingDurationMs > 0
    ? Math.min(model.recordingDurationMs, Math.max(0, model.playheadMs))
    : 0;
  const playedPercent = (timelineValueMs / durationMs) * 100;
  const groups = useMemo(
    () => buildLearnerTimelineGroups(model.learnerBranchTimelineSummaries),
    [model.learnerBranchTimelineSummaries],
  );
  const activeBranch = model.learnerBranchTimelineSummaries.find((branch) => branch.branchId === model.activeLearnerBranchId);
  const activeGroupKey = activeBranch
    ? `${activeBranch.teacherTimestampMs}:${activeBranch.lastAppliedTeacherEventSeq}`
    : undefined;
  const selectedGroup = groups.find((group) => group.key === selectedGroupKey)
    ?? (model.workspaceOwner === 'learner' ? groups.find((group) => group.key === activeGroupKey) : undefined);

  useEffect(() => {
    if (model.workspaceOwner === 'learner' && activeGroupKey) setSelectedGroupKey(activeGroupKey);
    else if (model.isPlaying) setSelectedGroupKey(undefined);
  }, [activeGroupKey, model.isPlaying, model.workspaceOwner]);

  function openGroup(group: LearnerTimelineGroup) {
    const latest = getLatestLearnerGraphSelection(group);
    if (latest) model.onSelectLearnerGraphNode(latest.branchId, latest.kind, latest.commitId);
    else model.onOpenLearnerHistoryGroup();
    setSelectedGroupKey(group.key);
  }

  return (
    <div aria-label="Interactive history timeline" className="grid gap-1 text-[0.65rem] text-tk-text-secondary">
      <div className="grid grid-cols-[4rem_1fr] items-center gap-2">
        <strong className="text-blue-300">Lesson</strong>
        <div className="group relative h-8">
          <div className="absolute inset-x-0 top-3 h-1.5 overflow-hidden rounded-full bg-tk-background-active">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${playedPercent}%` }} />
          </div>

          {isLearner ? groups.map((group) => (
            <LessonHistoryMarker
              key={group.key}
              group={group}
              durationMs={durationMs}
              selected={selectedGroup?.key === group.key}
              onClick={() => openGroup(group)}
            />
          )) : null}

          {isLearner ? model.learnerCheckpoints.map((checkpoint) => (
            <button
              key={checkpoint.id}
              type="button"
              aria-label={`Open imported legacy checkpoint at ${checkpoint.teacherTimestampMs} milliseconds`}
              onClick={() => model.onOpenLearnerCheckpoint(checkpoint.id)}
              className="absolute top-0 z-20 grid h-8 w-8 -translate-x-1/2 cursor-pointer place-items-center rounded-full transition hover:scale-110 hover:bg-violet-500/15 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"
              style={{ left: `${positionPercent(checkpoint.teacherTimestampMs, durationMs)}%` }}
            >
              <span aria-hidden="true" className="h-3.5 w-3.5 rotate-45 border-2 border-violet-100 bg-violet-500 shadow" />
            </button>
          )) : null}

          <input
            type="range"
            aria-label="Lesson timeline"
            min={0}
            max={durationMs}
            step={1}
            value={timelineValueMs}
            disabled={!model.canSeekPlayback && !model.activeLearnerBranchId}
            onChange={(event) => model.onSelectTeacherTimelinePosition(Number(event.currentTarget.value))}
            className="absolute inset-0 z-10 h-7 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {isLearner && selectedGroup ? (
        <LearnerHistoryGraphLane model={model} group={selectedGroup} />
      ) : null}
    </div>
  );
}

function LessonHistoryMarker({
  group,
  durationMs,
  selected,
  onClick,
}: {
  group: LearnerTimelineGroup;
  durationMs: number;
  selected: boolean;
  onClick: () => void;
}) {
  const hasCheckpoints = group.checkpointCount > 0;
  const hasDirtyHead = group.dirtyHeadCount > 0;
  const summary = [
    group.checkpointCount > 0 ? `${group.checkpointCount} checkpoint${group.checkpointCount === 1 ? '' : 's'}` : '',
    group.dirtyHeadCount > 0 ? `${group.dirtyHeadCount} unsaved draft${group.dirtyHeadCount === 1 ? '' : 's'}` : '',
    group.branchCount > 1 ? `${group.branchCount} branches` : '',
  ].filter(Boolean).join(', ');

  return (
    <button
      type="button"
      aria-label={`Open my work at ${group.teacherTimestampMs} milliseconds, ${summary}`}
      aria-pressed={selected}
      title={`My work · ${summary}`}
      onClick={onClick}
      className={classNames(
        'absolute top-0 z-20 grid h-8 w-8 -translate-x-1/2 cursor-pointer place-items-center rounded-full transition duration-150 hover:scale-125 hover:bg-violet-500/15 active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-300',
        selected && 'bg-violet-500/20 ring-2 ring-white/50',
      )}
      style={{ left: `${positionPercent(group.teacherTimestampMs, durationMs)}%` }}
    >
      <span
        aria-hidden="true"
        className={classNames(
          'block h-4 w-4 border-2 shadow-md transition-transform',
          hasCheckpoints ? 'rotate-45 border-violet-100 bg-violet-500' : 'rounded-full border-orange-100 bg-orange-400',
        )}
      />
      {hasDirtyHead && hasCheckpoints ? (
        <span aria-hidden="true" className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border-2 border-tk-background-primary bg-orange-400" />
      ) : null}
      {group.checkpointCount + group.dirtyHeadCount > 1 || group.branchCount > 1 ? (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-violet-700 px-1 text-[0.55rem] font-bold text-white">
          {group.checkpointCount + group.dirtyHeadCount}
        </span>
      ) : null}
    </button>
  );
}

function LearnerHistoryGraphLane({ model, group }: { model: InteractivePocControlsModel; group: LearnerTimelineGroup }) {
  const graph = useMemo(() => buildLearnerHistoryGraph(group), [group]);

  return (
    <div className="grid grid-cols-[4rem_1fr] items-start gap-2">
      <strong className="pt-2 text-orange-300">My work</strong>
      <div aria-label="My work history graph" className="max-h-48 overflow-auto rounded-md border border-orange-400/20 bg-orange-950/15 py-1">
        <div className="relative" style={{ width: graph.width, height: graph.height }}>
          <svg aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${graph.width} ${graph.height}`} preserveAspectRatio="none">
            {graph.edges.map((edge) => (
              <line
                key={edge.id}
                x1={edge.fromX}
                y1={edge.fromY}
                x2={edge.toX}
                y2={edge.toY}
                className="stroke-orange-400/60"
                strokeWidth="2"
              />
            ))}
          </svg>
          {graph.nodes.map((node) => (
            <GraphNodeButton key={node.id} node={node} model={model} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GraphNodeButton({ node, model }: { node: LearnerGraphNode; model: InteractivePocControlsModel }) {
  const isActiveBranch = node.branchId === model.activeLearnerBranchId;
  const selected = isActiveBranch && (
    (node.kind === 'origin' && model.selectedLearnerEventSeq === 0)
    || (node.kind === 'commit' && model.selectedLearnerCommitId === node.commitId)
    || (node.kind === 'head' && model.learnerHistoryViewMode === 'head')
  );
  const label = node.kind === 'commit'
    ? `Checkpoint ${node.label}`
    : node.kind === 'head'
      ? node.label
      : node.label;

  return (
    <button
      type="button"
      aria-label={`${label}, branch ${node.branchId}${selected ? ', selected' : ''}`}
      aria-pressed={selected}
      title={node.description ? `${label} · ${node.description}` : label}
      onClick={() => model.onSelectLearnerGraphNode(node.branchId, node.kind, node.commitId)}
      className={classNames(
        'absolute z-10 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full transition duration-150 hover:scale-125 hover:bg-white/10 active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white',
        selected && 'bg-white/10 ring-2 ring-white/70',
      )}
      style={{ left: node.x, top: node.y }}
    >
      <span
        aria-hidden="true"
        className={classNames(
          'block border-2 shadow',
          node.kind === 'origin' && 'h-4 w-4 rounded-full border-blue-100 bg-blue-500',
          node.kind === 'commit' && 'h-4 w-4 rotate-45 border-violet-100 bg-violet-500',
          node.kind === 'head' && node.dirty && 'h-4 w-4 rounded-full border-orange-100 bg-orange-400',
          node.kind === 'head' && !node.dirty && 'h-4 w-4 rounded-full border-orange-200 bg-tk-background-primary',
        )}
      />
      <span className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2 whitespace-nowrap rounded bg-tk-background-primary/90 px-1 text-[0.58rem] text-tk-text-secondary">
        {label}
      </span>
    </button>
  );
}

function positionPercent(timestampMs: number, durationMs: number) {
  return Math.min(99.3, Math.max(0.7, (timestampMs / durationMs) * 100));
}
