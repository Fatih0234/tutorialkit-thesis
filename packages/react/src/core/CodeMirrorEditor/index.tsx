import { acceptCompletion, autocompletion, closeBrackets } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, foldGutter, indentOnInput, indentUnit } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { Compartment, EditorSelection, EditorState, type Extension, type Transaction } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  scrollPastEnd,
} from '@codemirror/view';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { LearnerFileDiff } from '../../Panels/interactive/history/learner-file-diff.js';
import { classNames } from '../../utils/classnames.js';
import { debounce } from '../../utils/debounce.js';
import type { Theme } from '../types.js';
import { BinaryContent } from './BinaryContent.js';
import { getTheme, reconfigureTheme } from './cm-theme.js';
import { indentKeyBinding } from './indent.js';
import {
  instructorPresenceExtension,
  setInstructorPresence,
  type InstructorEditorPresence,
} from './instructor-presence.js';
import { getLanguage } from './languages.js';
import { learnerChangeHighlightExtension, setLearnerChangeHighlights } from './learner-change-highlights.js';
import { learnerPresenceExtension, setBlurredLearnerCaret } from './learner-presence.js';
import { getEditorTextSelection, type EditorTextSelection } from './selection.js';
import {
  editorTransactionOrigin,
  getEditorTransactionOrigin,
  type EditorTransactionOrigin,
} from './transaction-origin.js';

export interface EditorDocument {
  value: string | Uint8Array;
  loading: boolean;
  filePath: string;
  scroll?: ScrollPosition;
}

export interface EditorSettings {
  fontSize?: string;
  tabSize?: number;
}

type TextEditorDocument = EditorDocument & {
  value: string;
};

export interface ScrollPosition {
  top: number;
  left: number;
}

export interface EditorUpdate {
  selection: EditorSelection;
  content: string;
}

export interface EditorUserMutationContext {
  filePath: string;
  content: string;
  selection: EditorSelectionRange;
}

export type OnChangeCallback = (update: EditorUpdate) => void;
export type OnBeforeUserDocumentChangeCallback = () => boolean;
export type OnDocumentChangeCallback = (update: EditorUserMutationContext, origin: EditorTransactionOrigin) => void;
export type OnSaveShortcutCallback = (update: EditorUserMutationContext) => void;
export type OnFocusChangeCallback = (focused: boolean, selection: EditorSelectionRange) => void;
export type OnScrollCallback = (position: ScrollPosition) => void;
export type EditorSelectionRange = { anchor: number; head: number };
export type OnSelectionChangeCallback = (selection: EditorTextSelection | null) => void;
export type OnSelectionRangeChangeCallback = (selection: EditorSelectionRange) => void;
export interface EditorPointerCoordinateApi {
  positionAtCoordinates(
    clientX: number,
    clientY: number,
  ): { filePath: string; documentOffset: number; offsetX: number; offsetY: number } | null;
  coordinatesAtPosition(position: {
    filePath: string;
    documentOffset: number;
    offsetX: number;
    offsetY: number;
  }): { clientX: number; clientY: number } | null;
}
export type { InstructorEditorPresence } from './instructor-presence.js';
export type { EditorTextSelection } from './selection.js';
export {
  editorTransactionOrigin,
  getEditorTransactionOrigin,
  type EditorTransactionOrigin,
} from './transaction-origin.js';

export interface LearnerChangeNavigationRequest {
  id: number;
  direction: 'previous' | 'next';
}

export interface Props {
  theme: Theme;
  id?: unknown;
  doc?: EditorDocument;
  debounceChange?: number;
  debounceScroll?: number;
  autoFocusOnDocumentChange?: boolean;
  readOnly?: boolean;
  documentSyncOrigin?: EditorTransactionOrigin;

