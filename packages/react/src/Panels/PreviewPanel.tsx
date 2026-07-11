import { useStore } from '@nanostores/react';
import type { PreviewInfo, TutorialStore } from '@tutorialkit/runtime';
import type { I18n } from '@tutorialkit/types';
import { reloadPreview } from '@webcontainer/api/utils';
import { createElement, forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { BootScreen } from '../BootScreen.js';
import resizePanelStyles from '../styles/resize-panel.module.css';
import { classNames } from '../utils/classnames.js';

interface Props {
  embedIframes?: boolean;
  showToggleTerminal?: boolean;
  toggleTerminal?: () => void;
  tutorialStore: TutorialStore;
  i18n: I18n;
}

const previewsContainer = globalThis.document ? document.getElementById('previews-container')! : ({} as HTMLElement);

type IFrameRef = { ref: HTMLIFrameElement | undefined; container: HTMLElement | undefined };

export type ImperativePreviewHandle = {
  reload: () => void;
};

export const PreviewPanel = memo(
  forwardRef<ImperativePreviewHandle, Props>(({ embedIframes = false, showToggleTerminal, toggleTerminal, i18n, tutorialStore }, ref) => {
    const expectedPreviews = useStore(tutorialStore.previews);
    const iframeRefs = useRef<IFrameRef[]>([]);

    const onResize = useCallback(() => {
      for (const { ref, container } of iframeRefs.current) {
        if (!ref || !container) {
          continue;
        }

        if (embedIframes) {
          ref.style.left = '0';
          ref.style.top = '0';
          ref.style.height = '100%';
          ref.style.width = '100%';
        } else {
          const { left, top, width, height } = container.getBoundingClientRect();
          ref.style.left = `${left}px`;
          ref.style.top = `${top}px`;
          ref.style.height = `${height}px`;
          ref.style.width = `${width}px`;
        }
      }
    }, [embedIframes]);

    const activePreviewsCount = expectedPreviews.reduce((count, preview) => (preview.ready ? count + 1 : count), 0);
    const hasPreviews = activePreviewsCount > 0;

    useImperativeHandle(
      ref,
      () => ({
        reload: () => {
          for (const iframe of iframeRefs.current) {
            if (iframe.ref) {
              iframe.ref.src = iframe.ref.src;
            }
          }
        },
      }),
      [],
    );

    useEffect(() => {
      // we update the iframes position at max fps if we have any
      if (hasPreviews) {
        const cancel = requestAnimationFrameLoop(onResize);

        previewsContainer.style.display = 'block';

        return () => {
          previewsContainer.style.display = 'none';
          cancel();
        };
      }

      return undefined;
    }, [hasPreviews]);

    adjustIframeRefs(iframeRefs.current, activePreviewsCount);

    if (!hasPreviews) {
      return (
        <div className="panel-container transition-theme bg-tk-elements-panel-backgroundColor text-tk-elements-panel-textColor">
          <div className="panel-header border-b border-tk-elements-app-borderColor justify-between">
            <div className="panel-title">
              <div className="panel-icon i-ph-lightning-duotone"></div>
              <span className="text-sm">{i18n.prepareEnvironmentTitleText}</span>
            </div>
            {showToggleTerminal && (
              <button
                className="panel-button px-2 py-0.5 -mr-1 -my-1"
                title="Toggle Terminal"
                onClick={() => toggleTerminal?.()}
              >
                <span className="panel-button-icon i-ph-terminal-window-duotone"></span>
                <span className="text-sm">{i18n.toggleTerminalButtonText}</span>
              </button>
            )}
          </div>
          <BootScreen tutorialStore={tutorialStore} />
        </div>
      );
    }

    const previews = expectedPreviews.filter((preview) => preview.ready);
    const defaultSize = 100 / previews.length;
    const minSize = 20;

    const children = [];

    for (const [index, preview] of previews.entries()) {
      children.push(
        <Panel defaultSize={defaultSize} minSize={minSize}>
          <Preview
            iframe={iframeRefs.current[index]}
            embedIframe={embedIframes}
            preview={preview}
            previewCount={previews.length}
            first={index === 0}
            last={index === previews.length - 1}
            toggleTerminal={toggleTerminal}
            i18n={i18n}
          />
        </Panel>,
      );

      if (index !== previews.length - 1) {
        children.push(<PanelResizeHandle className={resizePanelStyles.PanelResizeHandle} />);
      }
    }

    return createElement(PanelGroup, { direction: 'horizontal' }, ...children);
  }),
);
PreviewPanel.displayName = 'PreviewPanel';

interface PreviewProps {
  iframe: IFrameRef;
  embedIframe: boolean;
  preview: PreviewInfo;
  previewCount: number;
  first?: boolean;
  last?: boolean;
  toggleTerminal?: () => void;
  i18n: I18n;
}

function Preview({ preview, iframe, embedIframe, previewCount, first, last, toggleTerminal, i18n }: PreviewProps) {
  const previewContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!iframe.ref) {
      return;
    }

    iframe.container = previewContainerRef.current!;

    if (embedIframe) {
      iframe.container.appendChild(iframe.ref);
    }

    if (preview.url) {
      iframe.ref.src = preview.url;
    }

    if (preview.title) {
      iframe.ref.title = preview.title;
    }

    return () => {
      if (embedIframe && iframe.ref && previewsContainer.isConnected) {
        previewsContainer.appendChild(iframe.ref);
      }
    };
  }, [embedIframe, preview.url, iframe.ref]);

  function reload() {
    if (iframe.ref) {
      reloadPreview(iframe.ref);
    }
  }

  return (
    <div className="panel-container">
      <div
        className={classNames('panel-header border-b border-tk-elements-app-borderColor justify-between', {
          'border-l border-tk-elements-app-borderColor': !first,
        })}
      >
        <div className="panel-title">
          <button
            onClick={reload}
            title={i18n.reloadPreviewTitle}
            className="panel-button rounded-full p-1.5 -my-1.5 -ml-2"
          >
            <div className="panel-icon i-ph-arrow-clockwise"></div>
          </button>
          <span className="text-sm truncate">{previewTitle(preview, previewCount, i18n)}</span>
        </div>
        {last && (
          <button
            className="panel-button px-2 py-0.5 -mr-1 -my-1"
            title="Toggle Terminal"
            onClick={() => toggleTerminal?.()}
          >
            <div className="panel-button-icon i-ph-terminal-window-duotone"></div>
            <span className="text-sm">{i18n.toggleTerminalButtonText}</span>
          </button>
        )}
      </div>
      <div
        ref={previewContainerRef}
        className={classNames('relative h-full w-full flex justify-center items-center', {
          'border-l border-tk-elements-previews-borderColor': !first,
        })}
      />
    </div>
  );
}

