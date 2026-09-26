// =====================================================================
// PlantUML for ChatGPT - Standalone diagram viewer
// =====================================================================

const RENDERER_URL = chrome.runtime.getURL('renderer.html');
const RENDERER_ORIGIN = new URL(RENDERER_URL).origin;
const openerWindow = window.opener;
const CHATGPT_ORIGIN = 'https://chatgpt.com';
const fragmentRequestId = new URLSearchParams(window.location.hash.slice(1)).get('requestId');
const requestId = fragmentRequestId ||
  ('viewer-' + Date.now() + '-' + Math.random().toString(36).slice(2));

const titleEl = document.getElementById('title');
const stage = document.getElementById('stage');
const canvas = document.getElementById('canvas');
const renderer = document.getElementById('renderer');
const sourceEl = document.getElementById('source');
const statusEl = document.getElementById('status');
const sourceToggle = document.getElementById('sourceToggle');

let source = '';
let dark = false;
let sourceVisible = false;
let ready = false;
let intrinsicWidth = 0;
let intrinsicHeight = 0;
let frameWidth = 0;
let frameHeight = 0;
let scale = 1;
let translateX = 0;
let translateY = 0;
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragOriginX = 0;
let dragOriginY = 0;
let svgText = null;
let bitmapCounter = 0;
let readyTimer = null;
const pendingBitmap = new Map();
const pendingSvg = new Map();
let runtimeInitAccepted = false;

function postToRenderer(message) {
  renderer.contentWindow.postMessage(message, '*');
}

function setStatus(text) {
  statusEl.textContent = text;
  statusEl.hidden = !text;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampTranslation(x, y) {
  const stageWidth = stage.clientWidth;
  const stageHeight = stage.clientHeight;
  const contentWidth = frameWidth * scale;
  const contentHeight = frameHeight * scale;
  const nextX = contentWidth <= stageWidth
    ? (stageWidth - contentWidth) / 2
    : clamp(x, stageWidth - contentWidth, 0);
  const nextY = contentHeight <= stageHeight
    ? (stageHeight - contentHeight) / 2
    : clamp(y, stageHeight - contentHeight, 0);
  return { x: nextX, y: nextY };
}

function applyTransform() {
  const position = clampTranslation(translateX, translateY);
  translateX = position.x;
  translateY = position.y;
  renderer.style.width = frameWidth + 'px';
  renderer.style.height = frameHeight + 'px';
  renderer.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}

function fitDiagram() {
  if (!frameWidth || !frameHeight) return;
  const padding = 24;
  scale = Math.min(1, (stage.clientWidth - padding) / frameWidth, (stage.clientHeight - padding) / frameHeight);
  translateX = 0;
  translateY = 0;
  applyTransform();
}

function setActualSize() {
  scale = 1;
  translateX = 0;
  translateY = 0;
  applyTransform();
}

function changeZoom(factor) {
  const centerX = stage.clientWidth / 2;
  const centerY = stage.clientHeight / 2;
  const oldScale = scale;
  scale = clamp(scale * factor, 0.1, 8);
  translateX = centerX - (centerX - translateX) * (scale / oldScale);
  translateY = centerY - (centerY - translateY) * (scale / oldScale);
  applyTransform();
}

function toggleSource() {
  sourceVisible = !sourceVisible;
  if (!sourceVisible) {
    source = sourceEl.value;
    if (ready) {
      setStatus('Rendering diagram…');
      postToRenderer({ type: 'PLANTUML_RENDER', source, requestId, options: { dark } });
    }
  }
  sourceEl.style.display = sourceVisible ? 'block' : 'none';
  renderer.style.display = sourceVisible ? 'none' : 'block';
  sourceToggle.textContent = sourceVisible ? 'Show diagram' : 'Show source';
  if (!sourceVisible) applyTransform();
}

async function copySvg() {
  if (!ready) return;
  const id = 'viewer-svg-' + Date.now();
  const svgPromise = new Promise((resolve, reject) => {
    pendingSvg.set(id, { resolve, reject });
  });
  postToRenderer({ type: 'PLANTUML_COPY_SVG', requestId: id });
  try {
    await navigator.clipboard.writeText(await svgPromise);
    setStatus('SVG copied');
    setTimeout(() => setStatus(''), 1200);
  } catch (error) {
    pendingSvg.delete(id);
    setStatus('Copy SVG failed');
  }
}

async function copyPng() {
  const id = 'viewer-bitmap-' + (++bitmapCounter);
  let resolveBlob;
  let rejectBlob;
  const blobPromise = new Promise((resolve, reject) => {
    resolveBlob = resolve;
    rejectBlob = reject;
  });
  const timeout = setTimeout(() => {
    pendingBitmap.delete(id);
    rejectBlob(new Error('Bitmap copy timed out'));
  }, 10000);
  pendingBitmap.set(id, {
    resolve: (blob) => { clearTimeout(timeout); resolveBlob(blob); },
    reject: (error) => { clearTimeout(timeout); rejectBlob(error); }
  });
  postToRenderer({ type: 'PLANTUML_COPY_BITMAP', requestId: id });
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
    setStatus('PNG copied');
    setTimeout(() => setStatus(''), 1200);
  } catch (error) {
    pendingBitmap.delete(id);
    setStatus('Copy PNG failed');
  }
}