  /** @deprecated Use onDocumentChangeSettled. */
  onChange?: OnChangeCallback;
  onBeforeUserDocumentChange?: OnBeforeUserDocumentChangeCallback;
  onDocumentChangeImmediate?: OnDocumentChangeCallback;
  onDocumentChangeSettled?: OnDocumentChangeCallback;
  onSaveShortcut?: OnSaveShortcutCallback;
  onFocusChange?: OnFocusChangeCallback;
  onScroll?: OnScrollCallback;
  onSelectionChange?: OnSelectionChangeCallback;
  onSelectionRangeChange?: OnSelectionRangeChangeCallback;
  instructorPresence?: InstructorEditorPresence | null;
  learnerChangeDiff?: LearnerFileDiff;
  learnerChangeHighlightsEnabled?: boolean;
  learnerChangeSelectionKey?: string;
  learnerChangeNavigationRequest?: LearnerChangeNavigationRequest;
  onPointerCoordinateApiChange?: (api: EditorPointerCoordinateApi | null) => void;
  className?: string;
  settings?: EditorSettings;
}

type EditorStates = Map<string, EditorState>;

export function CodeMirrorEditor({
  id,
  doc,
  debounceScroll = 100,
  debounceChange = 150,
  autoFocusOnDocumentChange = false,
  readOnly: forceReadOnly = false,
  documentSyncOrigin = 'external-document-sync',
  onScroll,
  onChange,
  onBeforeUserDocumentChange,
  onDocumentChangeImmediate,
  onDocumentChangeSettled,
  onSaveShortcut,
  onFocusChange,
  onSelectionChange,
  onSelectionRangeChange,
  instructorPresence,
  learnerChangeDiff,
  learnerChangeHighlightsEnabled = true,
  learnerChangeSelectionKey = '',
  learnerChangeNavigationRequest,
  onPointerCoordinateApiChange,
  theme,
  settings,
  className = '',
}: Props) {
  const [language] = useState(new Compartment());
  const [readOnly] = useState(new Compartment());

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView>();
  const themeRef = useRef<Theme>();
  const docRef = useRef<EditorDocument>();
  const editorStatesRef = useRef<EditorStates>();
  const onScrollRef = useRef(onScroll);
  const onChangeRef = useRef(onChange);
  const onBeforeUserDocumentChangeRef = useRef(onBeforeUserDocumentChange);
  const onDocumentChangeImmediateRef = useRef(onDocumentChangeImmediate);
  const onDocumentChangeSettledRef = useRef(onDocumentChangeSettled);
  const onSaveShortcutRef = useRef(onSaveShortcut);
  const onFocusChangeRef = useRef(onFocusChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onSelectionRangeChangeRef = useRef(onSelectionRangeChange);
  const lastLearnerChangeSelectionKeyRef = useRef('');

  const isBinaryFile = doc?.value instanceof Uint8Array;

  onScrollRef.current = onScroll;
  onChangeRef.current = onChange;
  onBeforeUserDocumentChangeRef.current = onBeforeUserDocumentChange;
  onDocumentChangeImmediateRef.current = onDocumentChangeImmediate;
  onDocumentChangeSettledRef.current = onDocumentChangeSettled;
  onSaveShortcutRef.current = onSaveShortcut;
  onFocusChangeRef.current = onFocusChange;
  onSelectionChangeRef.current = onSelectionChange;
  onSelectionRangeChangeRef.current = onSelectionRangeChange;
  docRef.current = doc;
  themeRef.current = theme;

  useEffect(() => {
    const onUpdate = debounce(
      (update: EditorUserMutationContext, origin: EditorTransactionOrigin, legacyUpdate: EditorUpdate) => {
        onDocumentChangeSettledRef.current?.(update, origin);
        onChangeRef.current?.(legacyUpdate);
      },
      debounceChange,
    );
    const onSelectionUpdate = debounce((selection: EditorSelectionRange) => {
      onSelectionRangeChangeRef.current?.(selection);
    }, debounceChange);

    const view = new EditorView({
      parent: containerRef.current!,
      dispatchTransactions(transactions) {
        const changedTransactions = transactions.filter((transaction) => transaction.docChanged);
        const hasUserDocumentChange = changedTransactions.some(
          (transaction) => getEditorTransactionOrigin(transaction) === 'user',
        );

        if (hasUserDocumentChange && onBeforeUserDocumentChangeRef.current?.() === false) {
          return;
        }

        const previousSelection = view.state.selection;

        view.update(transactions);

        const newSelection = view.state.selection;

        const selectionChanged =
          newSelection !== previousSelection &&
          (newSelection === undefined || previousSelection === undefined || !newSelection.eq(previousSelection));

        if (selectionChanged && docRef.current && typeof docRef.current.value === 'string') {
          const { anchor, head } = view.state.selection.main;
          onSelectionChangeRef.current?.(
            getEditorTextSelection(docRef.current.filePath, view.state.doc.toString(), anchor, head),
          );
        }

        if (docRef.current && !docRef.current.loading && changedTransactions.length > 0) {
          const origin = getCombinedTransactionOrigin(changedTransactions);
          const { anchor, head } = view.state.selection.main;
          const update: EditorUserMutationContext = {
            filePath: docRef.current.filePath,
            content: view.state.doc.toString(),
            selection: { anchor, head },
          };
          const legacyUpdate: EditorUpdate = {
            selection: view.state.selection,
            content: update.content,
          };

          onDocumentChangeImmediateRef.current?.(update, origin);
          onUpdate(update, origin, legacyUpdate);
        }

        if (selectionChanged) {
          const { anchor, head } = view.state.selection.main;
          onSelectionUpdate({ anchor, head });
        }

        if (docRef.current && !docRef.current.loading) {
          editorStatesRef.current?.set(docRef.current.filePath, view.state);
        }
      },
    });

    viewRef.current = view;

    const pointerCoordinateApi: EditorPointerCoordinateApi = {
      positionAtCoordinates(clientX, clientY) {
        const document = docRef.current;
        const editorBounds = view.dom.getBoundingClientRect();

        if (
          clientX < editorBounds.left ||
          clientX > editorBounds.right ||
          clientY < editorBounds.top ||
          clientY > editorBounds.bottom ||
          !document ||
          typeof document.value !== 'string'
        ) {
          return null;
        }

        const documentOffset = view.posAtCoords({ x: clientX, y: clientY }, false) ?? view.state.selection.main.head;
        const coordinates = view.coordsAtPos(documentOffset);

        if (!coordinates) {
          return null;
        }

        return {
          filePath: document.filePath,
          documentOffset,
          offsetX: clientX - coordinates.left,
          offsetY: clientY - coordinates.top,
        };
      },
      coordinatesAtPosition(position) {
        const document = docRef.current;

        if (!document || document.filePath !== position.filePath || typeof document.value !== 'string') {
          return null;
        }

        const coordinates = view.coordsAtPos(Math.min(view.state.doc.length, Math.max(0, position.documentOffset)));

        if (!coordinates) {
          return null;
        }

        return { clientX: coordinates.left + position.offsetX, clientY: coordinates.top + position.offsetY };
      },
    };
    (
      view.dom as HTMLElement & { __tutorialKitPointerCoordinateApi?: EditorPointerCoordinateApi }
    ).__tutorialKitPointerCoordinateApi = pointerCoordinateApi;
    onPointerCoordinateApiChange?.(pointerCoordinateApi);

    // we grab the style tag that codemirror mounts
    const codemirrorStyleTag = document.head.children[0];
    codemirrorStyleTag.setAttribute('data-astro-transition-persist', 'codemirror');

    return () => {
      onPointerCoordinateApiChange?.(null);
      delete (view.dom as HTMLElement & { __tutorialKitPointerCoordinateApi?: EditorPointerCoordinateApi })
        .__tutorialKitPointerCoordinateApi;
      viewRef.current?.destroy();
      viewRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }

    viewRef.current.dispatch({
      effects: [reconfigureTheme(theme)],
      annotations: editorTransactionOrigin.of('runtime-sync'),
    });
  }, [theme]);

  useEffect(() => {
    editorStatesRef.current = new Map<string, EditorState>();
  }, [id]);

  useEffect(() => {
    const editorStates = editorStatesRef.current!;
    const view = viewRef.current!;
    const theme = themeRef.current!;

    if (!doc) {
      setNoDocument(view);
      return;
    }

    if (doc.value instanceof Uint8Array) {
      return;
    }

    let state = editorStates.get(doc.filePath);

    if (!state) {
      state = newEditorState(
        doc.value,
        theme,
        settings,
        onScrollRef,
        onSaveShortcutRef,
        onFocusChangeRef,
        docRef,
        debounceScroll,
        [
          language.of([]),
          readOnly.of([EditorState.readOnly.of(doc.loading || forceReadOnly)]),
          instructorPresenceExtension,
          learnerPresenceExtension,
          learnerChangeHighlightExtension,
        ],
      );

      editorStates.set(doc.filePath, state);
    }

    view.setState(state);

    setEditorDocument(
      view,
      theme,
      language,
      readOnly,
      autoFocusOnDocumentChange,
      forceReadOnly,
      documentSyncOrigin,
      doc as TextEditorDocument,
    );
  }, [
    doc?.value,
    doc?.filePath,
    doc?.loading,
    autoFocusOnDocumentChange,
    forceReadOnly,
    documentSyncOrigin,
  ]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view || !doc || doc.value instanceof Uint8Array) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      const left = doc.scroll?.left ?? 0;
      const top = doc.scroll?.top ?? 0;

      if (view.scrollDOM.scrollLeft !== left || view.scrollDOM.scrollTop !== top) {
        view.scrollDOM.scrollTo(left, top);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [doc?.filePath, doc?.scroll?.left, doc?.scroll?.top]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    const visiblePresence =
      instructorPresence && instructorPresence.filePath === doc?.filePath ? instructorPresence : null;
    view.dispatch({
      effects: setInstructorPresence.of(visiblePresence),
      annotations: editorTransactionOrigin.of('teacher-playback'),
    });
  }, [
    doc?.filePath,
    instructorPresence?.filePath,
    instructorPresence?.anchor,
    instructorPresence?.head,
    instructorPresence?.visible,
  ]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view || !doc || doc.value instanceof Uint8Array) {
      return undefined;
    }

    const shouldPulse =
      Boolean(learnerChangeDiff?.hunks.length) &&
      learnerChangeSelectionKey !== lastLearnerChangeSelectionKeyRef.current;
    lastLearnerChangeSelectionKeyRef.current = learnerChangeSelectionKey;
    view.dispatch({
      effects: setLearnerChangeHighlights.of(
        learnerChangeHighlightsEnabled && learnerChangeDiff
          ? { hunks: learnerChangeDiff.hunks, pulse: shouldPulse }
          : null,
      ),
      annotations: editorTransactionOrigin.of('runtime-sync'),
    });

    return undefined;
  }, [doc?.filePath, learnerChangeDiff, learnerChangeHighlightsEnabled, learnerChangeSelectionKey]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view || !learnerChangeNavigationRequest || !learnerChangeDiff?.hunks.length) {
      return;
    }

    const positions = learnerChangeDiff.hunks.map((hunk) => {
      const lineNumber = Math.max(1, Math.min(view.state.doc.lines, hunk.currentFromLine));
      return view.state.doc.line(lineNumber).from;
    });
    const cursor = view.state.selection.main.head;
    const target =
      learnerChangeNavigationRequest.direction === 'next'
        ? (positions.find((position) => position > cursor) ?? positions[0])
        : ([...positions].reverse().find((position) => position < cursor) ?? positions.at(-1)!);
    view.dispatch({
      selection: { anchor: target },
      effects: EditorView.scrollIntoView(target, { y: 'center' }),
      annotations: editorTransactionOrigin.of('runtime-sync'),
    });
    view.focus();
  }, [learnerChangeNavigationRequest?.id]);

  return (
    <div className={classNames('relative', className)}>
      {isBinaryFile && <BinaryContent />}
      <div className="h-full overflow-hidden" ref={containerRef} />
    </div>
  );
}

