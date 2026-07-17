import { describe, expect, it } from 'vitest';
import {
  EXERCISE_RESULT_SENTINEL,
  EXERCISE_VALIDATION_PROTOCOL,
  createEmptyExerciseContent,
  createExerciseAttempt,
  createExerciseDraft,
  createExerciseVersion,
  getExerciseContentHash,
  getExercisePublishability,
  getNextExercisePoint,
  isEventThroughExercisePoint,
  isExerciseAttachable,
  parseExerciseValidationExecution,
  prepareExerciseValidationRun,
  sanitizeExerciseValidationResult,
  toLearnerExerciseContent,
  updateExerciseAttempt,
} from './index.js';

function completeContent() {
  const content = createEmptyExerciseContent({ '/src/counter.js': 'export const increment = (value) => value + 1;\n' });
  content.title = 'Increment a counter';
  content.instructions = 'Implement increment.';
  content.explanation = 'A counter advances by applying a predictable update to its current value.';
  content.validation.checks = [{ id: 'increments', title: 'Increments the value', failureFeedback: 'Add one.' }];
  content.privateValidationFiles[content.validation.entrypoint] = `export const checks = [{ id: 'increments', run() {} }];\n`;
  return content;
}

describe('exercise model', () => {
  it('requires fresh starter and reference verification before publication', () => {
    const content = completeContent();
    content.referenceSolutionFiles = { ...content.starterFiles };
    const draft = createExerciseDraft({ exerciseId: 'exercise-counter', ownerUserId: 'teacher', content });
    const contentHash = getExerciseContentHash(content);

    expect(getExercisePublishability(draft).complete).toBe(false);

    draft.verification.starter = {
      contentHash,
      checkedAt: new Date(0).toISOString(),
      result: { outcome: 'failed', checks: [{ id: 'increments', passed: false }] },
    };
    draft.verification.reference = {
      contentHash,
      checkedAt: new Date(0).toISOString(),
      result: { outcome: 'passed', checks: [{ id: 'increments', passed: true }] },
    };

    expect(getExercisePublishability(draft)).toMatchObject({ complete: true, reasons: [] });
    expect(createExerciseVersion(draft, 1)).toMatchObject({ exerciseId: 'exercise-counter', version: 1, contentHash });

    draft.content.instructions = 'Changed instructions invalidate the prior checks.';
    expect(getExercisePublishability(draft)).toMatchObject({ complete: false });

    draft.content.instructions = content.instructions;
    draft.content.explanation = 'Changed explanations are pinned content and also invalidate prior verification.';
    expect(getExercisePublishability(draft)).toMatchObject({ complete: false });
  });

  it('reports actionable publication blockers', () => {
    const content = completeContent();
    content.validation.checks.push({ id: 'increments', title: 'Duplicate check' });
    let draft = createExerciseDraft({ ownerUserId: 'teacher', content });
    expect(getExercisePublishability(draft).reasons).toContain('Validation check id is duplicated: increments.');

    content.validation.checks = content.validation.checks.slice(0, 1);
    content.referenceSolutionFiles = { ...content.starterFiles };
    draft = createExerciseDraft({ ownerUserId: 'teacher', content });
    const contentHash = getExerciseContentHash(content);
    draft.verification.starter = {
      contentHash,
      checkedAt: new Date(0).toISOString(),
      result: { outcome: 'passed', checks: [{ id: 'increments', passed: true }] },
    };
    draft.verification.reference = {
      contentHash,
      checkedAt: new Date(0).toISOString(),
      result: { outcome: 'failed', checks: [{ id: 'increments', passed: false }] },
    };
    expect(getExercisePublishability(draft).reasons).toEqual(
      expect.arrayContaining([
        'Starter workspace must not pass every automated check.',
        'Reference solution must pass every automated check.',
      ]),
    );

    draft.verification.starter.result = { outcome: 'broken', checks: [] };
    expect(getExercisePublishability(draft).reasons).toContain('Starter validation is broken.');
  });

  it('keeps legacy exercise content without an explanation readable', () => {
    const content = completeContent();
    delete content.explanation;
    const draft = createExerciseDraft({ ownerUserId: 'teacher', content });
    const contentHash = getExerciseContentHash(content);
    draft.verification.starter = {
      contentHash,
      checkedAt: new Date(0).toISOString(),
      result: { outcome: 'failed', checks: [{ id: 'increments', passed: false }] },
    };

    const learner = toLearnerExerciseContent(createExerciseVersion(draft, 1));
    expect(learner.explanation).toBeUndefined();
  });

  it('only attaches freshly verified exercises owned by the teacher and current lesson', () => {
    const content = completeContent();
    const draft = createExerciseDraft({ ownerUserId: 'teacher', lessonId: 'lesson-1', content });
    const contentHash = getExerciseContentHash(content);
    draft.verification.starter = {
      contentHash,
      checkedAt: new Date(0).toISOString(),
      result: { outcome: 'failed', checks: [{ id: 'increments', passed: false }] },
    };

    expect(isExerciseAttachable(draft, { ownerUserId: 'teacher', lessonId: 'lesson-1' })).toBe(true);
    expect(isExerciseAttachable(draft, { ownerUserId: 'other-teacher', lessonId: 'lesson-1' })).toBe(false);
    expect(isExerciseAttachable(draft, { ownerUserId: 'teacher', lessonId: 'lesson-2' })).toBe(false);

    draft.content.instructions = 'Verification is now stale.';
    expect(isExerciseAttachable(draft, { ownerUserId: 'teacher', lessonId: 'lesson-1' })).toBe(false);
  });

  it('rejects the generated placeholder validation check', () => {
    const content = completeContent();
    content.privateValidationFiles[content.validation.entrypoint] =
      "export const checks = [{ id: 'increments', run() { throw new Error('Configure this validation check.'); } }];";
    const draft = createExerciseDraft({ ownerUserId: 'teacher', content });

    expect(getExercisePublishability(draft).reasons).toContain(
      'Replace the placeholder validation check with an exercise-specific check.',
    );
  });

  it('requires learner modules to be imported inside a check', () => {
    const content = completeContent();
    content.privateValidationFiles[content.validation.entrypoint] =
      "import { increment } from '../src/counter.js';\nexport const checks = [{ id: 'increments', run() { increment(1); } }];";
    const draft = createExerciseDraft({ ownerUserId: 'teacher', content });

    expect(getExercisePublishability(draft).reasons).toContain(
      'Import learner files dynamically inside check.run() so invalid learner exports are reported as failed checks.',
    );

    content.privateValidationFiles[content.validation.entrypoint] =
      "import { loadCounter } from './helpers/load-counter.mjs';\nexport const checks = [{ id: 'increments', async run() { const module = await loadCounter(); module.increment(1); } }];";
    content.privateValidationFiles['/__exercise_tests__/helpers/load-counter.mjs'] =
      "export const loadCounter = () => import('../../src/counter.js');";
    expect(getExercisePublishability(createExerciseDraft({ ownerUserId: 'teacher', content })).reasons).not.toContain(
      'Import learner files dynamically inside check.run() so invalid learner exports are reported as failed checks.',
    );

    content.privateValidationFiles['/__exercise_tests__/helpers/load-counter.mjs'] =
      "import { increment } from '../../src/counter.js';\nexport const loadCounter = async () => ({ increment });";
    expect(getExercisePublishability(createExerciseDraft({ ownerUserId: 'teacher', content })).reasons).toContain(
      'Import learner files dynamically inside check.run() so invalid learner exports are reported as failed checks.',
    );
  });

  it('removes private validation and reference files from learner content', () => {
    const content = completeContent();
    content.referenceSolutionFiles = { '/src/counter.js': 'solution' };
    const draft = createExerciseDraft({ exerciseId: 'exercise-counter', ownerUserId: 'teacher', content });
    const contentHash = getExerciseContentHash(content);
    draft.verification.starter = {
      contentHash,
      checkedAt: '',
      result: { outcome: 'failed', checks: [{ id: 'increments', passed: false }] },
    };
    draft.verification.reference = {
      contentHash,
      checkedAt: '',
      result: { outcome: 'passed', checks: [{ id: 'increments', passed: true }] },
    };

    const learner = toLearnerExerciseContent(createExerciseVersion(draft, 1));
    expect(learner.explanation).toBe(content.explanation);
    expect(learner.starterFiles).toEqual(content.starterFiles);
    expect(learner).not.toHaveProperty('privateValidationFiles');
    expect(learner).not.toHaveProperty('referenceSolutionFiles');
  });
});