function closeViewer() {
  window.close();
  setTimeout(() => {
    if (!window.closed) setStatus('You can close this tab to return to ChatGPT');
  }, 100);
}

function acceptViewerInit(data) {
  if (!data || data.requestId !== requestId || typeof data.source !== 'string') {
    return false;
  }
  if (runtimeInitAccepted && ready) return true;

  runtimeInitAccepted = true;
  source = data.source;
  dark = data.dark === true;
  document.body.classList.toggle('dark', dark);
  titleEl.textContent = typeof data.title === 'string' && data.title ? data.title : 'PlantUML diagram';
  sourceEl.value = source;
  renderer.src = RENDERER_URL;
  ready = true;
  if (readyTimer) {
    clearInterval(readyTimer);
    readyTimer = null;
  }
  setStatus('Loading diagram…');
  return true;
}

// Split View pages are not opened with window.open(), so they do not have an
// opener WindowProxy. Runtime messaging is retried by the content script
// while this page is loading to avoid losing the source.
chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
  if (!data || data.type !== 'PLANTUML_VIEWER_INIT') return false;
  if (!acceptViewerInit(data)) return false;
  sendResponse({ ok: true, requestId });
  return false;
});

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'PLANTUML_VIEWER_INIT') {
    if (event.origin !== CHATGPT_ORIGIN || data.requestId !== requestId) return;
    if (!acceptViewerInit(data)) return;
    // A content script can expose a different WindowProxy wrapper (or a
    // null source) when it forwards the message from the ChatGPT page.
    // The ChatGPT origin and one-time random requestId still authenticate
    // this initialization message.
    if (event.source && openerWindow && event.source !== openerWindow) {
      console.debug('[PlantUML viewer] opener proxy differs; accepting matching INIT');
    }
    return;
  }

  if (event.source !== renderer.contentWindow ||
      (event.origin !== RENDERER_ORIGIN && event.origin !== 'null')) return;
  if (data.type === 'PLANTUML_RESULT' && typeof data.width === 'number' && typeof data.height === 'number') {
    intrinsicWidth = data.width;
    intrinsicHeight = data.height;
    // renderer.html has 8px padding on both sides. Keep a little extra
    // room so the SVG's right/bottom edge is never clipped by the iframe.
    frameWidth = Math.max(1, intrinsicWidth + 32);
    frameHeight = Math.max(1, intrinsicHeight + 32);
    svgText = typeof data.svg === 'string' ? data.svg : null;
    setStatus('');
    fitDiagram();
    return;
  }
  if (data.type === 'PLANTUML_ERROR') {
    setStatus(data.error || 'Rendering failed');
    return;
  }
  if (data.type === 'PLANTUML_SVG_RESULT' && typeof data.svg === 'string') {
    svgText = data.svg;
    const pending = pendingSvg.get(data.requestId);
    if (pending) {
      pendingSvg.delete(data.requestId);
      pending.resolve(data.svg);
    }
    return;
  }
  if (data.type === 'PLANTUML_SVG_ERROR') {
    const pending = pendingSvg.get(data.requestId);
    if (pending) {
      pendingSvg.delete(data.requestId);
      pending.reject(new Error(data.error || 'Copy SVG failed'));
    }
    setStatus(data.error || 'Copy SVG failed');
    return;
  }
  if (data.type === 'PLANTUML_BITMAP_RESULT' || data.type === 'PLANTUML_BITMAP_ERROR') {
    const pending = pendingBitmap.get(data.requestId);
    if (!pending) return;
    pendingBitmap.delete(data.requestId);
    if (data.type === 'PLANTUML_BITMAP_RESULT' && data.blob instanceof Blob) pending.resolve(data.blob);
    else pending.reject(new Error(data.error || 'Copy PNG failed'));
  }
});

