import type { FilesSnapshot } from '../types.js';
import { normalizeFiles, normalizePath } from '../path.js';
import {
  EXERCISE_VALIDATION_PROTOCOL,
  type ExerciseContent,
  type ExerciseValidationExecution,
  type ExerciseValidationProtocolPayload,
  type ExerciseValidationResult,
} from './types.js';

export const EXERCISE_RESULT_SENTINEL = '__TUTORIALKIT_EXERCISE_RESULT__';
export const EXERCISE_RUNNER_FILE = '/__tutorialkit_exercise_runner__.mjs';

export interface PreparedExerciseValidationRun {
  files: FilesSnapshot;
  entrypoint: string;
  runnerFile: string;
  timeoutMs: number;
}

export function prepareExerciseValidationRun(
  content: ExerciseContent,
  submittedFiles: FilesSnapshot,
): PreparedExerciseValidationRun {
  const files = normalizeFiles({
    ...submittedFiles,
    ...content.privateValidationFiles,
  });
  const entrypoint = normalizePath(content.validation.entrypoint);

  if (!(entrypoint in files)) {
    throw new Error('Exercise validation entrypoint is missing.');
  }

  if (entrypoint === EXERCISE_RUNNER_FILE) {
    throw new Error('Exercise validation entrypoint uses a reserved path.');
  }

  files[EXERCISE_RUNNER_FILE] = createExerciseValidationRunnerSource(entrypoint);

  return {
    files,
    entrypoint,
    runnerFile: EXERCISE_RUNNER_FILE,
    timeoutMs: content.validation.timeoutMs,
  };
}

export function parseExerciseValidationExecution(
  content: ExerciseContent,
  execution: ExerciseValidationExecution,
): ExerciseValidationResult {
  const diagnostics = formatDiagnostics(execution);

  if (execution.timedOut) {
    return { outcome: 'broken', checks: [], diagnostics: `Validation timed out.\n${diagnostics}`.trim() };
  }

  const payload = findProtocolPayload(execution.stdout);

  if (!payload) {
    return {
      outcome: 'broken',
      checks: [],
      diagnostics: `Validation did not emit a valid ${EXERCISE_VALIDATION_PROTOCOL} result.\n${diagnostics}`.trim(),
    };
  }

  const configuredIds = new Set(content.validation.checks.map((check) => check.id));
  const resultIds = new Set(payload.checks.map((check) => check.id));

  if (
    payload.checks.length !== configuredIds.size ||
    payload.checks.some((check) => !configuredIds.has(check.id)) ||
    [...configuredIds].some((id) => !resultIds.has(id))
  ) {
    return {
      outcome: 'broken',
      checks: payload.checks,
      diagnostics: `Validation result does not match the configured checks.\n${diagnostics}`.trim(),
    };
  }

  if (execution.exitCode !== 0 && payload.checks.every((check) => check.passed)) {
    return {
      outcome: 'broken',
      checks: payload.checks,
      diagnostics: `Validation exited with code ${execution.exitCode} after reporting success.\n${diagnostics}`.trim(),
    };
  }

  return {
    outcome: payload.checks.every((check) => check.passed) ? 'passed' : 'failed',
    checks: payload.checks,
    diagnostics,
  };
}

export function sanitizeExerciseValidationResult(
  content: ExerciseContent,
  result: ExerciseValidationResult,
): ExerciseValidationResult {
  const definitions = new Map(content.validation.checks.map((check) => [check.id, check]));

  return {
    outcome: result.outcome,
    checks: result.checks.map((check) => ({
      id: check.id,
      passed: check.passed,
      ...(!check.passed && definitions.get(check.id)?.failureFeedback
        ? { message: definitions.get(check.id)!.failureFeedback }
        : {}),
    })),
  };
}

export function createExerciseValidationRunnerSource(entrypoint: string): string {
  const relativeEntrypoint = `.${normalizePath(entrypoint)}`;

  return `const SENTINEL = ${JSON.stringify(EXERCISE_RESULT_SENTINEL)};
const PROTOCOL = ${JSON.stringify(EXERCISE_VALIDATION_PROTOCOL)};

async function main() {
  const module = await import(${JSON.stringify(relativeEntrypoint)});
  const checks = module.checks ?? module.default;

  if (!Array.isArray(checks)) {
    throw new Error('Validation module must export a checks array.');
  }

  const results = [];

  for (const check of checks) {
    if (!check || typeof check.id !== 'string' || typeof check.run !== 'function') {
      throw new Error('Every validation check must have an id and run function.');
    }

    try {
      await check.run();
      results.push({ id: check.id, passed: true });
    } catch (error) {
      results.push({
        id: check.id,
        passed: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(SENTINEL + JSON.stringify({ protocol: PROTOCOL, checks: results }));
  process.exitCode = results.every((check) => check.passed) ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 2;
});
`;
}

function findProtocolPayload(stdout: string): ExerciseValidationProtocolPayload | undefined {
  const lines = stdout.split(/\r?\n/).reverse();
  const resultLine = lines.find((line) => line.includes(EXERCISE_RESULT_SENTINEL));

  if (!resultLine) {
    return undefined;
  }

  const json = resultLine.slice(resultLine.indexOf(EXERCISE_RESULT_SENTINEL) + EXERCISE_RESULT_SENTINEL.length);

  try {
    const parsed = JSON.parse(json) as Partial<ExerciseValidationProtocolPayload>;

    if (parsed.protocol !== EXERCISE_VALIDATION_PROTOCOL || !Array.isArray(parsed.checks)) {
      return undefined;
    }

    const checks = parsed.checks.map((check) => {
      if (!check || typeof check.id !== 'string' || typeof check.passed !== 'boolean') {
        throw new Error('Malformed check result.');
      }

      return {
        id: check.id,
        passed: check.passed,
        ...(typeof check.message === 'string' ? { message: check.message } : {}),
      };
    });

    return { protocol: EXERCISE_VALIDATION_PROTOCOL, checks };
  } catch {
    return undefined;
  }
}

function formatDiagnostics(execution: ExerciseValidationExecution): string {
  return [execution.stdout.trim(), execution.stderr.trim()].filter(Boolean).join('\n');
}