export default CodeMirrorEditor;

CodeMirrorEditor.displayName = 'CodeMirrorEditor';

function newEditorState(
  content: string,
  theme: Theme,
  settings: EditorSettings | undefined,
  onScrollRef: MutableRefObject<OnScrollCallback | undefined>,
  onSaveShortcutRef: MutableRefObject<OnSaveShortcutCallback | undefined>,
  onFocusChangeRef: MutableRefObject<OnFocusChangeCallback | undefined>,
  docRef: MutableRefObject<EditorDocument | undefined>,
  debounceScroll: number,
  extensions: Extension[],
) {
  return EditorState.create({
    doc: content,
    extensions: [
      EditorView.contentAttributes.of({ 'aria-label': 'Editor' }),
      EditorView.domEventHandlers({
        scroll: debounce((_event, view) => {
          onScrollRef.current?.({ left: view.scrollDOM.scrollLeft, top: view.scrollDOM.scrollTop });
        }, debounceScroll),
        focus: (_event, view) => {
          const { anchor, head } = view.state.selection.main;
          view.dispatch({
            effects: setBlurredLearnerCaret.of(null),
            annotations: editorTransactionOrigin.of('runtime-sync'),
          });
          onFocusChangeRef.current?.(true, { anchor, head });
        },
        blur: (_event, view) => {
          const { anchor, head } = view.state.selection.main;
          view.dispatch({
            effects: setBlurredLearnerCaret.of(head),
            annotations: editorTransactionOrigin.of('runtime-sync'),
          });
          onFocusChangeRef.current?.(false, { anchor, head });
        },
      }),
      getTheme(theme, settings),
      history(),
      keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run(view) {
            const document = docRef.current;

            if (!document || typeof document.value !== 'string') {
              return true;
            }

            const { anchor, head } = view.state.selection.main;
            onSaveShortcutRef.current?.({
              filePath: document.filePath,
              content: view.state.doc.toString(),
              selection: { anchor, head },
            });

            return true;
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        { key: 'Tab', run: acceptCompletion },
        indentKeyBinding,
      ]),
      indentUnit.of('\t'),
      autocompletion({
        closeOnBlur: false,
      }),
      closeBrackets(),
      lineNumbers(),
      scrollPastEnd(),
      dropCursor(),
      drawSelection(),
      bracketMatching(),
      EditorState.tabSize.of(settings?.tabSize ?? 2),
      indentOnInput(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      foldGutter({
        markerDOM: (open) => {
          const icon = document.createElement('div');

          icon.className = `fold-icon ${open ? 'i-ph-caret-down-bold' : 'i-ph-caret-right-bold'}`;

          return icon;
        },
      }),
      ...extensions,
    ],
  });
}