renderer.addEventListener('load', () => {
  if (!ready) return;
  postToRenderer({ type: 'PLANTUML_SET_MODE', mode: 'viewer' });
  postToRenderer({ type: 'PLANTUML_RENDER', source, requestId, options: { dark } });
});

document.getElementById('fit').addEventListener('click', fitDiagram);
document.getElementById('actual').addEventListener('click', setActualSize);
document.getElementById('zoomOut').addEventListener('click', () => changeZoom(0.8));
document.getElementById('zoomIn').addEventListener('click', () => changeZoom(1.25));
document.getElementById('reset').addEventListener('click', fitDiagram);
sourceToggle.addEventListener('click', toggleSource);
sourceEl.addEventListener('input', () => {
  source = sourceEl.value;
});
document.getElementById('copySvg').addEventListener('click', copySvg);
document.getElementById('copyPng').addEventListener('click', copyPng);
document.getElementById('close').addEventListener('click', closeViewer);

canvas.addEventListener('wheel', (event) => {
  if (sourceVisible || !frameWidth) return;
  event.preventDefault();
  changeZoom(event.deltaY < 0 ? 1.1 : 0.9);
}, { passive: false });

canvas.addEventListener('pointerdown', (event) => {
  if (sourceVisible) return;
  dragging = true;
  canvas.classList.add('dragging');
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragOriginX = translateX;
  dragOriginY = translateY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  translateX = dragOriginX + event.clientX - dragStartX;
  translateY = dragOriginY + event.clientY - dragStartY;
  applyTransform();
});
canvas.addEventListener('pointerup', () => {
  dragging = false;
  canvas.classList.remove('dragging');
});
canvas.addEventListener('pointercancel', () => {
  dragging = false;
  canvas.classList.remove('dragging');
});
window.addEventListener('resize', fitDiagram);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeViewer();
});

function announceReady() {
  if (!openerWindow || ready) return;
  openerWindow.postMessage({ type: 'PLANTUML_VIEWER_READY', requestId }, '*');
}

if (openerWindow) {
  // The new extension page can finish loading before the opener has
  // registered its pending request. Retry briefly so the one-time
  // handshake cannot be lost during fast page loads.
  announceReady();
  readyTimer = setInterval(announceReady, 100);
  setTimeout(() => {
    if (readyTimer && !ready) {
      clearInterval(readyTimer);
      readyTimer = null;
      setStatus('Viewer handshake timed out; close this tab and try again');
    }
  }, 10000);
} else {
  setStatus('Open this viewer from a ChatGPT diagram');
}
