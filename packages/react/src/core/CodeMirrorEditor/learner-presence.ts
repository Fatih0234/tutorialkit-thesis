import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';

export const setBlurredLearnerCaret = StateEffect.define<number | null>();

class BlurredLearnerCaretWidget extends WidgetType {
  toDOM() {
    const caret = document.createElement('span');
    caret.className = 'cm-learner-blurred-caret';
    caret.setAttribute('aria-label', 'Learner cursor');
    caret.setAttribute('data-learner-cursor', 'blurred');

    return caret;
  }

  ignoreEvent() {
    return true;
  }
}

export const blurredLearnerCaretField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let nextDecorations = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (!effect.is(setBlurredLearnerCaret)) {
        continue;
      }

      if (effect.value === null) {
        nextDecorations = Decoration.none;
        continue;
      }

      const position = Math.min(transaction.state.doc.length, Math.max(0, Math.floor(effect.value)));
      nextDecorations = Decoration.set([
        Decoration.widget({ widget: new BlurredLearnerCaretWidget(), side: 1 }).range(position),
      ]);
    }

    return nextDecorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const learnerPresenceTheme = EditorView.baseTheme({
  '&.cm-focused .cm-cursor': {
    borderLeftColor: '#f97316',
  },
  '&.cm-focused .cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'rgba(249, 115, 22, 0.28) !important',
  },
  '.cm-learner-blurred-caret': {
    borderLeft: '2px solid rgba(249, 115, 22, 0.55)',
    height: '1.35em',
    marginLeft: '-1px',
    pointerEvents: 'none',
  },
});

export const learnerPresenceExtension: Extension = [blurredLearnerCaretField, learnerPresenceTheme];
