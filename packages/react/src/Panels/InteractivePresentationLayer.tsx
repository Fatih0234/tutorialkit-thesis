import { useEffect, type ReactNode } from 'react';
import type {
  PresentationLayout,
  PresentationMode,
  PresentationResource,
  SlidePresentationResource,
} from '@tutorialkit/runtime';
import { InteractiveButton } from './InteractivePocUi.js';

interface InteractivePresentationLayerProps {
  audience: 'teacher' | 'learner';
  resources: PresentationResource[];
  layout: PresentationLayout;
  hasLearnerOverride: boolean;
  explanationHtml: string;
  onModeChange: (resourceId: string, mode: PresentationMode) => void;
  onFollowTeacher: () => void;
  onPreviewHostChange: (host: HTMLDivElement | null) => void;
}

export function InteractivePresentationLayer({
  audience,
  resources,
  layout,
  hasLearnerOverride,
  explanationHtml,
  onModeChange,
  onFollowTeacher,
  onPreviewHostChange,
}: InteractivePresentationLayerProps) {
  const focusedResource = resources.find((resource) => resource.id === layout.focusedResourceId);
  const previewResource = resources.find((resource) => resource.kind === 'preview');
  const previewMode = previewResource ? layout.resources[previewResource.id] ?? 'hidden' : 'hidden';

  useEffect(() => {
    if (!focusedResource) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onModeChange(focusedResource.id, 'minimized');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusedResource, onModeChange]);

  return (
    <div data-presentation-layer className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div className={`pointer-events-auto absolute right-3 top-3 z-30 max-w-[70%] flex-wrap justify-end gap-1 rounded-lg border border-tk-elements-app-borderColor bg-tk-background-primary/95 p-1.5 shadow-lg ${focusedResource ? 'hidden' : 'flex'}`}>
        <span className="self-center px-2 text-[10px] font-700 uppercase tracking-[0.12em] text-tk-text-secondary">Resources</span>
        {resources.map((resource) => (
          <InteractiveButton
            key={resource.id}
            variant="ghost"
            icon={resourceIcon(resource)}
            aria-pressed={layout.resources[resource.id] !== 'hidden'}
            aria-label={`${layout.resources[resource.id] === 'hidden' ? 'Show' : 'Hide'} presentation resource: ${resource.title}`}
            onClick={() => onModeChange(resource.id, layout.resources[resource.id] === 'hidden' ? 'minimized' : 'hidden')}
            title={`${layout.resources[resource.id] === 'hidden' ? 'Show' : 'Hide'} ${resource.title}`}
          >
            {resource.title}
          </InteractiveButton>
        ))}
      </div>

      {audience === 'learner' && hasLearnerOverride ? (
        <div className="pointer-events-auto absolute left-3 top-3 z-40">
          <InteractiveButton variant="primary" icon="i-ph-broadcast" onClick={onFollowTeacher}>Follow teacher</InteractiveButton>
        </div>
      ) : null}

      {previewMode === 'focused' ? <div className="absolute inset-0 z-20 bg-black/75 backdrop-blur-sm" aria-hidden="true" /> : null}

      {focusedResource && focusedResource.kind !== 'preview' ? (
        <div data-presentation-focus className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-6 pb-10 backdrop-blur-sm">
          <PresentationFrame
            resource={focusedResource}
            mode="focused"
            onModeChange={onModeChange}
          >
            {focusedResource.kind === 'slide' ? <SlideContent resource={focusedResource} /> : null}
            {focusedResource.kind === 'explanation' ? <ExplanationContent html={explanationHtml} /> : null}
          </PresentationFrame>
        </div>
      ) : null}

      <div className="absolute bottom-4 left-4 z-10 flex max-w-[45%] flex-col-reverse gap-3">
        {resources.filter((resource) => resource.kind !== 'preview' && layout.resources[resource.id] === 'minimized').map((resource) => (
          <PresentationFrame key={resource.id} resource={resource} mode="minimized" onModeChange={onModeChange}>
            {resource.kind === 'slide' ? <SlideContent resource={resource} compact /> : null}
            {resource.kind === 'explanation' ? <ExplanationContent html={explanationHtml} compact /> : null}
          </PresentationFrame>
        ))}
      </div>

      {previewResource ? (
        <section
          aria-label="Website preview presentation"
          data-presentation-resource={previewResource.id}
          data-presentation-mode={previewMode}
          className={previewContainerClass(previewMode)}
        >
          <ResourceHeader resource={previewResource} mode={previewMode} onModeChange={onModeChange} />
          <div ref={onPreviewHostChange} data-presentation-preview-host className="min-h-0 flex-1 overflow-hidden bg-white" />
        </section>
      ) : null}
    </div>
  );
}