function requestAnimationFrameLoop(loop: () => void): () => void {
  let handle: number;

  const callback = () => {
    loop();
    handle = requestAnimationFrame(callback);
  };

  handle = requestAnimationFrame(callback);

  return () => {
    cancelAnimationFrame(handle);
  };
}

function previewTitle(preview: PreviewInfo, previewCount: number, i18n: I18n) {
  if (preview.title) {
    return preview.title;
  }

  if (previewCount === 1) {
    return i18n.defaultPreviewTitleText;
  }

  return `Preview on port ${preview.port}`;
}

function adjustIframeRefs(refs: IFrameRef[], expectedSize: number) {
  while (refs.length < expectedSize) {
    const iframe = document.createElement('iframe');

    iframe.className = 'absolute z-10';
    iframe.allow =
      document.featurePolicy?.allowedFeatures().join('; ') ??
      'magnetometer; accelerometer; gyroscope; geolocation; microphone; camera; payment; autoplay; serial; xr-spatial-tracking; cross-origin-isolated';
    previewsContainer.appendChild(iframe);
    refs.push({ ref: iframe, container: undefined });
  }

  while (refs.length > expectedSize) {
    refs.pop()?.ref?.remove();
  }
}

declare global {
  interface Document {
    featurePolicy:
      | {
          allowedFeatures(): string[];
        }
      | undefined;
  }
}
