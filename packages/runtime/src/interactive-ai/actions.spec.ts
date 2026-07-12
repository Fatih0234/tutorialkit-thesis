import { describe, expect, it } from 'vitest';
import { nextHintLevel, normalizeAiAction, validateAiAction } from './actions.js';

describe('interactive AI actions', () => {
  it('normalizes and validates read-only file actions', () => {
    const action = normalizeAiAction({ type: 'open-file', filePath: 'src/main.ts', line: 2 });
    expect(action).toEqual({ type: 'open-file', filePath: '/src/main.ts', line: 2 });
    expect(validateAiAction(action, { '/src/main.ts': 'x' }, 100)).toBe(true);
    expect(validateAiAction(action, {}, 100)).toBe(false);
  });
  it('clamps lecture seeks and advances hints deliberately', () => {
    expect(normalizeAiAction({ type: 'seek-lecture', timestampMs: -4, reason: 'x' })).toMatchObject({ timestampMs: 0 });
    expect(nextHintLevel(null)).toBe(1);
    expect(nextHintLevel(1)).toBe(2);
    expect(nextHintLevel(4)).toBe(4);
  });
});
