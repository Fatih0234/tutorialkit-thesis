export interface EditorTextSelection {
  filePath: string;
  startLine: number;
  endLine: number;
  text: string;
}

export function getEditorTextSelection(
  filePath: string,
  content: string,
  anchor: number,
  head: number,
): EditorTextSelection | null {
  const from = Math.max(0, Math.min(content.length, anchor, head));
  const to = Math.max(0, Math.min(content.length, Math.max(anchor, head)));

  if (from === to) {
    return null;
  }

  const startLine = content.slice(0, from).split('\n').length;
  const endLine = content.slice(0, Math.max(from, to - 1)).split('\n').length;

  return {
    filePath,
    startLine,
    endLine,
    text: content.slice(from, to),
  };
}
