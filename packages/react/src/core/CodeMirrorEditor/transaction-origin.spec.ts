import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { editorTransactionOrigin, getEditorTransactionOrigin } from './transaction-origin.js';

describe('editor transaction origin', () => {
  const state = EditorState.create({ doc: 'hello' });

  it('classifies unannotated document transactions as user changes', () => {
    const transaction = state.update({ changes: { from: 5, insert: '!' } });

    expect(getEditorTransactionOrigin(transaction)).toBe('user');
  });

  it('preserves explicit programmatic origins', () => {
    const origins = [
      'teacher-playback',
      'learner-history-restore',
      'lesson-reset',
      'runtime-sync',
      'external-document-sync',
    ] as const;

    for (const origin of origins) {
      const transaction = state.update({
        changes: { from: 0, to: state.doc.length, insert: 'updated' },
        annotations: editorTransactionOrigin.of(origin),
      });

      expect(getEditorTransactionOrigin(transaction)).toBe(origin);
    }
  });
});
