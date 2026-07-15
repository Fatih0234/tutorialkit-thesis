const CHANNEL = 'tutorialkit:pointer-bridge';
const VERSION = 1;
let parentOrigin = '';
let nonce = '';
let enabled = false;
let frame = 0;
let latestPointer;

window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.data?.channel !== CHANNEL || event.data?.version !== VERSION) return;
  if (event.data.action === 'enable' && typeof event.data.nonce === 'string') {
    parentOrigin = event.origin;
    nonce = event.data.nonce;
    enabled = true;
    window.__tutorialKitPointerBridgeEnabled = true;
  } else if (event.data.action === 'disable' && event.data.nonce === nonce) {
    enabled = false;
    window.__tutorialKitPointerBridgeEnabled = false;
    nonce = '';
  }
});

window.addEventListener('pointermove', (event) => {
  if (!enabled) return;
  latestPointer = event;
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!enabled || !latestPointer || !innerWidth || !innerHeight) return;
    window.parent.postMessage({ channel: CHANNEL, version: VERSION, action: 'move', nonce, x: latestPointer.clientX / innerWidth, y: latestPointer.clientY / innerHeight }, parentOrigin);
  });
});

window.addEventListener('pointerdown', (event) => {
  if (!enabled || (event.button !== 0 && event.button !== 2) || !innerWidth || !innerHeight) return;
  window.parent.postMessage({ channel: CHANNEL, version: VERSION, action: 'click', nonce, x: event.clientX / innerWidth, y: event.clientY / innerHeight, button: event.button === 2 ? 'right' : 'left' }, parentOrigin);
});

window.addEventListener('pointerleave', () => {
  if (enabled) window.parent.postMessage({ channel: CHANNEL, version: VERSION, action: 'leave', nonce }, parentOrigin);
});

window.__tutorialKitPointerBridgeEnabled = false;
window.parent.postMessage({ channel: CHANNEL, version: VERSION, action: 'ready' }, '*');
