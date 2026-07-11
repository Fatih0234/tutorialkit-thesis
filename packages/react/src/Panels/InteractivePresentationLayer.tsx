import { useEffect, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import {
  WORKSPACE_EDITOR_SURFACE_ID,
  movePresentationSurface,
  resolvePresentationComposition,
  setPresentationComposition,
  setPresentationMode,
  type DeckPresentationResource,
  type DeckPlaybackState,
  type PresentationCompositionPreset,
  type PresentationLayout,
  type PresentationMode,
  type PresentationResource,
  type PresentationSlide,
  type PresentationSlideElement,
  type SlidePresentationResource,
  type WhiteboardScene,
} from '@tutorialkit/runtime';
import type { DeckAction } from './useInteractivePoc.js';
import { InteractiveButton } from './InteractivePocUi.js';
import { InteractiveWhiteboard } from './interactive/whiteboard/InteractiveWhiteboard.js';

interface Props {
  audience: 'teacher' | 'learner';
  resources: PresentationResource[];
  layout: PresentationLayout;
  workspaceContent: ReactNode;
  canArrange: boolean;
  hasLearnerOverride: boolean;
  explanationHtml: string;
  canEditDeck: boolean;
  onModeChange: (resourceId: string, mode: PresentationMode) => void;
  onLayoutPreview: (layout: PresentationLayout) => void;
  onLayoutCommit: (layout: PresentationLayout) => void;
  onDeckAction: (deckId: string, action: DeckAction, slideIndex?: number) => void;
  onDeckChange: (deck: DeckPresentationResource) => void;
  onFollowTeacher: () => void;
  onPreviewHostChange: (host: HTMLDivElement | null) => void;
  cameraMediaUrl: string;
  onCameraMediaElementRef: (element: HTMLMediaElement | null) => void;
  whiteboardScene: WhiteboardScene;
  whiteboardReadOnly: boolean;
  whiteboardError: string;
  onWhiteboardSceneCommit: (scene: WhiteboardScene) => void;
}

export function InteractivePresentationLayer(props: Props) {
  const {
    audience,
    resources,
    layout,
    workspaceContent,
    canArrange,
    hasLearnerOverride,
    explanationHtml,
    canEditDeck,
    onModeChange,
    onLayoutPreview,
    onLayoutCommit,
    onDeckAction,
    onDeckChange,
    onFollowTeacher,
    onPreviewHostChange,
    cameraMediaUrl,
    onCameraMediaElementRef,
    whiteboardScene,
    whiteboardReadOnly,
    whiteboardError,
    onWhiteboardSceneCommit,
  } = props;
  const composition = resolvePresentationComposition(resources, layout);
  const [arranging, setArranging] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const hasSecondary = composition.preset !== 'focus' && Boolean(composition.secondarySurfaceId);

  useEffect(() => {
    if (!root) return undefined;
    const observer = new ResizeObserver(([entry]) => setNarrow((entry?.contentRect.width ?? root.clientWidth) < 760));
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"], .cm-editor, .xterm')) return;
      if (event.key === 'Escape' && composition.preset === 'focus' && composition.secondarySurfaceId) {
        event.preventDefault();
        onLayoutCommit(setPresentationComposition(resources, layout, { preset: 'stage-with-sidecar' }));
      }
      const focused = resources.find(
        (resource) => resource.id === composition.primarySurfaceId && resource.kind === 'deck',
      );
      if (focused && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        onDeckAction(focused.id, event.key === 'ArrowRight' ? 'next-reveal' : 'previous-reveal');
      } else if (focused && (event.key === 'PageDown' || event.key === 'PageUp')) {
        event.preventDefault();
        onDeckAction(focused.id, event.key === 'PageDown' ? 'next-slide' : 'previous-slide');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    composition.preset,
    composition.primarySurfaceId,
    composition.secondarySurfaceId,
    layout,
    onDeckAction,
    onLayoutCommit,
    resources,
  ]);

  const update = (next: PresentationLayout, commit = true) => (commit ? onLayoutCommit(next) : onLayoutPreview(next));
  const move = (surfaceId: string, target: 'primary' | 'secondary' | 'tray') =>
    update(movePresentationSurface(resources, layout, surfaceId, target));
  const focusSurface = (surfaceId: string) =>
    update(
      setPresentationComposition(resources, movePresentationSurface(resources, layout, surfaceId, 'primary'), {
        preset: 'focus',
      }),
    );
  const setPreset = (preset: PresentationCompositionPreset) =>
    update(setPresentationComposition(resources, layout, { preset }));
  const onDrop = (event: DragEvent, target: 'primary' | 'secondary' | 'tray') => {
    event.preventDefault();
    const surfaceId = event.dataTransfer.getData('text/presentation-surface');
    if (surfaceId) move(surfaceId, target);
  };
  const gridStyle = {
    gridTemplateColumns:
      !hasSecondary || narrow
        ? 'minmax(0, 1fr)'
        : `minmax(0, ${composition.splitRatio}fr) minmax(0, ${1 - composition.splitRatio}fr)`,
    gridTemplateRows: hasSecondary && narrow ? 'minmax(0, 1fr) minmax(12rem, .72fr)' : 'minmax(0, 1fr)',
  } satisfies CSSProperties;

  return (
    <div
      ref={setRoot}
      data-presentation-layer
      data-composition-preset={composition.preset}
      data-composition-responsive={narrow ? 'stacked' : 'split'}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-tk-elements-panel-backgroundColor"
    >
      <nav
        aria-label="Lesson composition"
        className="flex min-h-11 shrink-0 flex-wrap items-center gap-1 border-b border-tk-elements-app-borderColor bg-tk-background-primary px-2 py-1"
      >
        <strong className="mr-1 text-[10px] uppercase tracking-[0.12em] text-tk-text-secondary">Lesson view</strong>
        {canArrange ? (
          <InteractiveButton
            variant={arranging ? 'primary' : 'ghost'}
            icon="i-ph-layout"
            aria-pressed={arranging}
            onClick={() => setArranging(!arranging)}
          >
            Arrange Layout
          </InteractiveButton>
        ) : null}
        <InteractiveButton
          variant="ghost"
          aria-pressed={composition.preset === 'focus'}
          onClick={() => setPreset('focus')}
        >
          Focus
        </InteractiveButton>
        <InteractiveButton
          variant="ghost"
          aria-pressed={composition.preset === 'side-by-side'}
          disabled={!composition.secondarySurfaceId}
          onClick={() => setPreset('side-by-side')}
        >
          Side-by-side
        </InteractiveButton>
        <InteractiveButton
          variant="ghost"
          aria-pressed={composition.preset === 'stage-with-sidecar'}
          disabled={!composition.secondarySurfaceId}
          onClick={() => setPreset('stage-with-sidecar')}
        >
          Stage with Sidecar
        </InteractiveButton>
        {audience === 'learner' && hasLearnerOverride ? (
          <InteractiveButton variant="primary" icon="i-ph-broadcast" onClick={onFollowTeacher} className="ml-auto">
            Follow Teacher
          </InteractiveButton>
        ) : null}
      </nav>

      <div className="relative min-h-0 flex-1">
        <div
          data-composition-grid
          className="grid h-full min-h-0 gap-1 bg-tk-elements-app-borderColor"
          style={gridStyle}
        >
          <CompositionSurface
            id={WORKSPACE_EDITOR_SURFACE_ID}
            title="Editor"
            role={surfaceRole(
              WORKSPACE_EDITOR_SURFACE_ID,
              composition.primarySurfaceId,
              composition.secondarySurfaceId,
              hasSecondary,
            )}
            arranging={arranging}
            onMove={move}
            onFocus={focusSurface}
            onDrop={onDrop}
          >
            {workspaceContent}
          </CompositionSurface>
          {resources
            .filter((resource) => resource.kind !== 'camera')
            .map((resource) => (
              <CompositionSurface
                key={resource.id}
                id={resource.id}
                title={resource.title}
                role={
                  layout.resources[resource.id] === 'hidden'
                    ? 'hidden'
                    : surfaceRole(
                        resource.id,
                        composition.primarySurfaceId,
                        composition.secondarySurfaceId,
                        hasSecondary,
                      )
                }
                arranging={arranging}
                onMove={move}
                onFocus={focusSurface}
                onDrop={onDrop}
                onHide={() => onModeChange(resource.id, 'hidden')}
              >
                <ResourceContent
                  resource={resource}
                  compact={resource.id === composition.secondarySurfaceId}
                  explanationHtml={explanationHtml}
                  canEditDeck={canEditDeck && resource.id === composition.primarySurfaceId}
                  onDeckAction={onDeckAction}
                  onDeckChange={onDeckChange}
                  onPreviewHostChange={onPreviewHostChange}
                  whiteboardScene={whiteboardScene}
                  whiteboardReadOnly={whiteboardReadOnly}
                  whiteboardError={whiteboardError}
                  onWhiteboardSceneCommit={onWhiteboardSceneCommit}
                  layout={layout}
                />
              </CompositionSurface>
            ))}
        </div>

        {hasSecondary && !narrow ? (
          <label className="pointer-events-auto absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-tk-elements-app-borderColor bg-tk-background-primary/95 px-3 py-1 text-[10px] shadow-lg">
            Stage split
            <input
              aria-label="Stage split ratio"
              type="range"
              min="50"
              max="80"
              value={Math.round(composition.splitRatio * 100)}
              onChange={(event) =>
                update(
                  setPresentationComposition(resources, layout, { splitRatio: Number(event.target.value) / 100 }),
                  false,
                )
              }
              onPointerUp={(event) =>
                update(
                  setPresentationComposition(resources, layout, {
                    splitRatio: Number((event.target as HTMLInputElement).value) / 100,
                  }),
                )
              }
              onKeyUp={(event) =>
                update(
                  setPresentationComposition(resources, layout, {
                    splitRatio: Number((event.target as HTMLInputElement).value) / 100,
                  }),
                )
              }
            />
          </label>
        ) : null}

        <div
          aria-label="Resource tray"
          data-composition-tray
          className="pointer-events-auto absolute bottom-2 left-2 z-40 flex max-w-[calc(100%-1rem)] flex-wrap gap-1 rounded-lg border border-tk-elements-app-borderColor bg-tk-background-primary/95 p-1 shadow-lg"
          onDragOver={(event) => arranging && event.preventDefault()}
          onDrop={(event) => onDrop(event, 'tray')}
        >
          <TrayButton
            id={WORKSPACE_EDITOR_SURFACE_ID}
            title="Editor"
            hidden={
              composition.primarySurfaceId === WORKSPACE_EDITOR_SURFACE_ID ||
              composition.secondarySurfaceId === WORKSPACE_EDITOR_SURFACE_ID
            }
            arranging={arranging}
            onMove={move}
            onFocus={focusSurface}
          />
          {resources
            .filter((resource) => resource.kind !== 'camera')
            .map((resource) => (
              <TrayButton
                key={resource.id}
                id={resource.id}
                title={resource.title}
                hidden={
                  layout.resources[resource.id] === 'hidden' ||
                  composition.primarySurfaceId === resource.id ||
                  composition.secondarySurfaceId === resource.id
                }
                arranging={arranging}
                onMove={move}
                onFocus={focusSurface}
                onHide={() => onModeChange(resource.id, 'hidden')}
              />
            ))}
          {resources
            .filter((resource) => resource.kind !== 'camera' && layout.resources[resource.id] === 'hidden')
            .map((resource) => (
              <InteractiveButton
                key={`hidden-${resource.id}`}
                variant="ghost"
                icon={resourceIcon(resource)}
                aria-label={`Show presentation resource: ${resource.title}`}
                onClick={() => onModeChange(resource.id, 'minimized')}
              >
                Show {resource.title}
          </InteractiveButton>
        ))}
      </div>

        <CameraOverlay
          resources={resources}
          layout={layout}
          composition={composition}
          mediaUrl={cameraMediaUrl}
          mediaRef={onCameraMediaElementRef}
          arranging={arranging}
          onLayoutCommit={onLayoutCommit}
          onModeChange={onModeChange}
        />
        </div>
    </div>
  );
}

type SurfaceRole = 'primary' | 'secondary' | 'tray' | 'hidden';
function surfaceRole(id: string, primary: string, secondary: string | undefined, showSecondary: boolean): SurfaceRole {
  return id === primary ? 'primary' : showSecondary && id === secondary ? 'secondary' : 'tray';
}

function CompositionSurface({
  id,
  title,
  role,
  arranging,
  onMove,
  onFocus,
  onDrop,
  onHide,
  children,
}: {
  id: string;
  title: string;
  role: SurfaceRole;
  arranging: boolean;
  onMove: (id: string, target: 'primary' | 'secondary' | 'tray') => void;
  onFocus: (id: string) => void;
  onDrop: (event: DragEvent, target: 'primary' | 'secondary' | 'tray') => void;
  onHide?: () => void;
  children: ReactNode;
}) {
  const active = role === 'primary' || role === 'secondary';
  return (
    <section
      aria-label={`${title} ${active ? `${role} stage` : 'presentation'}`}
      aria-hidden={!active}
      data-composition-surface={id}
      data-composition-role={role}
      data-presentation-resource={id === WORKSPACE_EDITOR_SURFACE_ID ? undefined : id}
      data-presentation-mode={
        role === 'primary' ? 'focused' : role === 'secondary' || role === 'tray' ? 'minimized' : 'hidden'
      }
      className={
        active
          ? 'relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-tk-elements-panel-backgroundColor'
          : 'absolute -left-[10000px] top-0 flex h-px w-px flex-col overflow-hidden opacity-0'
      }
      onDragOver={(event) => arranging && event.preventDefault()}
      onDrop={(event) => active && onDrop(event, role)}
    >
      <header
        draggable={arranging && active}
        onDragStart={(event) => event.dataTransfer.setData('text/presentation-surface', id)}
        className={`flex h-9 shrink-0 items-center gap-2 border-b border-tk-elements-app-borderColor bg-tk-background-primary px-2 ${arranging && active ? 'cursor-grab ring-1 ring-inset ring-tk-text-accent' : ''}`}
      >
        <span className="i-ph-dots-six-vertical text-tk-text-secondary" aria-hidden="true" />
        <strong className="min-w-0 flex-1 truncate text-xs">{title}</strong>
        {active && role !== 'primary' ? (
          <InteractiveButton variant="ghost" icon="i-ph-arrows-out-simple" onClick={() => onFocus(id)} className="px-2">
            <span className="sr-only">Focus {title}</span>
          </InteractiveButton>
        ) : null}
        {active ? (
          <InteractiveButton variant="ghost" icon="i-ph-minus" onClick={() => onMove(id, 'tray')} className="px-2">
            <span className="sr-only">Minimize {title}</span>
          </InteractiveButton>
        ) : null}
        {active && onHide ? (
          <InteractiveButton variant="ghost" icon="i-ph-x" onClick={onHide} className="px-2">
            <span className="sr-only">Hide {title}</span>
          </InteractiveButton>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      {arranging && active ? (
        <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-lg border-2 border-dashed border-tk-text-accent bg-tk-background-primary/20 text-xs font-700 uppercase tracking-wider">
          {role === 'primary' ? 'Main Stage' : 'Sidecar'}
        </div>
      ) : null}
    </section>
  );
}

function TrayButton({
  id,
  title,
  hidden,
  arranging,
  onMove,
  onFocus,
  onHide,
}: {
  id: string;
  title: string;
  hidden: boolean;
  arranging: boolean;
  onMove: (id: string, target: 'primary' | 'secondary' | 'tray') => void;
  onFocus: (id: string) => void;
  onHide?: () => void;
}) {
  if (hidden) return null;
  return (
    <div
      data-composition-tray-item={id}
      draggable={arranging}
      onDragStart={(event) => event.dataTransfer.setData('text/presentation-surface', id)}
      className="flex items-center rounded border border-tk-elements-app-borderColor bg-tk-background-secondary"
    >
      <InteractiveButton variant="ghost" aria-label={`Focus ${title}`} onClick={() => onFocus(id)}>
        {title}
      </InteractiveButton>
      {arranging ? (
        <>
          <button type="button" className="px-1 text-[10px]" onClick={() => onMove(id, 'primary')}>
            Main
          </button>
          <button type="button" className="px-1 text-[10px]" onClick={() => onMove(id, 'secondary')}>
            Side
          </button>
        </>
      ) : null}
      {onHide ? (
        <button type="button" aria-label={`Hide ${title}`} className="px-1 text-xs" onClick={onHide}>
          ×
        </button>
      ) : null}
    </div>
  );
}

function ResourceContent({
  resource,
  compact,
  explanationHtml,
  canEditDeck,
  onDeckAction,
  onDeckChange,
  onPreviewHostChange,
  whiteboardScene,
  whiteboardReadOnly,
  whiteboardError,
  onWhiteboardSceneCommit,
  layout,
}: {
  resource: PresentationResource;
  compact: boolean;
  explanationHtml: string;
  canEditDeck: boolean;
  onDeckAction: Props['onDeckAction'];
  onDeckChange: Props['onDeckChange'];
  onPreviewHostChange: Props['onPreviewHostChange'];
  whiteboardScene: WhiteboardScene;
  whiteboardReadOnly: boolean;
  whiteboardError: string;
  onWhiteboardSceneCommit: Props['onWhiteboardSceneCommit'];
  layout: PresentationLayout;
}) {
  if (resource.kind === 'preview')
    return (
      <div
        ref={onPreviewHostChange}
        data-presentation-preview-host
        className="h-full min-h-0 overflow-hidden bg-white"
      />
    );
  if (resource.kind === 'whiteboard')
    return (
      <InteractiveWhiteboard
        scene={whiteboardScene}
        readOnly={whiteboardReadOnly}
        error={whiteboardError}
        onSceneCommit={onWhiteboardSceneCommit}
      />
    );
  if (resource.kind === 'deck')
    return (
      <DeckContent
        deck={resource}
        progress={layout.deckStates?.[resource.id]}
        compact={compact}
        canEdit={canEditDeck}
        onAction={onDeckAction}
        onChange={onDeckChange}
      />
    );
  if (resource.kind === 'slide') return <LegacySlideContent resource={resource} compact={compact} />;
  if (resource.kind === 'explanation') return <ExplanationContent html={explanationHtml} compact={compact} />;
  return null;
}

function CameraOverlay({
  resources,
  layout,
  composition,
  mediaUrl,
  mediaRef,
  arranging,
  onLayoutCommit,
  onModeChange,
}: {
  resources: PresentationResource[];
  layout: PresentationLayout;
  composition: ReturnType<typeof resolvePresentationComposition>;
  mediaUrl: string;
  mediaRef: Props['onCameraMediaElementRef'];
  arranging: boolean;
  onLayoutCommit: Props['onLayoutCommit'];
  onModeChange: Props['onModeChange'];
}) {
  const camera = resources.find((resource) => resource.kind === 'camera');
  if (!camera) return null;
  const hidden = layout.resources[camera.id] === 'hidden';
  const anchors = {
    'top-left': 'left-3 top-3',
    'top-right': 'right-3 top-3',
    'bottom-left': 'bottom-16 left-3',
    'bottom-right': 'bottom-16 right-3',
  } as const;
  const sizes = { small: 'h-32 w-48', medium: 'h-48 w-72', large: 'h-[min(45vh,28rem)] w-[min(45vw,42rem)]' } as const;
  if (hidden)
    return (
      <>
        <div className="pointer-events-auto absolute right-3 top-3 z-50">
          <InteractiveButton
            aria-label="Show presentation resource: Instructor Camera"
            onClick={() => onModeChange(camera.id, 'minimized')}
          >
            Show Instructor Camera
          </InteractiveButton>
        </div>
        <section
          aria-label="Instructor Camera presentation"
          aria-hidden="true"
          data-presentation-resource={camera.id}
          data-presentation-mode="hidden"
          className="absolute -left-[10000px] top-0 h-px w-px overflow-hidden"
        >
          {mediaUrl ? <video src={mediaUrl} ref={mediaRef} /> : null}
        </section>
      </>
    );
  const change = (update: Partial<typeof composition>) =>
    onLayoutCommit(setPresentationComposition(resources, layout, update));
  return (
    <>
      <section
        aria-label="Instructor Camera presentation"
        data-presentation-resource={camera.id}
        data-presentation-mode={composition.cameraSize === 'large' ? 'focused' : 'minimized'}
        data-camera-anchor={composition.cameraAnchor}
        className={`pointer-events-auto absolute z-50 flex flex-col overflow-hidden rounded-lg border border-tk-elements-app-borderColor bg-black shadow-2xl ${anchors[composition.cameraAnchor]} ${sizes[composition.cameraSize]}`}
      >
        <header
          draggable={arranging}
          onDragStart={(event) => event.dataTransfer.setData('text/presentation-camera', camera.id)}
          className={`flex h-8 shrink-0 items-center gap-1 bg-tk-background-primary px-2 text-xs ${arranging ? 'cursor-grab' : ''}`}
        >
          <strong className="mr-auto truncate">Instructor Camera</strong>
          {arranging ? (
            <select
              aria-label="Camera position"
              value={composition.cameraAnchor}
              onChange={(event) => change({ cameraAnchor: event.target.value as typeof composition.cameraAnchor })}
            >
              <option value="top-left">Top left</option>
              <option value="top-right">Top right</option>
              <option value="bottom-left">Bottom left</option>
              <option value="bottom-right">Bottom right</option>
            </select>
          ) : null}
          <button
            type="button"
            onClick={() =>
              change({
                cameraSize:
                  composition.cameraSize === 'small'
                    ? 'medium'
                    : composition.cameraSize === 'medium'
                      ? 'large'
                      : 'small',
              })
            }
          >
            Size
          </button>
          <button type="button" aria-label="Hide Instructor Camera" onClick={() => onModeChange(camera.id, 'hidden')}>
            Hide
          </button>
        </header>
        {mediaUrl ? (
          <video
            aria-label="Recorded instructor camera"
            playsInline
            preload="auto"
            src={mediaUrl}
            ref={mediaRef}
            className="pointer-events-none min-h-0 flex-1 object-cover"
          />
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center bg-slate-950 text-xs text-slate-300">
            Camera placement
          </div>
        )}
      </section>
      {arranging
        ? (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((anchor) => (
            <div
              key={anchor}
              data-camera-drop-anchor={anchor}
              aria-label={`Move camera ${anchor.replace('-', ' ')}`}
              className={`absolute z-[60] h-16 w-24 rounded border-2 border-dashed border-tk-text-accent bg-tk-background-primary/60 ${anchors[anchor]}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (event.dataTransfer.getData('text/presentation-camera')) change({ cameraAnchor: anchor });
              }}
            />
          ))
        : null}
    </>
  );
}

function DeckContent({ deck, progress, compact, canEdit, onAction, onChange }: { deck: DeckPresentationResource; progress?: DeckPlaybackState; compact: boolean; canEdit: boolean; onAction: (deckId: string, action: DeckAction, slideIndex?: number) => void; onChange: (deck: DeckPresentationResource) => void }) {
  const slideIndex = Math.min(deck.slides.length - 1, Math.max(0, progress?.slideIndex ?? 0));
  const slide = deck.slides[slideIndex];
  const revealedStep = progress?.revealedStep ?? 0;
  if (!slide) return <p className="p-6 text-sm text-tk-text-secondary">This presentation has no slides yet.</p>;
  return <div className="flex h-full min-h-0 flex-col bg-gradient-to-br from-indigo-100 to-violet-200 text-slate-950">
    <div className={`min-h-0 flex-1 overflow-auto ${compact ? 'p-4' : 'p-10 md:p-14'}`}>
      {slide.eyebrow ? <p className={`${compact ? 'text-[9px]' : 'text-sm'} font-800 uppercase tracking-[0.18em] text-indigo-700`}>{slide.eyebrow}</p> : null}
      <h2 className={`${compact ? 'mt-2 text-xl' : 'mt-4 text-4xl md:text-6xl'} font-800 tracking-tight`}>{slide.title}</h2>
      <div className={`${compact ? 'mt-3 space-y-2 text-xs' : 'mt-8 space-y-5 text-xl md:text-2xl'} text-slate-700`}>{slide.elements.filter((element) => element.revealStep <= revealedStep).map((element) => <SlideElement key={element.id} element={element} />)}</div>
    </div>
    <div className={`shrink-0 border-t border-indigo-200 bg-white/70 ${compact ? 'px-3 py-2' : 'px-5 py-3'}`}>
      <div className="flex items-center justify-between gap-2 text-xs"><span>Slide {slideIndex + 1} / {deck.slides.length}</span><span>Reveal {revealedStep}</span></div>
      {!compact ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2"><InteractiveButton variant="ghost" icon="i-ph-caret-double-left" onClick={() => onAction(deck.id, 'previous-slide')}>Previous slide</InteractiveButton><InteractiveButton variant="ghost" icon="i-ph-caret-left" onClick={() => onAction(deck.id, 'previous-reveal')}>Previous step</InteractiveButton><InteractiveButton variant="primary" icon="i-ph-caret-right" onClick={() => onAction(deck.id, 'next-reveal')}>Reveal next</InteractiveButton><InteractiveButton variant="ghost" icon="i-ph-caret-double-right" onClick={() => onAction(deck.id, 'next-slide')}>Next slide</InteractiveButton></div> : null}
      {!compact ? <div aria-label="Select slide" className="mt-2 flex justify-center gap-1">{deck.slides.map((item, index) => <button key={item.id} type="button" aria-label={`Go to slide ${index + 1}: ${item.title}`} aria-current={index === slideIndex ? 'true' : undefined} onClick={() => onAction(deck.id, 'select-slide', index)} className={`h-2 rounded-full ${index === slideIndex ? 'w-6 bg-indigo-700' : 'w-2 bg-indigo-300'}`} />)}</div> : null}
      {canEdit && !compact ? <DeckEditor deck={deck} slideIndex={slideIndex} onChange={onChange} /> : null}
    </div>
  </div>;
}

function SlideElement({ element }: { element: PresentationSlideElement }) {
  if (element.kind === 'heading') return <h3 className="font-800 text-slate-900">{element.text}</h3>;
  if (element.kind === 'paragraph') return <p>{element.text}</p>;
  if (element.kind === 'bullet') return <p className="flex gap-3 before:mt-[0.55em] before:h-2 before:w-2 before:shrink-0 before:rounded-full before:bg-indigo-600">{element.text}</p>;
  if (element.kind === 'code') return <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-sm text-indigo-100"><code>{element.code}</code></pre>;
  if ('src' in element) return <figure><img src={element.src} alt={element.alt} className="max-h-72 rounded-lg object-contain" />{element.caption ? <figcaption className="mt-2 text-sm">{element.caption}</figcaption> : null}</figure>;
  return null;
}

function DeckEditor({ deck, slideIndex, onChange }: { deck: DeckPresentationResource; slideIndex: number; onChange: (deck: DeckPresentationResource) => void }) {
  const slide = deck.slides[slideIndex];
  const updateSlide = (nextSlide: PresentationSlide) => onChange({ ...deck, slides: deck.slides.map((item, index) => index === slideIndex ? nextSlide : item) });
  const addElement = (element: PresentationSlideElement) => updateSlide({ ...slide, elements: [...slide.elements, element] });
  const moveSlide = (direction: -1 | 1) => {
    const destination = slideIndex + direction;
    if (destination < 0 || destination >= deck.slides.length) return;
    const slides = [...deck.slides];
    [slides[slideIndex], slides[destination]] = [slides[destination], slides[slideIndex]];
    onChange({ ...deck, slides });
  };
  const updateElement = (id: string, update: (element: PresentationSlideElement) => PresentationSlideElement) => updateSlide({ ...slide, elements: slide.elements.map((element) => element.id === id ? update(element) : element) });
  const moveElement = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= slide.elements.length) return;
    const elements = [...slide.elements];
    [elements[index], elements[destination]] = [elements[destination], elements[index]];
    updateSlide({ ...slide, elements });
  };
  const nextStep = Math.max(0, ...slide.elements.map((element) => element.revealStep)) + 1;
  return <details className="mt-3 max-h-72 overflow-auto rounded border border-indigo-200 bg-white/90 p-2 text-slate-900"><summary className="cursor-pointer text-xs font-700">Edit presentation</summary><div className="mt-2 grid gap-2 text-xs">
    <label>Deck title<input aria-label="Deck title" className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={deck.title} onChange={(event) => onChange({ ...deck, title: event.target.value })} /></label>
    <label>Slide title<input aria-label="Slide title" className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={slide.title} onChange={(event) => updateSlide({ ...slide, title: event.target.value })} /></label>
    <div className="flex flex-wrap gap-1"><button type="button" className="rounded border border-slate-300 px-2 py-1" onClick={() => moveSlide(-1)}>Move slide left</button><button type="button" className="rounded border border-slate-300 px-2 py-1" onClick={() => moveSlide(1)}>Move slide right</button><button type="button" className="rounded bg-indigo-700 px-2 py-1 text-white" onClick={() => onChange({ ...deck, slides: [...deck.slides, { id: `slide-${Date.now()}`, title: 'New slide', elements: [] }] })}>Add slide</button><button type="button" className="rounded border border-indigo-500 px-2 py-1" onClick={() => onChange({ ...deck, slides: [...deck.slides, { ...structuredClone(slide), id: `slide-${Date.now()}`, title: `${slide.title} copy` }] })}>Duplicate slide</button>{deck.slides.length > 1 ? <button type="button" className="rounded border border-red-400 px-2 py-1 text-red-700" onClick={() => onChange({ ...deck, slides: deck.slides.filter((_, index) => index !== slideIndex) })}>Delete slide</button> : null}</div>
    <div className="flex flex-wrap gap-1"><button type="button" className="rounded bg-indigo-700 px-2 py-1 text-white" onClick={() => addElement({ id: `heading-${Date.now()}`, kind: 'heading', text: 'New heading', revealStep: nextStep })}>Add heading</button><button type="button" className="rounded bg-indigo-700 px-2 py-1 text-white" onClick={() => addElement({ id: `paragraph-${Date.now()}`, kind: 'paragraph', text: 'New paragraph', revealStep: nextStep })}>Add paragraph</button><button type="button" className="rounded bg-indigo-700 px-2 py-1 text-white" onClick={() => addElement({ id: `point-${Date.now()}`, kind: 'bullet', text: 'New point', revealStep: nextStep })}>Add reveal point</button><button type="button" className="rounded bg-indigo-700 px-2 py-1 text-white" onClick={() => addElement({ id: `code-${Date.now()}`, kind: 'code', code: '// code', language: 'javascript', revealStep: nextStep })}>Add code</button><label className="cursor-pointer rounded bg-indigo-700 px-2 py-1 text-white">Add image<input aria-label="Add slide image" type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => addElement({ id: `image-${Date.now()}`, kind: 'image', src: String(reader.result), alt: file.name, revealStep: nextStep }); reader.readAsDataURL(file); }} /></label></div>
    {slide.elements.map((element, index) => <div key={element.id} className="rounded border border-slate-200 p-2"><div className="mb-1 flex items-center gap-1"><strong className="mr-auto">{element.kind} {index + 1}</strong><label>Reveal <input aria-label={`Reveal step for element ${index + 1}`} type="number" min="0" className="w-14 rounded border border-slate-300 px-1" value={element.revealStep} onChange={(event) => updateElement(element.id, (item) => ({ ...item, revealStep: Number(event.target.value) }))} /></label><button type="button" onClick={() => moveElement(index, -1)}>↑</button><button type="button" onClick={() => moveElement(index, 1)}>↓</button><button type="button" className="text-red-700" onClick={() => updateSlide({ ...slide, elements: slide.elements.filter((item) => item.id !== element.id) })}>Delete</button></div><textarea aria-label={`Slide element ${index + 1}`} className="w-full rounded border border-slate-300 px-2 py-1" value={'text' in element ? element.text : element.kind === 'code' ? element.code : element.caption ?? ''} onChange={(event) => updateElement(element.id, (item) => 'text' in item ? { ...item, text: event.target.value } : item.kind === 'code' ? { ...item, code: event.target.value } : { ...item, caption: event.target.value })} />{'src' in element ? <label>Alternative text<input aria-label={`Image alternative text ${index + 1}`} className="ml-1 rounded border border-slate-300 px-1" value={element.alt} onChange={(event) => updateElement(element.id, (item) => 'src' in item ? { ...item, alt: event.target.value } : item)} /></label> : null}</div>)}
  </div></details>;
}

function LegacySlideContent({ resource, compact = false }: { resource: SlidePresentationResource; compact?: boolean }) { return <div className={`flex h-full flex-col justify-center bg-gradient-to-br from-indigo-100 to-violet-200 text-slate-950 ${compact ? 'p-4' : 'p-12 md:p-16'}`}>{resource.eyebrow ? <p className="font-800 uppercase tracking-[0.18em] text-indigo-700">{resource.eyebrow}</p> : null}<h2 className={`${compact ? 'text-lg' : 'text-5xl'} mt-2 font-800`}>{resource.title}</h2><p className={`${compact ? 'text-xs' : 'text-2xl'} mt-4 text-slate-700`}>{resource.body}</p></div>; }
function ExplanationContent({ html, compact = false }: { html: string; compact?: boolean }) { return html ? <div className={`markdown-content text-tk-elements-content-textColor ${compact ? 'line-clamp-5 p-4 text-xs' : 'p-8 md:p-12'}`} dangerouslySetInnerHTML={{ __html: html }} /> : <p className="p-6 text-sm text-tk-text-secondary">No lesson explanation is available.</p>; }
function resourceIcon(resource: PresentationResource): string { if (resource.kind === 'preview') return 'i-ph-browser'; if (resource.kind === 'camera') return 'i-ph-video-camera'; if (resource.kind === 'whiteboard') return 'i-ph-chalkboard-teacher'; if (resource.kind === 'slide' || resource.kind === 'deck') return 'i-ph-presentation-chart'; return 'i-ph-book-open-text'; }
function previewContainerClass(mode: PresentationMode): string { const base = 'pointer-events-auto absolute z-30 flex flex-col overflow-hidden border border-tk-elements-app-borderColor bg-tk-background-primary shadow-2xl'; if (mode === 'focused') return `${base} inset-[6%] rounded-xl`; if (mode === 'minimized') return `${base} bottom-4 right-4 h-60 w-[min(34rem,42vw)] rounded-lg`; return `${base} -left-[10000px] top-0 h-px w-px opacity-0`; }
function whiteboardContainerClass(mode: PresentationMode): string { const base = 'pointer-events-auto absolute z-40 flex flex-col overflow-hidden border border-tk-elements-app-borderColor bg-white shadow-2xl'; if (mode === 'focused') return `${base} inset-[5%] rounded-xl`; if (mode === 'minimized') return `${base} bottom-4 left-4 h-64 w-[min(26rem,42vw)] rounded-lg`; return `${base} -left-[10000px] top-0 h-px w-px opacity-0`; }
function cameraContainerClass(mode: PresentationMode): string { const base = 'pointer-events-auto absolute z-40 flex flex-col overflow-hidden border border-tk-elements-app-borderColor bg-tk-background-primary shadow-2xl'; if (mode === 'focused') return `${base} inset-[8%] rounded-xl`; if (mode === 'minimized') return `${base} bottom-4 left-4 h-52 w-72 rounded-lg`; return `${base} -left-[10000px] top-0 h-px w-px opacity-0`; }