function getCombinedTransactionOrigin(transactions: readonly Transaction[]): EditorTransactionOrigin {
  const origins = transactions.map(getEditorTransactionOrigin);
  return origins.includes('user') ? 'user' : (origins[origins.length - 1] ?? 'user');
}

function setNoDocument(view: EditorView) {
  view.dispatch({
    selection: { anchor: 0 },
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: '',
    },
    annotations: editorTransactionOrigin.of('external-document-sync'),
  });

  view.scrollDOM.scrollTo(0, 0);
}

function setEditorDocument(
  view: EditorView,
  theme: Theme,
  language: Compartment,
  readOnly: Compartment,
  autoFocus: boolean,
  forceReadOnly: boolean,
  documentSyncOrigin: EditorTransactionOrigin,
  doc: TextEditorDocument,
) {
  if (doc.value !== view.state.doc.toString()) {
    view.dispatch({
      selection: { anchor: 0 },
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: doc.value,
      },
      annotations: editorTransactionOrigin.of(documentSyncOrigin),
    });
  }

  view.dispatch({
    effects: [readOnly.reconfigure([EditorState.readOnly.of(doc.loading || forceReadOnly)])],
    annotations: editorTransactionOrigin.of(documentSyncOrigin),
  });

  getLanguage(doc.filePath).then((languageSupport) => {
    if (!languageSupport) {
      return;
    }

    view.dispatch({
      effects: [language.reconfigure([languageSupport]), reconfigureTheme(theme)],
      annotations: editorTransactionOrigin.of('runtime-sync'),
    });

    requestAnimationFrame(() => {
      const currentLeft = view.scrollDOM.scrollLeft;
      const currentTop = view.scrollDOM.scrollTop;
      const newLeft = doc.scroll?.left ?? 0;
      const newTop = doc.scroll?.top ?? 0;

      const needsScrolling = currentLeft !== newLeft || currentTop !== newTop;

      if (autoFocus) {
        if (needsScrolling) {
          // we have to wait until the scroll position was changed before we can set the focus
          view.scrollDOM.addEventListener(
            'scroll',
            () => {
              view.focus();
            },
            { once: true },
          );
        } else {
          // if the scroll position is still the same we can focus immediately
          view.focus();
        }
      }

      view.scrollDOM.scrollTo(newLeft, newTop);
    });
  });
}
