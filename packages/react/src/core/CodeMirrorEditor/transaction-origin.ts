import { Annotation, type Transaction } from '@codemirror/state';

export type EditorTransactionOrigin =
  | 'user'
  | 'teacher-playback'
  | 'learner-history-restore'
  | 'lesson-reset'
  | 'runtime-sync'
  | 'external-document-sync';

/** Annotates document changes dispatched by application code. Unannotated edits are user edits. */
export const editorTransactionOrigin = Annotation.define<EditorTransactionOrigin>();

export function getEditorTransactionOrigin(transaction: Transaction): EditorTransactionOrigin {
  return transaction.annotation(editorTransactionOrigin) ?? 'user';
}
