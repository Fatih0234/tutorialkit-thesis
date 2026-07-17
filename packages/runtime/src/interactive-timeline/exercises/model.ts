import { simpleHashFiles } from '../learner-delta.js';
import { normalizeFiles, normalizePath } from '../path.js';
import {
  EXERCISE_SCHEMA_VERSION,
  EXERCISE_VALIDATION_PROTOCOL,
  type ExerciseCatalogEntry,
  type ExerciseCompleteness,
  type ExerciseContent,
  type ExerciseDraft,
  type ExerciseFileRole,
  type ExercisePublishability,
  type ExerciseVersion,
  type LearnerExerciseContent,
} from './types.js';

const SAFE_EXERCISE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;
const SAFE_CHECK_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;
const DEFAULT_VALIDATION_TIMEOUT_MS = 10_000;
const STATIC_PARENT_IMPORT = /^\s*import\s+(?:[^'"\n]+\s+from\s+)?['"]\.\.\//m;

export function createExerciseId(prefix = 'exercise'): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function createEmptyExerciseContent(starterFiles: Record<string, string> = {}): ExerciseContent {
  const normalizedStarter = normalizeFiles(starterFiles);

  return {
    title: '',
    instructions: '',
    starterFiles: normalizedStarter,
    fileRoles: Object.fromEntries(Object.keys(normalizedStarter).map((path) => [path, 'editable' as const])),
    allowCreatePatterns: ['/**'],
    privateValidationFiles: {},
    validation: {
      protocol: EXERCISE_VALIDATION_PROTOCOL,
      entrypoint: '/__exercise_tests__/exercise.test.mjs',
      timeoutMs: DEFAULT_VALIDATION_TIMEOUT_MS,
      checks: [],
    },
  };
}

export function normalizeExerciseContent(input: ExerciseContent): ExerciseContent {
  const starterFiles = normalizeFiles(input.starterFiles ?? {});
  const privateValidationFiles = normalizeFiles(input.privateValidationFiles ?? {});
  const referenceSolutionFiles = input.referenceSolutionFiles
    ? normalizeFiles(input.referenceSolutionFiles)
    : undefined;
  const fileRoles: Record<string, ExerciseFileRole> = {};
  const inputFileRoles = Object.fromEntries(
    Object.entries(input.fileRoles ?? {}).map(([path, role]) => [normalizePath(path), role]),
  );

  for (const path of Object.keys(starterFiles)) {
    const role = inputFileRoles[path] ?? 'editable';
    fileRoles[path] = role === 'read-only' ? 'read-only' : 'editable';
  }

  for (const path of Object.keys(privateValidationFiles)) {
    fileRoles[path] = 'private-validation';
  }

  const checks = (input.validation?.checks ?? []).map((check) => ({
    id: check.id.trim(),
    title: check.title.trim(),
    ...(check.failureFeedback?.trim() ? { failureFeedback: check.failureFeedback.trim() } : {}),
  }));

  return {
    title: input.title.trim(),
    instructions: input.instructions.trim(),
    explanation: input.explanation?.trim() || undefined,
    hints: input.hints?.map((hint) => hint.trim()).filter(Boolean),
    successFeedback: input.successFeedback?.trim() || undefined,
    failureFeedback: input.failureFeedback?.trim() || undefined,
    starterFiles,
    fileRoles,
    allowCreatePatterns: [...new Set((input.allowCreatePatterns ?? ['/**']).map(normalizeCreatePattern))],
    privateValidationFiles,
    ...(referenceSolutionFiles ? { referenceSolutionFiles } : {}),
    validation: {
      protocol: EXERCISE_VALIDATION_PROTOCOL,
      entrypoint: normalizePath(input.validation?.entrypoint ?? '/__exercise_tests__/exercise.test.mjs'),
      timeoutMs: normalizeTimeout(input.validation?.timeoutMs),
      checks,
    },
  };
}

export function getExerciseContentHash(content: ExerciseContent): string {
  const normalized = normalizeExerciseContent(content);
  const filesHash = simpleHashFiles({
    ...normalized.starterFiles,
    ...Object.fromEntries(
      Object.entries(normalized.privateValidationFiles).map(([path, value]) => [`/__private__${path}`, value]),
    ),
    ...Object.fromEntries(
      Object.entries(normalized.referenceSolutionFiles ?? {}).map(([path, value]) => [`/__reference__${path}`, value]),
    ),
  });
  const metadata = stableStringify({
    ...normalized,
    starterFiles: undefined,
    privateValidationFiles: undefined,
    referenceSolutionFiles: undefined,
  });

  return `${filesHash}:${hashString(metadata)}`;
}

export function getExerciseCompleteness(content: ExerciseContent): ExerciseCompleteness {
  const normalized = normalizeExerciseContent(content);
  const reasons: string[] = [];

  if (!normalized.title) {
    reasons.push('Exercise title is required.');
  }

  if (!normalized.instructions) {
    reasons.push('Learner instructions are required.');
  }

  if (Object.keys(normalized.starterFiles).length === 0) {
    reasons.push('Starter workspace must contain at least one file.');
  }

  if (normalized.validation.checks.length === 0) {
    reasons.push('At least one automated check is required.');
  }

  const validationEntrypointSource = normalized.privateValidationFiles[normalized.validation.entrypoint];

  if (!validationEntrypointSource) {
    reasons.push('Validation entrypoint must reference a private validation file.');
  } else {
    if (validationEntrypointSource.includes('Configure this validation check.')) {
      reasons.push('Replace the placeholder validation check with an exercise-specific check.');
    }
    if (STATIC_PARENT_IMPORT.test(validationEntrypointSource)) {
      reasons.push(
        'Import learner files dynamically inside check.run() so invalid learner exports are reported as failed checks.',
      );
    }
  }

  const ids = new Set<string>();

  for (const check of normalized.validation.checks) {
    if (!SAFE_CHECK_ID.test(check.id)) {
      reasons.push(`Validation check id is invalid: ${check.id || '(empty)'}.`);
    } else if (ids.has(check.id)) {
      reasons.push(`Validation check id is duplicated: ${check.id}.`);
    }

    ids.add(check.id);

    if (!check.title) {
      reasons.push(`Validation check ${check.id || '(empty)'} needs a learner-facing title.`);
    }
  }

  return { complete: reasons.length === 0, reasons };
}

export function getExercisePublishability(draft: ExerciseDraft): ExercisePublishability {
  const completeness = getExerciseCompleteness(draft.content);
  const contentHash = getExerciseContentHash(draft.content);
  const reasons = [...completeness.reasons];
  const starter = draft.verification.starter;
  const reference = draft.verification.reference;

  if (!starter || starter.contentHash !== contentHash) {
    reasons.push('Starter validation must be rerun for the current exercise content.');
  } else if (starter.result.outcome === 'broken') {
    reasons.push('Starter validation is broken.');
  } else if (starter.result.outcome === 'passed') {
    reasons.push('Starter workspace must not pass every automated check.');
  }

  if (draft.content.referenceSolutionFiles) {
    if (!reference || reference.contentHash !== contentHash) {
      reasons.push('Reference solution validation must be rerun for the current exercise content.');
    } else if (reference.result.outcome !== 'passed') {
      reasons.push('Reference solution must pass every automated check.');
    }
  }

  return { complete: reasons.length === 0, reasons, contentHash };
}

export function isExerciseAttachable(
  draft: ExerciseDraft,
  context: { ownerUserId: string; lessonId: string },
): boolean {
  return (
    draft.ownerUserId === context.ownerUserId &&
    draft.lessonId === context.lessonId &&
    getExercisePublishability(draft).complete
  );
}

export function createExerciseDraft(options: {
  exerciseId?: string;
  ownerUserId: string;
  lessonId?: string;
  content?: ExerciseContent;
  now?: string;
}): ExerciseDraft {
  const exerciseId = options.exerciseId ?? createExerciseId();

  if (!SAFE_EXERCISE_ID.test(exerciseId)) {
    throw new Error('Exercise id is invalid.');
  }

  const now = options.now ?? new Date().toISOString();

  return {
    schemaVersion: EXERCISE_SCHEMA_VERSION,
    exerciseId,
    ownerUserId: options.ownerUserId,
    lessonId: options.lessonId,
    content: normalizeExerciseContent(options.content ?? createEmptyExerciseContent()),
    verification: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function createExerciseVersion(
  draft: ExerciseDraft,
  version: number,
  now = new Date().toISOString(),
): ExerciseVersion {
  const publishability = getExercisePublishability(draft);

  if (!publishability.complete) {
    throw new Error(`Exercise cannot be published: ${publishability.reasons.join(' ')}`);
  }

  if (!Number.isInteger(version) || version < 1) {
    throw new Error('Exercise version must be a positive integer.');
  }

  return {
    schemaVersion: EXERCISE_SCHEMA_VERSION,
    exerciseId: draft.exerciseId,
    version,
    ownerUserId: draft.ownerUserId,
    lessonId: draft.lessonId,
    content: normalizeExerciseContent(draft.content),
    contentHash: publishability.contentHash,
    createdAt: draft.createdAt,
    publishedAt: now,
  };
}

export function createExerciseCatalogEntry(
  draft: ExerciseDraft,
  current?: ExerciseCatalogEntry,
): ExerciseCatalogEntry {
  return {
    schemaVersion: EXERCISE_SCHEMA_VERSION,
    exerciseId: draft.exerciseId,
    ownerUserId: draft.ownerUserId,
    title: draft.content.title || 'Untitled exercise',
    activeVersion: current?.activeVersion,
    createdAt: current?.createdAt ?? draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

export function toLearnerExerciseContent(version: ExerciseVersion): LearnerExerciseContent {
  const content = normalizeExerciseContent(version.content);
  const fileRoles = Object.fromEntries(
    Object.entries(content.fileRoles).filter(
      (entry): entry is [string, 'editable' | 'read-only'] => entry[1] !== 'private-validation',
    ),
  );

  return {
    exerciseId: version.exerciseId,
    version: version.version,
    title: content.title,
    instructions: content.instructions,
    explanation: content.explanation,
    hints: content.hints ?? [],
    successFeedback: content.successFeedback,
    failureFeedback: content.failureFeedback,
    starterFiles: content.starterFiles,
    fileRoles,
    allowCreatePatterns: content.allowCreatePatterns,
    checks: content.validation.checks,
  };
}

function normalizeCreatePattern(pattern: string): string {
  const trimmed = pattern.trim();

  if (!trimmed) {
    return '/**';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (!Number.isFinite(timeoutMs)) {
    return DEFAULT_VALIDATION_TIMEOUT_MS;
  }

  return Math.min(60_000, Math.max(100, Math.round(timeoutMs!)));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}
