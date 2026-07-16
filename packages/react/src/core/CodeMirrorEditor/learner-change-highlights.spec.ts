import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { learnerChangeHighlightExtension, setLearnerChangeHighlights } from './learner-change-highlights.js';

describe('learner change highlights', () => {
  it('updates presentation state without changing editor content', () => {
    const state = EditorState.create({ doc: 'one\ntwo', extensions: [learnerChangeHighlightExtension] });
    const transaction = state.update({
      effects: setLearnerChangeHighlights.of({
        pulse: false,
        hunks: [{
          type: 'modified',
          previousFromLine: 2,
          currentFromLine: 2,
          currentToLine: 2,
          previousLines: ['old'],
          currentLines: ['two'],
        }],
      }),
    });

    expect(transaction.docChanged).toBe(false);
    expect(transaction.state.doc.toString()).toBe('one\ntwo');
  });

  it('can clear decorations without changing editor content', () => {
    const state = EditorState.create({ doc: 'one', extensions: [learnerChangeHighlightExtension] });
    const transaction = state.update({ effects: setLearnerChangeHighlights.of(null) });
    expect(transaction.docChanged).toBe(false);
    expect(transaction.state.doc.toString()).toBe('one');
  });
});
