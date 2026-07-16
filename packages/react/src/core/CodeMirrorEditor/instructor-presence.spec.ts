import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
  instructorPresenceField,
  instructorPresenceExtension,
  setInstructorPresence,
} from './instructor-presence.js';

function decorationRanges(state: EditorState) {
  const ranges: Array<{ from: number; to: number; className?: string }> = [];
  state.field(instructorPresenceField).between(0, state.doc.length, (from, to, value) => {
    ranges.push({ from, to, className: value.spec.class });
  });

  return ranges;
}

describe('instructor editor presence', () => {
  it('renders instructor selection without replacing native learner selection', () => {
    const initialSelection = EditorSelection.single(1, 3);
    const state = EditorState.create({
      doc: 'abcdef',
      selection: initialSelection,
      extensions: [instructorPresenceExtension],
    });
    const transaction = state.update({
      effects: setInstructorPresence.of({
        filePath: '/example.js',
        anchor: 2,
        head: 5,
        visible: true,
      }),
    });
    const updated = transaction.state;

    expect(updated.selection.eq(initialSelection)).toBe(true);
    expect(decorationRanges(updated)).toEqual([
      { from: 2, to: 5, className: 'cm-instructor-selection' },
    ]);
  });

  it('renders and clears a collapsed instructor caret', () => {
    const state = EditorState.create({ doc: 'abcdef', extensions: [instructorPresenceExtension] });
    const visible = state.update({
      effects: setInstructorPresence.of({
        filePath: '/example.js',
        anchor: 4,
        head: 4,
        visible: true,
      }),
    }).state;

    expect(decorationRanges(visible)).toEqual([{ from: 4, to: 4, className: undefined }]);

    const hidden = visible.update({ effects: setInstructorPresence.of(null) }).state;
    expect(decorationRanges(hidden)).toEqual([]);
  });
});