function PresentationFrame({
  resource,
  mode,
  onModeChange,
  children,
}: {
  resource: PresentationResource;
  mode: 'minimized' | 'focused';
  onModeChange: (resourceId: string, mode: PresentationMode) => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={`${resource.title} presentation`}
      data-presentation-resource={resource.id}
      data-presentation-mode={mode}
      className={mode === 'focused'
        ? 'flex h-[min(78vh,760px)] w-[min(84vw,1200px)] flex-col overflow-hidden rounded-xl border border-tk-elements-app-borderColor bg-tk-background-primary shadow-2xl'
        : 'pointer-events-auto flex h-44 w-72 flex-col overflow-hidden rounded-lg border border-tk-elements-app-borderColor bg-tk-background-primary shadow-xl'}
    >
      <ResourceHeader resource={resource} mode={mode} onModeChange={onModeChange} />
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

function ResourceHeader({
  resource,
  mode,
  onModeChange,
}: {
  resource: PresentationResource;
  mode: PresentationMode;
  onModeChange: (resourceId: string, mode: PresentationMode) => void;
}) {
  return (
    <header className="flex h-9 shrink-0 items-center gap-2 border-b border-tk-elements-app-borderColor bg-tk-background-primary px-2">
      <span className={`${resourceIcon(resource)} text-tk-text-secondary`} aria-hidden="true" />
      <strong className="min-w-0 flex-1 truncate text-xs">{resource.title}</strong>
      {mode !== 'focused' ? (
        <InteractiveButton variant="ghost" icon="i-ph-arrows-out-simple" onClick={() => onModeChange(resource.id, 'focused')} className="px-2">
          <span className="sr-only">Focus {resource.title}</span>
        </InteractiveButton>
      ) : (
        <InteractiveButton variant="ghost" icon="i-ph-minus" onClick={() => onModeChange(resource.id, 'minimized')} className="px-2">
          <span className="sr-only">Minimize {resource.title}</span>
        </InteractiveButton>
      )}
      <InteractiveButton variant="ghost" icon="i-ph-x" onClick={() => onModeChange(resource.id, 'hidden')} className="px-2">
        <span className="sr-only">Hide {resource.title}</span>
      </InteractiveButton>
    </header>
  );
}

function SlideContent({ resource, compact = false }: { resource: SlidePresentationResource; compact?: boolean }) {
  return (
    <div className={`flex h-full flex-col justify-center bg-gradient-to-br from-indigo-100 to-violet-200 text-slate-950 ${compact ? 'p-4' : 'p-12 md:p-16'}`}>
      {resource.eyebrow ? <p className={`${compact ? 'text-[9px]' : 'text-sm'} font-800 uppercase tracking-[0.18em] text-indigo-700`}>{resource.eyebrow}</p> : null}
      <h2 className={`${compact ? 'mt-2 text-lg' : 'mt-5 text-4xl md:text-6xl'} font-800 tracking-tight`}>{resource.title}</h2>
      <p className={`${compact ? 'mt-2 line-clamp-3 text-xs' : 'mt-8 max-w-4xl text-xl md:text-3xl'} leading-relaxed text-slate-700`}>{resource.body}</p>
    </div>
  );
}

function ExplanationContent({ html, compact = false }: { html: string; compact?: boolean }) {
  return html ? (
    <div className={`markdown-content text-tk-elements-content-textColor ${compact ? 'line-clamp-5 p-4 text-xs' : 'p-8 md:p-12'}`} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <p className="p-6 text-sm text-tk-text-secondary">No lesson explanation is available.</p>
  );
}

function resourceIcon(resource: PresentationResource): string {
  if (resource.kind === 'preview') return 'i-ph-browser';
  if (resource.kind === 'slide') return 'i-ph-presentation-chart';
  return 'i-ph-book-open-text';
}

function previewContainerClass(mode: PresentationMode): string {
  const base = 'pointer-events-auto absolute z-30 flex flex-col overflow-hidden border border-tk-elements-app-borderColor bg-tk-background-primary shadow-2xl';

  if (mode === 'focused') {
    return `${base} inset-[6%] rounded-xl`;
  }

  if (mode === 'minimized') {
    return `${base} bottom-4 right-4 h-60 w-[min(34rem,42vw)] rounded-lg`;
  }

  return `${base} -left-[10000px] top-0 h-px w-px opacity-0`;
}