describe('exercise playback boundaries', () => {
  const points = [
    {
      schemaVersion: 1 as const,
      id: 'later',
      exerciseId: 'exercise',
      teacherTimestampMs: 100,
      lastAppliedTeacherEventSeq: 4,
      createdAt: new Date(0).toISOString(),
    },
    {
      schemaVersion: 1 as const,
      id: 'earlier',
      exerciseId: 'exercise',
      teacherTimestampMs: 100,
      lastAppliedTeacherEventSeq: 2,
      createdAt: new Date(0).toISOString(),
    },
  ];

  it('orders points and events at the same timestamp by teacher event sequence', () => {
    expect(getNextExercisePoint(points, { timestampMs: -1, eventSeq: Number.POSITIVE_INFINITY })?.id).toBe('earlier');
    expect(getNextExercisePoint(points, { timestampMs: 100, eventSeq: 2 })?.id).toBe('later');
    expect(
      isEventThroughExercisePoint(
        { id: 'event', seq: 3, tMs: 100, type: 'file.opened', origin: 'teacher' },
        points[0]!,
      ),
    ).toBe(true);
    expect(
      isEventThroughExercisePoint(
        { id: 'event', seq: 5, tMs: 100, type: 'file.opened', origin: 'teacher' },
        points[0]!,
      ),
    ).toBe(false);
  });
});

