import { useEffect, type ReactNode } from 'react';
import type {
  DeckPresentationResource,
  DeckPlaybackState,
  PresentationLayout,
  PresentationMode,
  PresentationResource,
  PresentationSlide,
  PresentationSlideElement,
  SlidePresentationResource,
  WhiteboardScene,
} from '@tutorialkit/runtime';
import type { DeckAction } from './useInteractivePoc.js';
import { InteractiveButton } from './InteractivePocUi.js';
import { InteractiveWhiteboard } from './interactive/whiteboard/InteractiveWhiteboard.js';

interface Props {
  audience: 'teacher' | 'learner';
  resources: PresentationResource[];
  layout: PresentationLayout;
  hasLearnerOverride: boolean;
  explanationHtml: string;
  canEditDeck: boolean;
  onModeChange: (resourceId: string, mode: PresentationMode) => void;
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

export function InteractivePresentationLayer({ audience, resources, layout, hasLearnerOverride, explanationHtml, canEditDeck, onModeChange, onDeckAction, onDeckChange, onFollowTeacher, onPreviewHostChange, cameraMediaUrl, onCameraMediaElementRef, whiteboardScene, whiteboardReadOnly, whiteboardError, onWhiteboardSceneCommit }: Props) {
  const focusedResource = resources.find((resource) => resource.id === layout.focusedResourceId);
  const previewResource = resources.find((resource) => resource.kind === 'preview');
  const previewMode = previewResource ? layout.resources[previewResource.id] ?? 'hidden' : 'hidden';
  const cameraResource = resources.find((resource) => resource.kind === 'camera');
  const cameraMode = cameraResource ? layout.resources[cameraResource.id] ?? 'hidden' : 'hidden';
  const whiteboardResource = resources.find((resource) => resource.kind === 'whiteboard');
  const whiteboardMode = whiteboardResource ? layout.resources[whiteboardResource.id] ?? 'hidden' : 'hidden';

  useEffect(() => {
    if (!focusedResource) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"], .cm-editor, .xterm')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onModeChange(focusedResource.id, 'minimized');
      } else if (focusedResource.kind === 'deck' && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        onDeckAction(focusedResource.id, event.key === 'ArrowRight' ? 'next-reveal' : 'previous-reveal');
      } else if (focusedResource.kind === 'deck' && (event.key === 'PageDown' || event.key === 'PageUp')) {
        event.preventDefault();
        onDeckAction(focusedResource.id, event.key === 'PageDown' ? 'next-slide' : 'previous-slide');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusedResource, onDeckAction, onModeChange]);

  return (
    <div data-presentation-layer className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div className={`pointer-events-auto absolute right-3 top-3 z-30 max-w-[70%] flex-wrap justify-end gap-1 rounded-lg border border-tk-elements-app-borderColor bg-tk-background-primary/95 p-1.5 shadow-lg ${focusedResource ? 'hidden' : 'flex'}`}>
        <span className="self-center px-2 text-[10px] font-700 uppercase tracking-[0.12em] text-tk-text-secondary">Resources</span>
        {resources.filter((resource) => resource.kind !== 'camera' || Boolean(cameraMediaUrl)).map((resource) => (
          <InteractiveButton key={resource.id} variant="ghost" icon={resourceIcon(resource)} aria-pressed={layout.resources[resource.id] !== 'hidden'} aria-label={`${layout.resources[resource.id] === 'hidden' ? 'Show' : 'Hide'} presentation resource: ${resource.title}`} onClick={() => onModeChange(resource.id, layout.resources[resource.id] === 'hidden' ? 'minimized' : 'hidden')}>
            {resource.title}
          </InteractiveButton>
        ))}
      </div>

      {audience === 'learner' && hasLearnerOverride ? <div className="pointer-events-auto absolute left-3 top-3 z-50"><InteractiveButton variant="primary" icon="i-ph-broadcast" onClick={onFollowTeacher}>Follow teacher</InteractiveButton></div> : null}
      {previewMode === 'focused' || cameraMode === 'focused' || whiteboardMode === 'focused' ? <div className="absolute inset-0 z-20 bg-black/75 backdrop-blur-sm" aria-hidden="true" /> : null}

      {focusedResource && focusedResource.kind !== 'preview' && focusedResource.kind !== 'camera' && focusedResource.kind !== 'whiteboard' ? (
        <div data-presentation-focus className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-6 pb-10 backdrop-blur-sm">
          <PresentationFrame resource={focusedResource} mode="focused" onModeChange={onModeChange}>
            {focusedResource.kind === 'deck' ? <DeckContent deck={focusedResource} progress={layout.deckStates?.[focusedResource.id]} compact={false} canEdit={canEditDeck} onAction={onDeckAction} onChange={onDeckChange} /> : null}
            {focusedResource.kind === 'slide' ? <LegacySlideContent resource={focusedResource} /> : null}
            {focusedResource.kind === 'explanation' ? <ExplanationContent html={explanationHtml} /> : null}
          </PresentationFrame>
        </div>
      ) : null}

      <div className={`absolute left-4 z-10 flex max-w-[45%] flex-col-reverse gap-3 ${cameraMode === 'minimized' && cameraMediaUrl ? 'bottom-60' : 'bottom-4'}`}>
        {resources.filter((resource) => resource.kind !== 'preview' && resource.kind !== 'camera' && resource.kind !== 'whiteboard' && layout.resources[resource.id] === 'minimized').map((resource) => (
          <PresentationFrame key={resource.id} resource={resource} mode="minimized" onModeChange={onModeChange}>
            {resource.kind === 'deck' ? <DeckContent deck={resource} progress={layout.deckStates?.[resource.id]} compact canEdit={false} onAction={onDeckAction} onChange={onDeckChange} /> : null}
            {resource.kind === 'slide' ? <LegacySlideContent resource={resource} compact /> : null}
            {resource.kind === 'explanation' ? <ExplanationContent html={explanationHtml} compact /> : null}
          </PresentationFrame>
        ))}
      </div>

      {previewResource ? <section aria-label="Website preview presentation" data-presentation-resource={previewResource.id} data-presentation-mode={previewMode} className={previewContainerClass(previewMode)}><ResourceHeader resource={previewResource} mode={previewMode} onModeChange={onModeChange} /><div ref={onPreviewHostChange} data-presentation-preview-host className="min-h-0 flex-1 overflow-hidden bg-white" /></section> : null}
      {whiteboardResource ? <section aria-label="Whiteboard presentation" aria-hidden={whiteboardMode === 'hidden'} data-presentation-resource={whiteboardResource.id} data-presentation-mode={whiteboardMode} className={whiteboardContainerClass(whiteboardMode)}><ResourceHeader resource={whiteboardResource} mode={whiteboardMode} onModeChange={onModeChange} /><div className="min-h-0 flex-1"><InteractiveWhiteboard scene={whiteboardScene} readOnly={whiteboardReadOnly} error={whiteboardError} onSceneCommit={onWhiteboardSceneCommit} /></div></section> : null}
      {cameraResource && cameraMediaUrl ? <section aria-label="Instructor Camera presentation" data-presentation-resource={cameraResource.id} data-presentation-mode={cameraMode} className={cameraContainerClass(cameraMode)}><ResourceHeader resource={cameraResource} mode={cameraMode} onModeChange={onModeChange} /><video aria-label="Recorded instructor camera" playsInline preload="auto" src={cameraMediaUrl} ref={onCameraMediaElementRef} className="pointer-events-none min-h-0 flex-1 bg-black object-cover" /></section> : null}
    </div>
  );
}

function PresentationFrame({ resource, mode, onModeChange, children }: { resource: PresentationResource; mode: 'minimized' | 'focused'; onModeChange: (resourceId: string, mode: PresentationMode) => void; children: ReactNode }) {
  return <section aria-label={`${resource.title} presentation`} data-presentation-resource={resource.id} data-presentation-mode={mode} className={mode === 'focused' ? 'flex h-[min(82vh,800px)] w-[min(88vw,1280px)] flex-col overflow-hidden rounded-xl border border-tk-elements-app-borderColor bg-tk-background-primary shadow-2xl' : 'pointer-events-auto flex h-52 w-80 flex-col overflow-hidden rounded-lg border border-tk-elements-app-borderColor bg-tk-background-primary shadow-xl'}><ResourceHeader resource={resource} mode={mode} onModeChange={onModeChange} /><div className="min-h-0 flex-1 overflow-auto">{children}</div></section>;
}

function ResourceHeader({ resource, mode, onModeChange }: { resource: PresentationResource; mode: PresentationMode; onModeChange: (resourceId: string, mode: PresentationMode) => void }) {
  return <header className="flex h-9 shrink-0 items-center gap-2 border-b border-tk-elements-app-borderColor bg-tk-background-primary px-2"><span className={`${resourceIcon(resource)} text-tk-text-secondary`} aria-hidden="true" /><strong className="min-w-0 flex-1 truncate text-xs">{resource.title}</strong>{mode !== 'focused' ? <InteractiveButton variant="ghost" icon="i-ph-arrows-out-simple" onClick={() => onModeChange(resource.id, 'focused')} className="px-2"><span className="sr-only">Focus {resource.title}</span></InteractiveButton> : <InteractiveButton variant="ghost" icon="i-ph-minus" onClick={() => onModeChange(resource.id, 'minimized')} className="px-2"><span className="sr-only">Minimize {resource.title}</span></InteractiveButton>}<InteractiveButton variant="ghost" icon="i-ph-x" onClick={() => onModeChange(resource.id, 'hidden')} className="px-2"><span className="sr-only">Hide {resource.title}</span></InteractiveButton></header>;
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
