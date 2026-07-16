import { formatInteractiveTime } from '../../InteractivePocUi.js';
import { getLatestLearnerGraphSelection, type LearnerTimelineGroup } from './learner-history-graph.js';

export function MyWorkSessionCard({ group, current, onOpen }: { group: LearnerTimelineGroup; current: boolean; onOpen: () => void }) {
  const latest = getLatestLearnerGraphSelection(group);
  const latestBranch = group.branches.find((branch) => branch.branchId === latest?.branchId) ?? group.branches[0];
  const changes = latestBranch?.fileChanges ?? [];
  const alternatives = Math.max(0, group.branchCount - 1);
  const hasDraft = latestBranch?.dirty ?? false;

  return (
    <article className={`rounded-lg border bg-tk-background-secondary p-3 transition ${current ? 'border-orange-400 ring-1 ring-orange-400/30' : 'border-tk-border-primary'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong className="block text-sm text-tk-text-primary">{hasDraft ? 'Autosaved draft' : 'Checkpointed work'}</strong>
          <span className="text-xs text-tk-text-secondary">Started at lesson {formatInteractiveTime(group.teacherTimestampMs)}</span>
        </div>
        {current ? <span className="rounded-full bg-orange-500/15 px-2 py-1 text-[0.65rem] font-semibold text-orange-200">Currently open</span> : null}
      </div>

      <p className="my-2 text-xs text-tk-text-secondary">Edited {formatRelativeTime(getWorkGroupUpdatedAt(group))}</p>

      {changes.length > 0 ? (
        <details className="mb-3 rounded border border-tk-border-primary/70 bg-tk-background-primary/40 px-2 py-1.5">
          <summary className="cursor-pointer text-xs font-medium text-tk-text-primary">
            {changes.length} file{changes.length === 1 ? '' : 's'} changed
          </summary>
          <ul className="m-0 mt-2 grid list-none gap-1 p-0">
            {changes.map((change) => (
              <li key={change.path} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-mono text-tk-text-primary" title={change.path}>{change.path.split('/').at(-1)}</span>
                <span className={change.status === 'added' ? 'text-green-300' : change.status === 'removed' ? 'text-red-300' : 'text-amber-300'}>
                  {capitalize(change.status)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="my-2 text-xs text-tk-text-secondary">No file differences from the lesson starting state.</p>
      )}

      <div className="mb-3 flex flex-wrap gap-x-2 gap-y-1 text-[0.68rem] text-tk-text-secondary">
        <span>{group.checkpointCount} checkpoint{group.checkpointCount === 1 ? '' : 's'}</span>
        <span aria-hidden="true">·</span>
        <span>{alternatives === 0 ? '1 version path' : `${alternatives} alternative path${alternatives === 1 ? '' : 's'}`}</span>
        {group.dirtyHeadCount > 0 ? <><span aria-hidden="true">·</span><span>{group.dirtyHeadCount} draft{group.dirtyHeadCount === 1 ? '' : 's'}</span></> : null}
      </div>

      <button type="button" onClick={onOpen} className="flex w-full items-center justify-center gap-1.5 rounded bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-400 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        <span className="i-ph-arrow-square-out" aria-hidden="true" />
        Open work
      </button>
    </article>
  );
}

export function getWorkGroupUpdatedAt(group: LearnerTimelineGroup) {
  return group.branches.flatMap((branch) => [branch.headUpdatedAt, ...branch.commits.map((commit) => commit.createdAt)])
    .sort((a, b) => b.localeCompare(a))[0] ?? new Date(0).toISOString();
}

export function countCheckpoints(groups: LearnerTimelineGroup[]) {
  return groups.reduce((total, group) => total + group.checkpointCount, 0);
}

export function countDrafts(groups: LearnerTimelineGroup[]) {
  return groups.reduce((total, group) => total + group.dirtyHeadCount, 0);
}

function formatRelativeTime(timestamp: string) {
  const elapsedMs = Math.max(0, Date.now() - new Date(timestamp).getTime());
  if (!Number.isFinite(elapsedMs) || elapsedMs < 60_000) return 'just now';
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
