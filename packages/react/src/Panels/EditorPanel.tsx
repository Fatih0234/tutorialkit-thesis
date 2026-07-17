import type { I18n } from '@tutorialkit/types';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import {
  CodeMirrorEditor,
  type EditorDocument,
  type OnBeforeUserDocumentChangeCallback,
  type OnChangeCallback as OnEditorChange,
  type OnDocumentChangeCallback,
  type OnFocusChangeCallback,
  type OnSaveShortcutCallback,
  type OnScrollCallback as OnEditorScroll,
  type EditorPointerCoordinateApi,
  type InstructorEditorPresence,
  type OnSelectionChangeCallback as OnEditorSelectionChange,
  type OnSelectionRangeChangeCallback as OnEditorSelectionRangeChange,
} from '../core/CodeMirrorEditor/index.js';
import { FileTree } from '../core/FileTree.js';
import type { Theme } from '../core/types.js';
import resizePanelStyles from '../styles/resize-panel.module.css';
import { isMobile } from '../utils/mobile.js';
import { computeLearnerFileDiff, type LearnerFileDiff } from './interactive/history/learner-file-diff.js';

const DEFAULT_FILE_TREE_SIZE = 25;

export interface LearnerChangeComparison {
  kind: 'checkpoint' | 'draft';

  /** Null means the visible file was added by the learner. */
  baseContent: string | null;
  selectionKey: string;
}

interface Props {
  theme: Theme;
  id: unknown;
  files: ComponentProps<typeof FileTree>['files'];
  i18n: I18n;
  hideRoot?: boolean;
  fileTreeScope?: string;
  showFileTree?: boolean;
  helpAction?: 'solve' | 'reset';
  editorDocument?: EditorDocument;
  selectedFile?: string | undefined;
  readOnly?: boolean;
  documentSyncOrigin?: ComponentProps<typeof CodeMirrorEditor>['documentSyncOrigin'];
  allowEditPatterns?: ComponentProps<typeof FileTree>['allowEditPatterns'];

  /** @deprecated Use the immediate and settled callbacks. */
  onEditorChange?: OnEditorChange;
  onBeforeUserDocumentChange?: OnBeforeUserDocumentChangeCallback;
  onEditorDocumentChangeImmediate?: OnDocumentChangeCallback;
  onEditorDocumentChangeSettled?: OnDocumentChangeCallback;
  onEditorSaveShortcut?: OnSaveShortcutCallback;
  onEditorFocusChange?: OnFocusChangeCallback;
  onEditorScroll?: OnEditorScroll;
  onEditorSelectionChange?: OnEditorSelectionChange;
  onEditorSelectionRangeChange?: OnEditorSelectionRangeChange;
  instructorPresence?: InstructorEditorPresence | null;
  learnerChangedFilePaths?: string[];
  learnerChangeComparison?: LearnerChangeComparison;
  onPointerCoordinateApiChange?: (api: EditorPointerCoordinateApi | null) => void;
  onHelpClick?: () => void;
  onFileSelect?: (value?: string) => void;
  onFileTreeChange?: ComponentProps<typeof FileTree>['onFileChange'];
}