describe('exercise attempts', () => {
  it('requires a checked workspace hash before marking an attempt passed', () => {
    const attempt = createExerciseAttempt({
      id: 'attempt-1',
      userId: 'learner',
      lessonId: 'lesson',
      teacherRecordingId: 'recording',
      teacherRecordingVersion: 1,
      exercisePointId: 'point',
      exerciseId: 'exercise',
      exerciseVersion: 1,
      rootBranchId: 'branch',
      now: new Date(0).toISOString(),
    });

    expect(() => updateExerciseAttempt(attempt, { status: 'passed' })).toThrow(/workspace hash/i);
    const passed = updateExerciseAttempt(attempt, { status: 'passed', passedFilesHash: 'hash' });
    expect(passed).toMatchObject({ status: 'passed', lastPassedFilesHash: 'hash' });
    expect(updateExerciseAttempt(passed, { status: 'skipped' })).toMatchObject({ status: 'passed' });
  });
});

describe('exercise validation protocol', () => {
  it('prepares an isolated file set and parses named checks', () => {
    const content = completeContent();
    const prepared = prepareExerciseValidationRun(content, content.starterFiles);
    expect(prepared.files[content.validation.entrypoint]).toContain('checks');
    expect(prepared.files[prepared.runnerFile]).toContain(EXERCISE_RESULT_SENTINEL);

    const result = parseExerciseValidationExecution(content, {
      exitCode: 1,
      stdout: `${EXERCISE_RESULT_SENTINEL}${JSON.stringify({
        protocol: EXERCISE_VALIDATION_PROTOCOL,
        checks: [{ id: 'increments', passed: false, message: 'private detail' }],
      })}\n`,
      stderr: '',
      timedOut: false,
    });

    expect(result.outcome).toBe('failed');
    expect(sanitizeExerciseValidationResult(content, result)).toEqual({
      outcome: 'failed',
      checks: [{ id: 'increments', passed: false, message: 'Add one.' }],
    });
  });

  it('classifies missing and mismatched protocol results as broken', () => {
    const content = completeContent();
    expect(
      parseExerciseValidationExecution(content, { exitCode: 1, stdout: '', stderr: 'syntax error', timedOut: false }),
    ).toMatchObject({ outcome: 'broken', checks: [] });

    expect(
      parseExerciseValidationExecution(content, {
        exitCode: 0,
        stdout: `${EXERCISE_RESULT_SENTINEL}${JSON.stringify({
          protocol: EXERCISE_VALIDATION_PROTOCOL,
          checks: [{ id: 'unknown', passed: true }],
        })}`,
        stderr: '',
        timedOut: false,
      }),
    ).toMatchObject({ outcome: 'broken' });
  });
});
