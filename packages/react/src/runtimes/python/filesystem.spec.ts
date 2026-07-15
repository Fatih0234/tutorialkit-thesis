import { describe, expect, it } from 'vitest';
import { diffRuntimeFiles, toWorkspacePath } from './filesystem.js';

describe('Python filesystem synchronization', () => {
  it('diffs added, modified, removed, nested, and empty text files', () => {
    expect(
      diffRuntimeFiles(
        { '/main.py': 'old', '/removed.py': 'gone' },
        { 'main.py': 'new', '/nested/helper.py': '', '/added.py': 'print("ok")' },
      ),
    ).toEqual({
      addedOrModified: { '/main.py': 'new', '/nested/helper.py': '', '/added.py': 'print("ok")' },
      removed: ['/removed.py'],
    });
  });

  it('confines normalized paths to workspace', () => {
    expect(toWorkspacePath('nested/main.py')).toBe('/workspace/nested/main.py');
    expect(() => toWorkspacePath('../secret')).toThrow('escapes workspace');
  });
});
