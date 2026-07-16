export type LearnerHistoryDiagnosticEvent =
  | 'takeover.started'
  | 'takeover.completed'
  | 'branch.created'
  | 'learner-event.appended'
  | 'commit.created'
  | 'history.position.selected'
  | 'branch.forked'
  | 'teacher.resumed'
  | 'history.sync.failed';

/** Development-only diagnostics. Never include file contents or session credentials. */
export function logLearnerHistoryEvent(
  event: LearnerHistoryDiagnosticEvent,
  details: Record<string, string | number | boolean | undefined> = {},
) {
  if (typeof window === 'undefined' || window.localStorage.getItem('interactive-poc.debugHistory') !== 'true') {
    return;
  }

  console.info('[interactive-history]', { event, ...details });
}
