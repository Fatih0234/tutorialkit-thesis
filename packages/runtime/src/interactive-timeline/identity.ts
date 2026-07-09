export type InteractiveUserRole = 'teacher' | 'learner' | 'both';

export interface InteractiveUser {
  id: string;
  displayName: string;
  role: InteractiveUserRole;
  createdAt: string;
}

export interface InteractiveSession {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export const INTERACTIVE_DEV_TEACHER_USER_ID = 'dev-user-teacher-demo-8f4c2a9d';
export const INTERACTIVE_DEV_LEARNER_USER_ID = 'dev-user-learner-demo-61b7c3e2';
export const INTERACTIVE_DEV_LEARNER_TWO_USER_ID = 'dev-user-learner-two-927f4d1a';
export const INTERACTIVE_LEGACY_LOCAL_LEARNER_USER_ID = 'local-poc-user';

export const INTERACTIVE_DEFAULT_TEACHER_USER_ID = INTERACTIVE_DEV_TEACHER_USER_ID;
export const INTERACTIVE_DEFAULT_LEARNER_USER_ID = INTERACTIVE_DEV_LEARNER_USER_ID;

export const INTERACTIVE_DEV_USERS: readonly InteractiveUser[] = [
  {
    id: INTERACTIVE_DEV_TEACHER_USER_ID,
    displayName: 'Teacher Demo',
    role: 'teacher',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: INTERACTIVE_DEV_LEARNER_USER_ID,
    displayName: 'Learner Demo',
    role: 'learner',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: INTERACTIVE_DEV_LEARNER_TWO_USER_ID,
    displayName: 'Learner Two',
    role: 'learner',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
] as const;

export function canPublishInteractiveRecording(user: InteractiveUser | null | undefined): boolean {
  return user?.role === 'teacher' || user?.role === 'both';
}

export function canSaveInteractiveLearnerWork(user: InteractiveUser | null | undefined): boolean {
  return user?.role === 'learner' || user?.role === 'both';
}
