import { describe, expect, it } from 'vitest';
import { validateAndRedactSelection } from './context.js';

const files = { '/src/App.ts': 'const token = "safe";\nconsole.log(token);\n' };

describe('AI selected-code context', () => {
  it('normalizes and accepts a matching selection', () => {
    expect(
      validateAndRedactSelection({ filePath: 'src/App.ts', startLine: 2, endLine: 2, text: 'token' }, files, true),
    ).toEqual({
      filePath: '/src/App.ts',
      startLine: 2,
      endLine: 2,
      text: 'token',
    });
  });

  it('omits selection when the learner disabled it', () => {
    expect(
      validateAndRedactSelection({ filePath: '/src/App.ts', startLine: 1, endLine: 1, text: 'const' }, files, false),
    ).toBeNull();
  });

  it('rejects stale, invalid, sensitive, and oversized selections', () => {
    expect(() =>
      validateAndRedactSelection({ filePath: '/src/App.ts', startLine: 4, endLine: 4, text: 'token' }, files, true),
    ).toThrow();
    expect(() =>
      validateAndRedactSelection({ filePath: '/src/App.ts', startLine: 1, endLine: 1, text: 'missing' }, files, true),
    ).toThrow();
    expect(() =>
      validateAndRedactSelection(
        { filePath: '/.env', startLine: 1, endLine: 1, text: 'secret' },
        { '/.env': 'secret' },
        true,
      ),
    ).toThrow();
    expect(() =>
      validateAndRedactSelection(
        { filePath: '/src/App.ts', startLine: 1, endLine: 1, text: 'x'.repeat(13 * 1024) },
        { '/src/App.ts': 'x'.repeat(13 * 1024) },
        true,
      ),
    ).toThrow();
  });

  it('redacts likely credentials in a valid selection', () => {
    const content = 'apiKey = "sk-abcdefghijklmnopqrstuvwxyz123456"';
    const result = validateAndRedactSelection(
      { filePath: '/src/App.ts', startLine: 1, endLine: 1, text: content },
      { '/src/App.ts': content },
      true,
    );
    expect(result?.text).toContain('[REDACTED_SECRET]');
    expect(result?.text).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
  });
});
