export type LearnerDiffHunkType = 'added' | 'removed' | 'modified';

export interface LearnerDiffHunk {
  type: LearnerDiffHunkType;
  /** One-based original line at which the hunk starts in teacher truth. */
  previousFromLine: number;
  /** One-based line at which the hunk starts in the visible document. */
  currentFromLine: number;
  /** Inclusive one-based final visible line. Equal to currentFromLine for removal-only hunks. */
  currentToLine: number;
  previousLines: string[];
  currentLines: string[];
}

export interface LearnerFileDiff {
  hunks: LearnerDiffHunk[];
  addedLineCount: number;
  removedLineCount: number;
}

type DiffOperation = { type: 'equal' | 'add' | 'remove'; line: string };
const MAX_LCS_CELLS = 1_500_000;

/** Computes a presentation-only, line-level diff. Inputs are never modified. */
export function computeLearnerFileDiff(baseContent: string, currentContent: string): LearnerFileDiff {
  const previous = splitLines(baseContent);
  const current = splitLines(currentContent);
  if (arraysEqual(previous, current)) return { hunks: [], addedLineCount: 0, removedLineCount: 0 };

  const operations = computeOperations(previous, current);
  const hunks: LearnerDiffHunk[] = [];
  let previousLine = 1;
  let currentLine = 1;
  let index = 0;

  while (index < operations.length) {
    if (operations[index].type === 'equal') {
      previousLine += 1;
      currentLine += 1;
      index += 1;
      continue;
    }

    const previousFromLine = previousLine;
    const currentFromLine = currentLine;
    const previousLines: string[] = [];
    const currentLines: string[] = [];
    while (index < operations.length && operations[index].type !== 'equal') {
      const operation = operations[index++];
      if (operation.type === 'remove') {
        previousLines.push(operation.line);
        previousLine += 1;
      }
      if (operation.type === 'add') {
        currentLines.push(operation.line);
        currentLine += 1;
      }
    }

    hunks.push({
      type: previousLines.length === 0 ? 'added' : currentLines.length === 0 ? 'removed' : 'modified',
      previousFromLine,
      currentFromLine,
      currentToLine: currentLines.length > 0 ? currentLine - 1 : currentFromLine,
      previousLines,
      currentLines,
    });
  }

  return {
    hunks,
    addedLineCount: hunks.reduce((total, hunk) => total + hunk.currentLines.length, 0),
    removedLineCount: hunks.reduce((total, hunk) => total + hunk.previousLines.length, 0),
  };
}

function computeOperations(previous: string[], current: string[]): DiffOperation[] {
  let prefixLength = 0;
  while (prefixLength < previous.length && prefixLength < current.length && previous[prefixLength] === current[prefixLength]) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < previous.length - prefixLength &&
    suffixLength < current.length - prefixLength &&
    previous[previous.length - 1 - suffixLength] === current[current.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const previousMiddle = previous.slice(prefixLength, previous.length - suffixLength);
  const currentMiddle = current.slice(prefixLength, current.length - suffixLength);
  const operations: DiffOperation[] = previous.slice(0, prefixLength).map((line) => ({ type: 'equal', line }));

  if (previousMiddle.length * currentMiddle.length > MAX_LCS_CELLS) {
    operations.push(...previousMiddle.map((line): DiffOperation => ({ type: 'remove', line })));
    operations.push(...currentMiddle.map((line): DiffOperation => ({ type: 'add', line })));
  } else {
    operations.push(...computeLcsOperations(previousMiddle, currentMiddle));
  }

  operations.push(...previous.slice(previous.length - suffixLength).map((line): DiffOperation => ({ type: 'equal', line })));
  return operations;
}

function computeLcsOperations(previous: string[], current: string[]): DiffOperation[] {
  const width = current.length + 1;
  const table = new Uint32Array((previous.length + 1) * width);
  for (let previousIndex = previous.length - 1; previousIndex >= 0; previousIndex -= 1) {
    for (let currentIndex = current.length - 1; currentIndex >= 0; currentIndex -= 1) {
      const tableIndex = previousIndex * width + currentIndex;
      table[tableIndex] = previous[previousIndex] === current[currentIndex]
        ? table[(previousIndex + 1) * width + currentIndex + 1] + 1
        : Math.max(table[(previousIndex + 1) * width + currentIndex], table[previousIndex * width + currentIndex + 1]);
    }
  }

  const operations: DiffOperation[] = [];
  let previousIndex = 0;
  let currentIndex = 0;
  while (previousIndex < previous.length || currentIndex < current.length) {
    if (previousIndex < previous.length && currentIndex < current.length && previous[previousIndex] === current[currentIndex]) {
      operations.push({ type: 'equal', line: previous[previousIndex] });
      previousIndex += 1;
      currentIndex += 1;
    } else if (
      currentIndex < current.length &&
      (previousIndex === previous.length || table[previousIndex * width + currentIndex + 1] >= table[(previousIndex + 1) * width + currentIndex])
    ) {
      operations.push({ type: 'add', line: current[currentIndex++] });
    } else {
      operations.push({ type: 'remove', line: previous[previousIndex++] });
    }
  }
  return operations;
}

function splitLines(content: string) {
  if (content === '') return [];
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  // A final newline terminates the previous line; it is not an additional blank code line.
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