export function EditorPanel({
  theme,
  id,
  files,
  i18n,
  hideRoot,
  fileTreeScope,
  showFileTree = true,
  helpAction,
  editorDocument,
  selectedFile,
  readOnly,
  documentSyncOrigin,
  allowEditPatterns,
  onEditorChange,
  onBeforeUserDocumentChange,
  onEditorDocumentChangeImmediate,
  onEditorDocumentChangeSettled,
  onEditorSaveShortcut,
  onEditorFocusChange,
  onEditorScroll,
  onEditorSelectionChange,
  onEditorSelectionRangeChange,
  instructorPresence,
  learnerChangedFilePaths,
  learnerChangeComparison,
  onPointerCoordinateApiChange,
  onHelpClick,
  onFileSelect,
  onFileTreeChange,
}: Props) {
  const fileTreePanelRef = useRef<ImperativePanelHandle>(null);
  const [learnerHighlightsEnabled, setLearnerHighlightsEnabled] = useState(false);
  const [learnerChangeNavigationRequest, setLearnerChangeNavigationRequest] = useState<{
    id: number;
    direction: 'previous' | 'next';
  }>();
  const diffSourceKey =
    learnerChangeComparison && editorDocument
      ? `${learnerChangeComparison.selectionKey}:${editorDocument.filePath}`
      : '';
  const currentTextContent = typeof editorDocument?.value === 'string' ? editorDocument.value : '';
  const [settledDiffSource, setSettledDiffSource] = useState({ key: diffSourceKey, content: currentTextContent });
  const learnerFileDiff = useMemo<LearnerFileDiff | undefined>(() => {
    if (!learnerChangeComparison || !editorDocument || typeof editorDocument.value !== 'string') {
      return undefined;
    }

    const content = settledDiffSource.key === diffSourceKey ? settledDiffSource.content : editorDocument.value;

    return computeLearnerFileDiff(learnerChangeComparison.baseContent ?? '', content);
  }, [
    diffSourceKey,
    editorDocument?.value,
    learnerChangeComparison?.baseContent,
    learnerChangeComparison?.selectionKey,
    settledDiffSource,
  ]);

  useEffect(() => {
    if (!diffSourceKey) {
      return;
    }

    if (settledDiffSource.key !== diffSourceKey) {
      setSettledDiffSource({ key: diffSourceKey, content: currentTextContent });
      return;
    }

    const timeout = window.setTimeout(() => {
      setSettledDiffSource({ key: diffSourceKey, content: currentTextContent });
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [currentTextContent, diffSourceKey]);

  useEffect(() => {
    setLearnerHighlightsEnabled(false);
  }, [learnerChangeComparison?.selectionKey]);

  useEffect(() => {
    const { current: fileTreePanel } = fileTreePanelRef;

    if (!fileTreePanel) {
      return;
    }

    if (showFileTree) {
      if (fileTreePanel.isCollapsed()) {
        fileTreePanel.resize(DEFAULT_FILE_TREE_SIZE);
      }
    } else if (!showFileTree) {
      fileTreePanel.collapse();
    }
  }, [id]);

  return (
    <PanelGroup className="bg-tk-elements-panel-backgroundColor" direction="horizontal">
      <Panel className="flex flex-col" collapsible defaultSize={0} minSize={10} ref={fileTreePanelRef}>
        <div className="panel-header border-r border-b border-tk-elements-app-borderColor">
          <div className="panel-title">
            <div className="panel-icon i-ph-tree-structure-duotone shrink-0"></div>
            <span className="text-sm">{i18n.filesTitleText}</span>
          </div>
        </div>
        <FileTree
          className="flex flex-col flex-grow py-2 border-r border-tk-elements-app-borderColor text-sm overflow-y-auto overflow-x-hidden"
          i18n={i18n}
          selectedFile={selectedFile}
          hideRoot={hideRoot ?? true}
          files={files}
          scope={fileTreeScope}
          allowEditPatterns={allowEditPatterns}
          onFileSelect={onFileSelect}
          onFileChange={onFileTreeChange}
          learnerChangedFilePaths={learnerChangedFilePaths}
        />
      </Panel>
      <PanelResizeHandle
        disabled={!showFileTree}
        className={resizePanelStyles.PanelResizeHandle}
        hitAreaMargins={{ fine: 8, coarse: 8 }}
      />
      <Panel className="flex flex-col" defaultSize={100} minSize={10}>
        <FileTab
          i18n={i18n}
          editorDocument={editorDocument}
          onHelpClick={onHelpClick}
          helpAction={helpAction}
          learnerChangeComparison={learnerChangeComparison}
          learnerFileDiff={learnerFileDiff}
          learnerHighlightsEnabled={learnerHighlightsEnabled}
          onLearnerHighlightsEnabledChange={setLearnerHighlightsEnabled}
          onNavigateLearnerChange={(direction) =>
            setLearnerChangeNavigationRequest((current) => ({ id: (current?.id ?? 0) + 1, direction }))
          }
        />
        <div className="h-full flex-1 overflow-hidden">
          <CodeMirrorEditor
            className="h-full"
            theme={theme}
            id={id}
            doc={editorDocument}
            autoFocusOnDocumentChange={!isMobile()}
            readOnly={readOnly}
            documentSyncOrigin={documentSyncOrigin}
            onScroll={onEditorScroll}
            onChange={onEditorChange}
            onBeforeUserDocumentChange={onBeforeUserDocumentChange}
            onDocumentChangeImmediate={onEditorDocumentChangeImmediate}
            onDocumentChangeSettled={onEditorDocumentChangeSettled}
            onSaveShortcut={onEditorSaveShortcut}
            onFocusChange={onEditorFocusChange}
            onSelectionChange={onEditorSelectionChange}
            onSelectionRangeChange={onEditorSelectionRangeChange}
            instructorPresence={instructorPresence}
            learnerChangeDiff={learnerFileDiff}
            learnerChangeHighlightsEnabled={learnerHighlightsEnabled}
            learnerChangeSelectionKey={
              learnerChangeComparison ? `${learnerChangeComparison.selectionKey}:${editorDocument?.filePath ?? ''}` : ''
            }
            learnerChangeNavigationRequest={learnerChangeNavigationRequest}
            onPointerCoordinateApiChange={onPointerCoordinateApiChange}
          />
        </div>
      </Panel>
    </PanelGroup>
  );
}

interface FileTabProps {
  i18n: I18n;
  editorDocument: EditorDocument | undefined;
  helpAction?: 'reset' | 'solve';
  onHelpClick?: () => void;
  learnerChangeComparison?: LearnerChangeComparison;
  learnerFileDiff?: LearnerFileDiff;
  learnerHighlightsEnabled: boolean;
  onLearnerHighlightsEnabledChange: (enabled: boolean) => void;
  onNavigateLearnerChange: (direction: 'previous' | 'next') => void;
}

function FileTab({
  i18n,
  editorDocument,
  helpAction,
  onHelpClick,
  learnerChangeComparison,
  learnerFileDiff,
  learnerHighlightsEnabled,
  onLearnerHighlightsEnabledChange,
  onNavigateLearnerChange,
}: FileTabProps) {
  const filePath = editorDocument?.filePath;
  const fileName = filePath?.split('/').at(-1) ?? '';
  const icon = fileName ? getFileIcon(fileName) : '';

  return (
    <div className="panel-header border-b border-tk-elements-app-borderColor flex justify-between">
      <div className="panel-title">
        <div className={`panel-icon scale-125 ${icon}`}></div>
        <span className="text-sm">{fileName}</span>
      </div>
      <div className="flex items-center gap-1">
        {learnerChangeComparison && learnerFileDiff ? (
          <div aria-label="Learner changes" className="mr-1 flex items-center gap-1 text-xs">
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${learnerChangeComparison.kind === 'draft' ? 'bg-orange-500/15 text-orange-300' : 'bg-violet-500/15 text-violet-300'}`}
            >
              {learnerChangeComparison.kind === 'draft' ? 'Autosaved draft' : 'Checkpoint'}
            </span>
            <span className="whitespace-nowrap text-tk-text-secondary">
              {learnerFileDiff.hunks.length === 0
                ? learnerChangeComparison.baseContent === null
                  ? 'Added empty file'
                  : 'No changes'
                : `${learnerFileDiff.hunks.length} changed area${learnerFileDiff.hunks.length === 1 ? '' : 's'}`}
            </span>
            <button
              type="button"
              className="panel-button px-1.5 py-0.5"
              title="Previous learner change"
              aria-label="Previous learner change"
              disabled={!learnerHighlightsEnabled || learnerFileDiff.hunks.length === 0}
              onClick={() => onNavigateLearnerChange('previous')}
            >
              <span className="i-ph-arrow-up" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="panel-button px-1.5 py-0.5"
              title="Next learner change"
              aria-label="Next learner change"
              disabled={!learnerHighlightsEnabled || learnerFileDiff.hunks.length === 0}
              onClick={() => onNavigateLearnerChange('next')}
            >
              <span className="i-ph-arrow-down" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="panel-button px-1.5 py-0.5"
              title={`${learnerHighlightsEnabled ? 'Hide' : 'Review'} learner changes`}
              aria-label="Review learner changes"
              aria-pressed={learnerHighlightsEnabled}
              onClick={() => onLearnerHighlightsEnabledChange(!learnerHighlightsEnabled)}
            >
              <span className={learnerHighlightsEnabled ? 'i-ph-eye' : 'i-ph-eye-slash'} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {!!helpAction && (
          <button onClick={onHelpClick} disabled={!onHelpClick} className="panel-button px-2 py-0.5 -mr-1 -my-1">
            {helpAction === 'solve' && <div className="i-ph-lightbulb-duotone text-lg" />}
            {helpAction === 'solve' && i18n.solveButtonText}
            {helpAction === 'reset' && <div className="i-ph-clock-counter-clockwise-duotone" />}
            {helpAction === 'reset' && i18n.resetButtonText}
          </button>
        )}
      </div>
    </div>
  );
}

function getFileIcon(fileName: string) {
  const extension = fileName.split('.').at(-1);

  if (!extension) {
    console.error('Cannot infer file type');
    return null;
  }

  switch (extension) {
    case 'ts': {
      return 'i-languages-ts?mask';
    }
    case 'cjs':
    case 'mjs':
    case 'js': {
      return 'i-languages-js?mask';
    }
    case 'html': {
      return 'i-languages-html?mask';
    }
    case 'css': {
      return 'i-languages-css?mask';
    }
    case 'scss':
    case 'sass': {
      return 'i-languages-sass?mask';
    }
    case 'md': {
      return 'i-languages-markdown?mask';
    }
    case 'json': {
      return 'i-languages-json?mask';
    }
    case 'gif':
    case 'jpg':
    case 'jpeg':
    case 'png': {
      return 'i-ph-image';
    }
    default: {
      return null;
    }
  }
}
