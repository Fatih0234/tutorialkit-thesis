import type { ExercisePoint } from './types.js';
import type { TimelineEvent } from '../types.js';

export interface TimelineSequencePosition {
  timestampMs: number;
  eventSeq: number;
}

export function compareTimelineSequencePosition(left: TimelineSequencePosition, right: TimelineSequencePosition): number {
  return left.timestampMs - right.timestampMs || left.eventSeq - right.eventSeq;
}

export function exercisePointPosition(point: ExercisePoint): TimelineSequencePosition {
  return {
    timestampMs: point.teacherTimestampMs,
    eventSeq: point.lastAppliedTeacherEventSeq,
  };
}

export function timelineEventPosition(event: TimelineEvent): TimelineSequencePosition {
  return { timestampMs: event.tMs, eventSeq: event.seq };
}

export function sortExercisePoints(points: ExercisePoint[]): ExercisePoint[] {
  return [...points].sort((left, right) =>
    compareTimelineSequencePosition(exercisePointPosition(left), exercisePointPosition(right)) ||
    left.id.localeCompare(right.id),
  );
}

export function getNextExercisePoint(
  points: ExercisePoint[],
  after: TimelineSequencePosition,
  ignoredPointIds: ReadonlySet<string> = new Set(),
): ExercisePoint | undefined {
  return sortExercisePoints(points).find(
    (point) =>
      !ignoredPointIds.has(point.id) &&
      compareTimelineSequencePosition(exercisePointPosition(point), after) > 0,
  );
}

export function isEventThroughExercisePoint(event: TimelineEvent, point: ExercisePoint): boolean {
  return compareTimelineSequencePosition(timelineEventPosition(event), exercisePointPosition(point)) <= 0;
}
