import {
  HIDDEN_TEACHER_POINTER,
  TEACHER_POINTER_BRIDGE_CHANNEL,
  TEACHER_POINTER_BRIDGE_VERSION,
  type EditorPointerAnchor,
  type TeacherPointerAnchor,
  type TeacherPointerButton,
  type TeacherPointerChangedPayload,
  type TeacherPointerClickedPayload,
} from '@tutorialkit/runtime';
import { useEffect, useRef, useState, type RefObject } from 'react';

interface CaptureOptions {
  enabled: boolean;
  rootRef: RefObject<HTMLElement>;
  onPointerChange: (pointer: TeacherPointerChangedPayload) => void;
  onPointerClick: (click: TeacherPointerClickedPayload) => void;
  getEditorPointerAnchor: (clientX: number, clientY: number) => EditorPointerAnchor | null;
}

const SAMPLE_INTERVAL_MS = 75;
const POINTER_DEBUG_STORAGE_KEY = 'interactive-poc.pointerDebug';

export function useTeacherPointerCapture({ enabled, rootRef, onPointerChange, onPointerClick, getEditorPointerAnchor }: CaptureOptions) {
  const lastSampleAtRef = useRef(0);
  const lastSurfaceRef = useRef<TeacherPointerChangedPayload['surface'] | null>(null);
  const nonceRef = useRef('');
  const previewOriginRef = useRef('');

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return undefined;

    const getPointerPosition = (event: PointerEvent) => {
      const workspace = root.querySelector<HTMLElement>('[aria-label="Interactive workspace"]');
      const workspaceBounds = workspace?.getBoundingClientRect();
      const insideWorkspace = Boolean(workspaceBounds && event.clientX >= workspaceBounds.left && event.clientX <= workspaceBounds.right && event.clientY >= workspaceBounds.top && event.clientY <= workspaceBounds.bottom);
      const surface = insideWorkspace ? 'workspace' as const : 'experience' as const;
      const bounds = insideWorkspace ? workspaceBounds! : root.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return null;
      let anchor: TeacherPointerAnchor | undefined;
      const target = event.target instanceof Element ? event.target : null;
      const anchoredElement = target?.closest<HTMLElement>('[data-pointer-anchor]');
      if (anchoredElement?.dataset.pointerAnchor) {
        const anchorBounds = anchoredElement.getBoundingClientRect();
        if (anchorBounds.width && anchorBounds.height) anchor = {
          kind: 'element',
          id: anchoredElement.dataset.pointerAnchor,
          xWithinElement: Math.max(0, Math.min(1, (event.clientX - anchorBounds.left) / anchorBounds.width)),
          yWithinElement: Math.max(0, Math.min(1, (event.clientY - anchorBounds.top) / anchorBounds.height)),
        };
      } else {
        const editorElement = [...root.querySelectorAll<HTMLElement>('.cm-editor')].find((element) => {
          const editorBounds = element.getBoundingClientRect();
          return event.clientX >= editorBounds.left && event.clientX <= editorBounds.right && event.clientY >= editorBounds.top && event.clientY <= editorBounds.bottom;
        }) as (HTMLElement & { __tutorialKitPointerCoordinateApi?: { positionAtCoordinates(x: number, y: number): Omit<EditorPointerAnchor, 'kind'> | null } }) | undefined;
        const directEditorPosition = editorElement?.__tutorialKitPointerCoordinateApi?.positionAtCoordinates(event.clientX, event.clientY);
        const editorAnchor = directEditorPosition ? { kind: 'editor' as const, ...directEditorPosition } : getEditorPointerAnchor(event.clientX, event.clientY);
        if (editorAnchor) anchor = editorAnchor;
      }
      return {
        surface,
        x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
        y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
        coordinateSpaceVersion: 3 as const,
        ...(anchor ? { anchor } : {}),
      };
    };
    const emitWorkspacePointer = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      const position = getPointerPosition(event);
      if (!position) return;
      const now = performance.now();
      if (lastSurfaceRef.current === position.surface && now - lastSampleAtRef.current < SAMPLE_INTERVAL_MS) return;
      lastSampleAtRef.current = now;
      lastSurfaceRef.current = position.surface;
      onPointerChange({ ...position, visible: true });
    };
    const emitWorkspaceClick = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      const position = getPointerPosition(event);
      if (!position) return;
      onPointerClick({ ...position, button: event.button === 2 ? 'right' : 'left' });
    };
    const hidePointer = () => onPointerChange({ ...HIDDEN_TEACHER_POINTER });
    const activeIframe = () => root.querySelector<HTMLIFrameElement>('[data-presentation-preview-host] iframe');
    const initializeBridge = (iframe: HTMLIFrameElement, origin: string) => {
      if (!/^https?:\/\//.test(origin)) return;
      previewOriginRef.current = origin;
      nonceRef.current = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      iframe.contentWindow?.postMessage({
        channel: TEACHER_POINTER_BRIDGE_CHANNEL,
        version: TEACHER_POINTER_BRIDGE_VERSION,
        action: 'enable',
        nonce: nonceRef.current,
      }, origin);
    };
    const onMessage = (event: MessageEvent) => {
      const iframe = activeIframe();
      if (!iframe?.contentWindow || event.source !== iframe.contentWindow) return;
      const message = event.data as Record<string, unknown> | null;
      if (!message || message.channel !== TEACHER_POINTER_BRIDGE_CHANNEL || message.version !== TEACHER_POINTER_BRIDGE_VERSION) return;
      if (message.action === 'ready') {
        initializeBridge(iframe, event.origin);
        return;
      }
      if (event.origin !== previewOriginRef.current || message.nonce !== nonceRef.current) return;
      if (message.action === 'leave') {
        onPointerChange({ surface: 'preview', x: 0, y: 0, visible: false, coordinateSpaceVersion: 2 });
        return;
      }
      const hasValidPosition = typeof message.x === 'number' && typeof message.y === 'number' && Number.isFinite(message.x) && Number.isFinite(message.y) && message.x >= 0 && message.x <= 1 && message.y >= 0 && message.y <= 1;
      if (message.action === 'click') {
        if (!hasValidPosition || (message.button !== 'left' && message.button !== 'right')) return;
        onPointerClick({ surface: 'preview', x: message.x as number, y: message.y as number, button: message.button, coordinateSpaceVersion: 2 });
        return;
      }
      if (message.action !== 'move' || !hasValidPosition) return;
      const now = performance.now();
      if (lastSurfaceRef.current === 'preview' && now - lastSampleAtRef.current < SAMPLE_INTERVAL_MS) return;
      lastSampleAtRef.current = now;
      lastSurfaceRef.current = 'preview';
      onPointerChange({ surface: 'preview', x: message.x as number, y: message.y as number, visible: true, coordinateSpaceVersion: 2 });
    };

    root.addEventListener('pointermove', emitWorkspacePointer);
    root.addEventListener('pointerdown', emitWorkspaceClick);
    root.addEventListener('pointerleave', hidePointer);
    window.addEventListener('message', onMessage);
    const iframe = activeIframe();
    if (iframe?.src) {
      try { initializeBridge(iframe, new URL(iframe.src).origin); } catch { /* wait for bridge ready */ }
    }
    return () => {
      root.removeEventListener('pointermove', emitWorkspacePointer);
      root.removeEventListener('pointerdown', emitWorkspaceClick);
      root.removeEventListener('pointerleave', hidePointer);
      window.removeEventListener('message', onMessage);
      const currentIframe = activeIframe();
      if (currentIframe?.contentWindow && currentIframe.src) {
        try {
          currentIframe.contentWindow.postMessage({ channel: TEACHER_POINTER_BRIDGE_CHANNEL, version: TEACHER_POINTER_BRIDGE_VERSION, action: 'disable', nonce: nonceRef.current }, new URL(currentIframe.src).origin);
        } catch { /* iframe may have navigated during cleanup */ }
      }
      nonceRef.current = '';
      previewOriginRef.current = '';
    };
  }, [enabled, getEditorPointerAnchor, onPointerChange, onPointerClick, rootRef]);
}

