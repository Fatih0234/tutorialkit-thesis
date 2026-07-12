import { describe, expect, it } from 'vitest';
import { getEditorTextSelection } from './selection.js';

describe('getEditorTextSelection', () => {
  const content = 'const greeting = "hello";\nconsole.log(greeting);\n';

  it('returns null for a collapsed cursor', () => {
    expect(getEditorTextSelection('/src/App.js', content, 3, 3)).toBeNull();
  });

  it('extracts a word and its one-based line', () => {
    const from = content.indexOf('hello');
    expect(getEditorTextSelection('/src/App.js', content, from, from + 5)).toEqual({
      filePath: '/src/App.js',
      startLine: 1,
      endLine: 1,
      text: 'hello',
    });
  });

  it('normalizes a reversed multiline range', () => {
    const from = content.indexOf('greeting');
    const to = content.lastIndexOf('greeting') + 'greeting'.length;
    expect(getEditorTextSelection('/src/App.js', content, to, from)).toEqual({
      filePath: '/src/App.js',
      startLine: 1,
      endLine: 2,
      text: content.slice(from, to),
    });
  });
});
