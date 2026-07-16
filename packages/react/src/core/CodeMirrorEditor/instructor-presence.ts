import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';

export interface InstructorEditorPresence {
  filePath: string;
  anchor: number;
  head: number;
  visible: boolean;
}

export const setInstructorPresence = StateEffect.define<InstructorEditorPresence | null>();

class InstructorCaretWidget extends WidgetType {
  toDOM() {
    const caret = document.createElement('span');
    caret.className = 'cm-instructor-caret';
    caret.setAttribute('aria-label', 'Instructor cursor');
    caret.setAttribute('data-instructor-cursor', 'true');

    return caret;
  }

  ignoreEvent() {
    return true;
  }
}

export const instructorPresenceField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let nextDecorations = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (!effect.is(setInstructorPresence)) {
        continue;
      }

      const presence = effect.value;

      if (!presence?.visible) {
        nextDecorations = Decoration.none;
        continue;
      }

      const anchor = clampOffset(presence.anchor, transaction.state.doc.length);
      const head = clampOffset(presence.head, transaction.state.doc.length);

      nextDecorations = anchor === head
        ? Decoration.set([
            Decoration.widget({ widget: new InstructorCaretWidget(), side: 1 }).range(head),
          ])
        : Decoration.set([
            Decoration.mark({
              class: 'cm-instructor-selection',
              attributes: { 'data-instructor-selection': 'true', 'aria-label': 'Instructor selection' },
            }).range(Math.min(anchor, head), Math.max(anchor, head)),
          ]);
    }

    return nextDecorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const instructorPresenceTheme = EditorView.baseTheme({
  '.cm-instructor-caret': {
    borderLeft: '2px solid #3b82f6',
    height: '1.35em',
    marginLeft: '-1px',
    pointerEvents: 'none',
  },
  '.cm-instructor-selection': {
    backgroundColor: 'rgba(59, 130, 246, 0.28)',
    borderBottom: '1px solid rgba(96, 165, 250, 0.9)',
  },
});

export const instructorPresenceExtension: Extension = [instructorPresenceField, instructorPresenceTheme];

function clampOffset(offset: number, documentLength: number) {
  return Math.min(documentLength, Math.max(0, Math.floor(offset)));
}
