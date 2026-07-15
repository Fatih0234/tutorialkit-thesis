import type { Files } from '@tutorialkit/types';
import { normalizePath } from '../interactive-timeline/path.js';
import type { EditorDocuments } from './editor.js';

function addTextFiles(target: Record<string, string>, files: Files | undefined): void {
  for (const [filePath, value] of Object.entries(files ?? {})) {
    if (typeof value === 'string') {
      target[normalizePath(filePath)] = value;
    }
  }
}

/** Build an isolated text workspace using template < lesson < editor precedence. */
export function createWorkspaceSnapshot(
  templateFiles: Files | undefined,
  lessonFiles: Files | undefined,
  editorDocuments: EditorDocuments,
  removedPaths: ReadonlySet<string> = new Set(),
): Record<string, string> {
  const files: Record<string, string> = {};

  addTextFiles(files, templateFiles);
  addTextFiles(files, lessonFiles);

  for (const [filePath, document] of Object.entries(editorDocuments)) {
    if (document?.type === 'file' && !document.loading && typeof document.value === 'string') {
      files[normalizePath(filePath)] = document.value;
    }
  }

  for (const filePath of removedPaths) {
    delete files[normalizePath(filePath)];
  }

  return Object.fromEntries(Object.entries(files).map(([filePath, value]) => [filePath.slice(1), value]));
}
