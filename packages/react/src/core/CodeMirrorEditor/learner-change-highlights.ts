import { RangeSet, StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, WidgetType, gutter, type DecorationSet } from '@codemirror/view';
import type { LearnerDiffHunk } from '../../Panels/interactive/history/learner-file-diff.js';

export interface LearnerChangeHighlightValue {
  hunks: LearnerDiffHunk[];
  pulse: boolean;
}

interface HighlightFieldValue {
  decorations: DecorationSet;
  gutterMarkers: RangeSet<GutterMarker>;
}

export const setLearnerChangeHighlights = StateEffect.define<LearnerChangeHighlightValue | null>();

class AddedLineGutterMarker extends GutterMarker {
  override toDOM() {
    const marker = document.createElement('span');
    marker.className = 'tk-learner-diff-added-marker';
    marker.textContent = '+';
    marker.setAttribute('aria-hidden', 'true');
    return marker;
  }
}

class AddedLineGutterSpacer extends GutterMarker {
  override toDOM() {
    const marker = document.createElement('span');
    marker.textContent = '+';
    marker.setAttribute('aria-hidden', 'true');
    return marker;
  }
}

class PreviousLinesWidget extends WidgetType {
  constructor(
    private readonly previousFromLine: number,
    private readonly lines: string[],
    private readonly pulse: boolean,
  ) {
    super();
  }

  override eq(other: PreviousLinesWidget) {
    return this.previousFromLine === other.previousFromLine
      && this.pulse === other.pulse
      && this.lines.join('\n') === other.lines.join('\n');
  }

  override toDOM() {
    const container = document.createElement('div');
    container.className = `tk-learner-inline-diff-removed${this.pulse ? ' tk-learner-change-pulse' : ''}`;
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', `${this.lines.length} removed teacher line${this.lines.length === 1 ? '' : 's'}`);
    container.setAttribute('contenteditable', 'false');

    this.lines.forEach((line, index) => {
      const row = document.createElement('div');
      row.className = 'tk-learner-inline-diff-removed-row';
      const sign = document.createElement('span');
      sign.className = 'tk-learner-inline-diff-sign';
      sign.textContent = '−';
      const lineNumber = document.createElement('span');
      lineNumber.className = 'tk-learner-inline-diff-line-number';
      lineNumber.textContent = String(this.previousFromLine + index);
      const code = document.createElement('span');
      code.className = 'tk-learner-inline-diff-code';
      code.textContent = line || ' ';
      row.append(sign, lineNumber, code);
      container.append(row);
    });
    return container;
  }

  override ignoreEvent() {
    return true;
  }
}

const emptyValue: HighlightFieldValue = {
  decorations: Decoration.none,
  gutterMarkers: RangeSet.empty,
};