export function InteractiveTeacherPointer({ pointer, clickButton, clickSequence, rootRef, visible, resolveEditorPointerAnchor }: { pointer: TeacherPointerChangedPayload; clickButton: TeacherPointerButton | null; clickSequence: number; rootRef: RefObject<HTMLElement>; visible: boolean; resolveEditorPointerAnchor: (anchor: EditorPointerAnchor) => { clientX: number; clientY: number } | null }) {
  const [position, setPosition] = useState({ left: 0, top: 0, available: false });
  const [debugVisible, setDebugVisible] = useState(false);

  useEffect(() => {
    const updateDebugVisibility = () => setDebugVisible(localStorage.getItem(POINTER_DEBUG_STORAGE_KEY) === 'true');
    updateDebugVisibility();
    window.addEventListener('storage', updateDebugVisibility);
    return () => window.removeEventListener('storage', updateDebugVisibility);
  }, []);

  useEffect(() => {
    const update = () => {
      const root = rootRef.current;
      if (!root || !visible || !pointer.visible) {
        setPosition((current) => current.available ? { ...current, available: false } : current);
        return;
      }
      const rootBounds = root.getBoundingClientRect();
      if (pointer.coordinateSpaceVersion === 3 && pointer.anchor) {
        let anchoredCoordinates: { clientX: number; clientY: number } | null = null;
        if (pointer.anchor.kind === 'editor') {
          anchoredCoordinates = resolveEditorPointerAnchor(pointer.anchor);
        } else {
          const elementAnchor = pointer.anchor;
          const anchoredElement = [...root.querySelectorAll<HTMLElement>('[data-pointer-anchor]')].find((element) => element.dataset.pointerAnchor === elementAnchor.id);
          if (anchoredElement) {
            const anchoredBounds = anchoredElement.getBoundingClientRect();
            anchoredCoordinates = { clientX: anchoredBounds.left + elementAnchor.xWithinElement * anchoredBounds.width, clientY: anchoredBounds.top + elementAnchor.yWithinElement * anchoredBounds.height };
          }
        }
        if (anchoredCoordinates) {
          const next = { left: anchoredCoordinates.clientX - rootBounds.left, top: anchoredCoordinates.clientY - rootBounds.top, available: true };
          setPosition((current) => current.left === next.left && current.top === next.top && current.available ? current : next);
          return;
        }
      }
      let bounds = rootBounds;
      if (pointer.surface === 'workspace' && pointer.coordinateSpaceVersion !== undefined) {
        const workspace = root.querySelector<HTMLElement>('[aria-label="Interactive workspace"]');
        if (!workspace) {
          setPosition((current) => current.available ? { ...current, available: false } : current);
          return;
        }
        bounds = workspace.getBoundingClientRect();
      } else if (pointer.surface === 'preview') {
        const iframe = root.querySelector<HTMLIFrameElement>('[data-presentation-preview-host] iframe');
        const presentation = iframe?.closest<HTMLElement>('[data-presentation-resource]');
        if (!iframe || presentation?.dataset.presentationMode === 'hidden') {
          setPosition((current) => current.available ? { ...current, available: false } : current);
          return;
        }
        bounds = iframe.closest<HTMLElement>('[data-presentation-preview-host]')?.getBoundingClientRect() ?? iframe.getBoundingClientRect();
      }
      const next = {
        left: bounds.left - rootBounds.left + pointer.x * bounds.width,
        top: bounds.top - rootBounds.top + pointer.y * bounds.height,
        available: bounds.width > 0 && bounds.height > 0,
      };
      setPosition((current) => current.left === next.left && current.top === next.top && current.available === next.available ? current : next);
    };
    let frame = 0;
    const trackPreview = () => {
      update();
      if ((pointer.surface === 'preview' || Boolean(pointer.anchor) || (pointer.surface === 'workspace' && pointer.coordinateSpaceVersion !== undefined)) && visible && pointer.visible) frame = requestAnimationFrame(trackPreview);
    };
    trackPreview();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      cancelAnimationFrame(frame);
    };
  }, [pointer, rootRef, visible]);

  return (
    <div
      aria-hidden="true"
      data-teacher-pointer
      data-pointer-surface={pointer.surface}
      data-pointer-visible={position.available ? 'true' : 'false'}
      data-pointer-click-button={clickButton ?? 'none'}
      data-pointer-click-sequence={clickSequence}
      className="pointer-events-none absolute left-0 top-0 z-[2000] transition-transform duration-75 ease-linear"
      style={{ transform: `translate3d(${position.left}px, ${position.top}px, 0)`, opacity: position.available ? 1 : 0 }}
    >
      <span data-pointer-hotspot className="absolute left-0 top-0 h-px w-px opacity-0" />
      {debugVisible ? (
        <span data-pointer-debug-crosshair className="absolute left-0 top-0 z-10 text-red-500">
          <span className="absolute left-[-12px] top-[-1px] h-[2px] w-6 bg-red-500" />
          <span className="absolute left-[-1px] top-[-12px] h-6 w-[2px] bg-red-500" />
          <span data-pointer-debug-center className="absolute left-[-3px] top-[-3px] h-[6px] w-[6px] rounded-full border border-white bg-red-600" />
          <span className="absolute left-3 top-3 whitespace-nowrap rounded bg-black/85 px-1.5 py-1 font-mono text-[10px] text-white shadow-lg">
            {pointer.surface}{pointer.anchor ? `/${pointer.anchor.kind}` : ''} · {pointer.x.toFixed(3)}, {pointer.y.toFixed(3)} · {Math.round(position.left)}, {Math.round(position.top)}px
          </span>
        </span>
      ) : null}
      {clickButton ? <span key={clickSequence} data-pointer-click-animation={clickButton} className="absolute left-0 top-0">
        <span className={`absolute -left-3 -top-3 h-6 w-6 rounded-full border-2 motion-safe:animate-ping ${clickButton === 'right' ? 'border-violet-500' : 'border-sky-400'}`} />
        {clickButton === 'right' ? <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full border-2 border-violet-300 motion-safe:animate-ping" /> : null}
      </span> : null}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="absolute left-[-9px] top-[-4px] drop-shadow-md" focusable="false">
        <path d="M8.68602 16.288L8.10556 9.37387C7.96399 7.68752 9.85032 6.59846 11.24 7.56424L16.9375 11.524C18.6256 12.6972 17.6579 15.348 15.611 15.1577L14.8273 15.0849C13.9821 15.0063 13.1795 15.4697 12.825 16.2409L12.4962 16.9561C11.6376 18.8238 8.858 18.3365 8.68602 16.288Z" stroke="#5124f5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
