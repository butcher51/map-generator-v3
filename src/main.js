/** Wires the DOM controls to the generator, the renderer and the zoom/pan view. */

import { generateMap, terrainHistogram } from './generator.js';
import { renderMap, buildLegend, drawScene } from './render.js';
import {
  BUTTON_ZOOM_STEP,
  canPan,
  clampView,
  fitView,
  panView,
  scaleLimits,
  wheelZoomFactor,
  zoomPercent,
  zoomView,
} from './viewport.js';

const MAP_SIZE = 1000;
const RIGHT_BUTTON = 2;

const canvas = document.querySelector('#map');
const legend = document.querySelector('#legend');
const seedInput = document.querySelector('#seed');
const form = document.querySelector('#controls');
const randomButton = document.querySelector('#random');
const zoomInButton = document.querySelector('#zoom-in');
const zoomOutButton = document.querySelector('#zoom-out');
const zoomLevel = document.querySelector('#zoom-level');

const ctx = canvas.getContext('2d');

// The map is painted once at one pixel per cell into this off-screen buffer;
// zooming and panning only re-blit it, so no seed is ever re-generated.
const buffer = document.createElement('canvas');
const bufferCtx = buffer.getContext('2d');

let content = { width: MAP_SIZE, height: MAP_SIZE };
let view = { scale: 1, x: 0, y: 0 };
let panPointerId = null;
let panFrom = null;

/** Viewport size in CSS pixels. */
function viewportSize() {
  return {
    width: canvas.clientWidth || window.innerWidth,
    height: canvas.clientHeight || window.innerHeight,
  };
}

/** Match the backing store to the element's CSS size and the display density. */
function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const { width, height } = viewportSize();
  const backingWidth = Math.max(1, Math.round(width * ratio));
  const backingHeight = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;
  return ratio;
}

function paint() {
  const ratio = resizeCanvas();
  const viewport = viewportSize();
  view = clampView(view, content, viewport);
  drawScene(ctx, buffer, view, { pixelRatio: ratio });

  const percent = zoomPercent(view, content, viewport);
  zoomLevel.textContent = `${percent}%`;
  canvas.dataset.zoom = String(percent);
  canvas.dataset.pan = `${Math.round(view.x)},${Math.round(view.y)}`;

  const { min, max } = scaleLimits(content, viewport);
  zoomOutButton.disabled = view.scale <= min + 1e-6;
  zoomInButton.disabled = view.scale >= max - 1e-6;
  canvas.dataset.pannable = canPan(view, content, viewport) ? 'true' : 'false';
}

function draw(seed) {
  const map = generateMap({ width: MAP_SIZE, height: MAP_SIZE, seed });
  renderMap(bufferCtx, map, { cellSize: 1 });
  legend.replaceChildren(buildLegend(document, terrainHistogram(map)));

  content = { width: map.width, height: map.height };
  resizeCanvas();
  view = fitView(content, viewportSize());
  paint();

  canvas.dataset.rendered = 'true';
  canvas.dataset.seed = String(seed);

  const url = new URL(window.location.href);
  url.searchParams.set('seed', seed);
  window.history.replaceState(null, '', url);
}

/** Pointer position relative to the canvas, in CSS pixels. */
function pointerAt(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function zoomBy(factor, anchor) {
  view = zoomView(view, factor, anchor, content, viewportSize());
  paint();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  draw(seedInput.value.trim() || '0');
});

randomButton.addEventListener('click', () => {
  seedInput.value = Math.floor(Math.random() * 1e6).toString(36);
  draw(seedInput.value);
});

zoomInButton.addEventListener('click', () => zoomBy(BUTTON_ZOOM_STEP));
zoomOutButton.addEventListener('click', () => zoomBy(1 / BUTTON_ZOOM_STEP));

canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    zoomBy(wheelZoomFactor(event), pointerAt(event));
  },
  { passive: false },
);

// Right button drags the map. The context menu is suppressed on the canvas so
// the drag is not interrupted by it.
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== RIGHT_BUTTON || panPointerId !== null) return;
  if (!canPan(view, content, viewportSize())) return;
  event.preventDefault();
  panPointerId = event.pointerId;
  panFrom = pointerAt(event);
  canvas.setPointerCapture(event.pointerId);
  canvas.dataset.panning = 'true';
});

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== panPointerId) return;
  const now = pointerAt(event);
  view = panView(view, now.x - panFrom.x, now.y - panFrom.y, content, viewportSize());
  panFrom = now;
  paint();
});

function endPan(event) {
  if (event.pointerId !== panPointerId) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  panPointerId = null;
  panFrom = null;
  delete canvas.dataset.panning;
}

canvas.addEventListener('pointerup', endPan);
canvas.addEventListener('pointercancel', endPan);

window.addEventListener('resize', paint);

const initialSeed = new URL(window.location.href).searchParams.get('seed') ?? 'map-generator-v3';
seedInput.value = initialSeed;
draw(initialSeed);