const learnerChangeHighlightField = StateField.define<HighlightFieldValue>({
  create: () => emptyValue,
  update(value, transaction) {
    let nextValue: HighlightFieldValue = {
      decorations: value.decorations.map(transaction.changes),
      gutterMarkers: value.gutterMarkers.map(transaction.changes),
    };
    for (const effect of transaction.effects) {
      if (effect.is(setLearnerChangeHighlights)) {
        nextValue = effect.value ? buildHighlights(transaction.state, effect.value) : emptyValue;
      }
    }
    return nextValue;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

const learnerChangeGutter = gutter({
  class: 'tk-learner-change-gutter-column',
  markers: (view) => view.state.field(learnerChangeHighlightField).gutterMarkers,
  initialSpacer: () => new AddedLineGutterSpacer(),
});

const learnerChangeTheme = EditorView.baseTheme({
  '.cm-line.tk-learner-line-added, .cm-line.tk-learner-line-modified': {
    backgroundColor: 'color-mix(in srgb, #22c55e 16%, transparent)',
    boxShadow: 'inset 3px 0 0 color-mix(in srgb, #22c55e 78%, transparent)',
  },
  '.tk-learner-diff-added-marker': {
    display: 'inline-block',
    minWidth: '1.25rem',
    color: '#16a34a',
    fontFamily: 'var(--tk-font-family-mono, monospace)',
    fontWeight: '750',
    textAlign: 'center',
    userSelect: 'none',
  },
  '.tk-learner-inline-diff-removed': {
    overflow: 'hidden',
    borderLeft: '3px solid color-mix(in srgb, #ef4444 82%, transparent)',
    backgroundColor: 'color-mix(in srgb, #ef4444 16%, transparent)',
    color: '#dc2626',
    fontFamily: 'var(--tk-font-family-mono, monospace)',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    userSelect: 'none',
  },
  '.tk-learner-inline-diff-removed-row': {
    display: 'grid',
    gridTemplateColumns: '1.4rem 3rem minmax(0, 1fr)',
    minHeight: '1.4em',
    alignItems: 'baseline',
  },
  '.tk-learner-inline-diff-sign': {
    fontWeight: '750',
    textAlign: 'center',
  },
  '.tk-learner-inline-diff-line-number': {
    paddingRight: '0.65rem',
    color: 'color-mix(in srgb, #dc2626 72%, #64748b)',
    textAlign: 'right',
  },
  '.tk-learner-inline-diff-code': {
    overflow: 'hidden',
    paddingLeft: '0.35rem',
    whiteSpace: 'pre',
  },
  '.cm-line.tk-learner-change-pulse, .tk-learner-change-pulse': {
    animation: 'tk-learner-change-pulse 750ms ease-out 1',
  },
  '@keyframes tk-learner-change-pulse': {
    '0%': { filter: 'brightness(1.5)' },
    '100%': { filter: 'brightness(1)' },
  },
  '@media (prefers-reduced-motion: reduce)': {
    '.cm-line.tk-learner-change-pulse, .tk-learner-change-pulse': { animation: 'none' },
  },
});

export const learnerChangeHighlightExtension: Extension = [
  learnerChangeHighlightField,
  learnerChangeGutter,
  learnerChangeTheme,
];

function buildHighlights(state: EditorState, value: LearnerChangeHighlightValue): HighlightFieldValue {
  const decorationRanges: Range<Decoration>[] = [];
  const gutterRanges: Range<GutterMarker>[] = [];
  const documentLineCount = state.doc.lines;

  for (const hunk of value.hunks) {
    const firstVisibleLine = clampLine(hunk.currentFromLine, documentLineCount);
    const firstLine = state.doc.line(firstVisibleLine);

    if (hunk.previousLines.length > 0) {
      const isRemovalAfterDocument = hunk.type === 'removed' && hunk.currentFromLine > documentLineCount;
      decorationRanges.push(Decoration.widget({
        widget: new PreviousLinesWidget(hunk.previousFromLine, hunk.previousLines, value.pulse),
        block: true,
        side: isRemovalAfterDocument ? 1 : -1,
      }).range(isRemovalAfterDocument ? state.doc.length : firstLine.from));
    }

    if (hunk.currentLines.length > 0) {
      const finalVisibleLine = clampLine(hunk.currentToLine, documentLineCount);
      for (let visibleLine = firstVisibleLine; visibleLine <= finalVisibleLine; visibleLine += 1) {
        const line = state.doc.line(visibleLine);
        decorationRanges.push(Decoration.line({
          class: `tk-learner-line-${hunk.type}${value.pulse ? ' tk-learner-change-pulse' : ''}`,
          attributes: { 'data-learner-change': hunk.type },
        }).range(line.from));
        gutterRanges.push(new AddedLineGutterMarker().range(line.from));
      }
    }
  }

  return {
    decorations: Decoration.set(decorationRanges, true),
    gutterMarkers: RangeSet.of(gutterRanges, true),
  };
}

function clampLine(line: number, lineCount: number) {
  return Math.max(1, Math.min(lineCount, line));
}
