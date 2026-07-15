import { describe, expect, it } from 'vitest';
import type { EditorDocuments } from './editor.js';
import { createWorkspaceSnapshot } from './workspace-snapshot.js';

function documents(values: Record<string, string>): EditorDocuments {
  return Object.fromEntries(
    Object.entries(values).map(([filePath, value]) => [
      filePath,
      { filePath, value, type: 'file' as const, loading: false },
    ]),
  );
}

describe('createWorkspaceSnapshot', () => {
  it('merges text files with template < lesson < editor precedence', () => {
    expect(
      createWorkspaceSnapshot(
        { '/helper.py': 'template', '/nested/data.txt': 'nested', '/empty.txt': '' },
        { '/helper.py': 'lesson', '/main.py': 'lesson main' },
        documents({ '/helper.py': 'editor', '/main.py': 'editor main' }),
      ),
    ).toEqual({
      'helper.py': 'editor',
      'nested/data.txt': 'nested',
      'empty.txt': '',
      'main.py': 'editor main',
    });
  });

  it('keeps explicitly deleted template and lesson files removed', () => {
    expect(
      createWorkspaceSnapshot(
        { '/template.py': 'template' },
        { '/lesson.py': 'lesson' },
        documents({}),
        new Set(['/template.py', '/lesson.py']),
      ),
    ).toEqual({});
  });

  it('excludes binary editor documents', () => {
    const binary: EditorDocuments = {
      '/image.bin': { filePath: '/image.bin', value: new Uint8Array([1]), type: 'file', loading: false },
    };

    expect(createWorkspaceSnapshot({}, {}, binary)).toEqual({});
  });
});
