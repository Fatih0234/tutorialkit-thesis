import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
  blurredLearnerCaretField,
  learnerPresenceExtension,
  setBlurredLearnerCaret,
} from './learner-presence.js';

function caretPositions(state: EditorState) {
  const positions: number[] = [];
  state.field(blurredLearnerCaretField).between(0, state.doc.length, (from) => {
    positions.push(from);
  });

  return positions;
}

describe('learner editor presence', () => {
  it('retains a faded caret position while blurred and clears it on focus', () => {
    const state = EditorState.create({ doc: 'abcdef', extensions: [learnerPresenceExtension] });
    const blurred = state.update({ effects: setBlurredLearnerCaret.of(3) }).state;

    expect(caretPositions(blurred)).toEqual([3]);

    const focused = blurred.update({ effects: setBlurredLearnerCaret.of(null) }).state;
    expect(caretPositions(focused)).toEqual([]);
  });

  it('clamps a restored learner caret to the document', () => {
    const state = EditorState.create({ doc: 'abc', extensions: [learnerPresenceExtension] });
    const blurred = state.update({ effects: setBlurredLearnerCaret.of(99) }).state;

    expect(caretPositions(blurred)).toEqual([3]);
  });
});
