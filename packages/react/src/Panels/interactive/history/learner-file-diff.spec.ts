import { describe, expect, it } from 'vitest';
import { computeLearnerFileDiff } from './learner-file-diff.js';

describe('computeLearnerFileDiff', () => {
  it('returns no hunks for equivalent content and normalizes line endings', () => {
    expect(computeLearnerFileDiff('one\r\ntwo', 'one\ntwo')).toEqual({ hunks: [], addedLineCount: 0, removedLineCount: 0 });
  });

  it('finds inserted lines at their visible line numbers', () => {
    expect(computeLearnerFileDiff('one\nthree', 'one\ntwo\nthree')).toEqual({
      hunks: [{ type: 'added', previousFromLine: 2, currentFromLine: 2, currentToLine: 2, previousLines: [], currentLines: ['two'] }],
      addedLineCount: 1,
      removedLineCount: 0,
    });
  });

  it('represents removed lines at the following visible line', () => {
    expect(computeLearnerFileDiff('one\ntwo\nthree', 'one\nthree')).toEqual({
      hunks: [{ type: 'removed', previousFromLine: 2, currentFromLine: 2, currentToLine: 2, previousLines: ['two'], currentLines: [] }],
      addedLineCount: 0,
      removedLineCount: 1,
    });
  });

  it('groups adjacent removals and additions as a modification', () => {
    expect(computeLearnerFileDiff('const total = price;\nrun();', 'const total = price * quantity;\nrun();')).toEqual({
      hunks: [{
        type: 'modified',
        previousFromLine: 1,
        currentFromLine: 1,
        currentToLine: 1,
        previousLines: ['const total = price;'],
        currentLines: ['const total = price * quantity;'],
      }],
      addedLineCount: 1,
      removedLineCount: 1,
    });
  });

  it('handles changes at the end of a file', () => {
    const result = computeLearnerFileDiff('one\ntwo', 'one');
    expect(result.hunks).toEqual([{ type: 'removed', previousFromLine: 2, currentFromLine: 2, currentToLine: 2, previousLines: ['two'], currentLines: [] }]);
  });

  it('does not report a terminal newline as an added blank line', () => {
    expect(computeLearnerFileDiff('one', 'one\n')).toEqual({ hunks: [], addedLineCount: 0, removedLineCount: 0 });
  });

  it('treats content in a newly added file as additions', () => {
    expect(computeLearnerFileDiff('', 'one\ntwo')).toEqual({
      hunks: [{ type: 'added', previousFromLine: 1, currentFromLine: 1, currentToLine: 2, previousLines: [], currentLines: ['one', 'two'] }],
      addedLineCount: 2,
      removedLineCount: 0,
    });
  });
});
