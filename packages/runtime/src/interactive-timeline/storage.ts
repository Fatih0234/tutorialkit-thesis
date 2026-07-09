import type { LearnerDelta, TeacherRecording } from './types.js';

export const TEACHER_RECORDING_KEY = 'interactive-poc.teacherRecording';
export const LEARNER_DELTAS_KEY = 'interactive-poc.learnerDeltas';

function requireLocalStorage(): Storage | undefined {
  if (typeof localStorage === 'undefined') {
    return undefined;
  }

  return localStorage;
}

export function saveTeacherRecording(recording: TeacherRecording): void {
  requireLocalStorage()?.setItem(TEACHER_RECORDING_KEY, JSON.stringify(recording));
}

export function loadTeacherRecording(): TeacherRecording | undefined {
  const raw = requireLocalStorage()?.getItem(TEACHER_RECORDING_KEY);

  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw) as TeacherRecording;
}

export function saveLearnerDelta(delta: LearnerDelta): void {
  const existing = loadLearnerDeltas();
  existing.push(delta);

  saveLearnerDeltas(existing);
}

export function saveLearnerDeltas(deltas: LearnerDelta[]): void {
  requireLocalStorage()?.setItem(LEARNER_DELTAS_KEY, JSON.stringify(deltas));
}

export function loadLearnerDeltas(): LearnerDelta[] {
  const raw = requireLocalStorage()?.getItem(LEARNER_DELTAS_KEY);

  if (!raw) {
    return [];
  }

  return JSON.parse(raw) as LearnerDelta[];
}

export function loadLatestLearnerDelta(): LearnerDelta | undefined {
  return loadLearnerDeltas().at(-1);
}
