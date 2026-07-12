import { useEffect, useRef, type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import resizePanelStyles from '../styles/resize-panel.module.css';
import { InteractiveButton } from './InteractivePocUi.js';

interface InteractiveWorkspaceSurfaceProps {
  children: ReactNode;
  presentationLayer?: ReactNode;
  aiControl?: ReactNode;
  explanationHtml: string;
  explanationOpen: boolean;
  terminalOpen: boolean;
  terminalAvailable: boolean;
  explanationSize: number;
  terminalSize: number;
  onExplanationOpenChange: (open: boolean) => void;
  onTerminalOpenChange: (open: boolean) => void;
  onExplanationSizeChange: (size: number) => void;
  onTerminalSizeChange: (size: number) => void;
  onTerminalHostChange: (host: HTMLDivElement | null) => void;
}

export function InteractiveWorkspaceSurface({
  children,
  presentationLayer,
  aiControl,
  explanationHtml,
  explanationOpen,
  terminalOpen,
  terminalAvailable,
  explanationSize,
  terminalSize,
  onExplanationOpenChange,
  onTerminalOpenChange,
  onExplanationSizeChange,
  onTerminalSizeChange,
  onTerminalHostChange,
}: InteractiveWorkspaceSurfaceProps) {
  const explanationRef = useRef<ImperativePanelHandle>(null);
  const terminalRef = useRef<ImperativePanelHandle>(null);

  useEffect(() => {
    if (explanationOpen) {
      explanationRef.current?.resize(explanationSize);
    } else {
      explanationRef.current?.collapse();
    }
  }, [explanationOpen, explanationSize]);

  useEffect(() => {
    if (terminalOpen && terminalAvailable) {
      terminalRef.current?.resize(terminalSize);
    } else {
      terminalRef.current?.collapse();
    }
  }, [terminalAvailable, terminalOpen, terminalSize]);

  return (
    <section aria-label="Interactive workspace" className="relative flex min-h-0 flex-1 flex-col bg-tk-elements-panel-backgroundColor">
      <nav aria-label="Workspace panels" className="flex h-10 shrink-0 items-center gap-1 border-b border-tk-elements-app-borderColor bg-tk-background-primary px-3">
        <span className="mr-2 text-[10px] font-700 uppercase tracking-[0.12em] text-tk-text-secondary">Workspace</span>
        <InteractiveButton
          variant="ghost"
          icon="i-ph-book-open-text"
          aria-pressed={explanationOpen}
          onClick={() => onExplanationOpenChange(!explanationOpen)}
          className={explanationOpen ? 'bg-tk-background-active text-tk-text-primary' : undefined}
        >
          Explanation
        </InteractiveButton>
        <InteractiveButton
          variant="ghost"
          icon="i-ph-terminal-window"
          aria-pressed={terminalOpen}
          disabled={!terminalAvailable}
          title={terminalAvailable ? 'Show or hide the live terminal' : 'This lesson has no terminal'}
          onClick={() => onTerminalOpenChange(!terminalOpen)}
          className={terminalOpen ? 'bg-tk-background-active text-tk-text-primary' : undefined}
        >
          Terminal
        </InteractiveButton>
        {terminalAvailable ? <span className="ml-auto hidden text-xs text-tk-text-secondary sm:inline">Terminal activity is live and is not included in playback.</span> : null}
        {aiControl}
      </nav>

      <PanelGroup direction="horizontal" className="min-h-0 flex-1">
        <Panel
          ref={explanationRef}
          id="interactive-explanation"
          defaultSize={explanationOpen ? explanationSize : 0}
          minSize={18}
          maxSize={45}
          collapsible
          onCollapse={() => onExplanationOpenChange(false)}
          onExpand={() => onExplanationOpenChange(true)}
          onResize={(size) => size > 0 && onExplanationSizeChange(size)}
          className={explanationOpen ? 'min-w-0 bg-tk-elements-panel-backgroundColor' : 'hidden'}
        >
          <aside aria-label="Lesson explanation" className="flex h-full min-w-0 flex-col border-r border-tk-elements-app-borderColor">
            <div className="panel-header shrink-0 border-b border-tk-elements-app-borderColor">
              <div className="panel-title">
                <span className="panel-icon i-ph-book-open-text" aria-hidden="true" />
                <span className="text-sm">Explanation</span>
              </div>
              <InteractiveButton variant="ghost" icon="i-ph-x" onClick={() => onExplanationOpenChange(false)} className="ml-auto px-2">
                <span className="sr-only">Close explanation</span>
              </InteractiveButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {explanationHtml ? (
                <div className="markdown-content text-tk-elements-content-textColor" dangerouslySetInnerHTML={{ __html: explanationHtml }} />
              ) : (
                <p className="text-sm text-tk-text-secondary">No lesson explanation is available.</p>
              )}
            </div>
          </aside>
        </Panel>
        <PanelResizeHandle
          disabled={!explanationOpen}
          className={resizePanelStyles.PanelResizeHandle}
          hitAreaMargins={{ fine: 8, coarse: 8 }}
        />
        <Panel id="interactive-editor-and-terminal" defaultSize={100} minSize={40} className="min-w-0">
          <PanelGroup direction="vertical" className="min-h-0 h-full">
            <Panel id="interactive-editor" defaultSize={100} minSize={30} className="min-h-0">
              {children}
            </Panel>
            <PanelResizeHandle
              disabled={!terminalOpen || !terminalAvailable}
              className={resizePanelStyles.PanelResizeHandle}
              hitAreaMargins={{ fine: 8, coarse: 8 }}
            />
            <Panel
              ref={terminalRef}
              id="interactive-terminal"
              defaultSize={terminalOpen && terminalAvailable ? terminalSize : 0}
              minSize={18}
              maxSize={65}
              collapsible
              onCollapse={() => onTerminalOpenChange(false)}
              onExpand={() => onTerminalOpenChange(true)}
              onResize={(size) => size > 0 && onTerminalSizeChange(size)}
              className={terminalOpen && terminalAvailable ? 'min-h-0 border-t border-tk-elements-app-borderColor' : 'hidden'}
            >
              <div ref={onTerminalHostChange} aria-label="Live terminal panel" className="h-full overflow-hidden" />
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
      {presentationLayer}
    </section>
  );
}
