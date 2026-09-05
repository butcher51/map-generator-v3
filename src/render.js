/**
 * Canvas rendering for a generated map. Kept separate from generator.js so the
 * generation logic stays free of browser APIs and testable in Node.
 */

import { TERRAINS } from './generator.js';

/** Fill colour per terrain. */
export const TERRAIN_COLORS = {
  water: '#2b6cb0',
  sand: '#ddc48c',
  grass: '#5f9e4f',
  forest: '#2f6b3a',
  rock: '#8d8d8d',
  snow: '#eef2f6',
};

/**
 * Paint a map onto a 2D canvas context, sizing the canvas to fit.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{width:number,height:number,terrain:string[]}} map
 * @param {{cellSize?:number}} [options]
 */
export function renderMap(ctx, map, { cellSize = 8 } = {}) {
  const canvas = ctx.canvas;
  canvas.width = map.width * cellSize;
  canvas.height = map.height * cellSize;

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      ctx.fillStyle = TERRAIN_COLORS[map.terrain[y * map.width + x]] ?? '#ff00ff';
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
}

/**
 * Blit an already-painted map onto the visible canvas under a zoom/pan view.
 *
 * The map is rendered once at one pixel per cell into an off-screen canvas;
 * this only scales and offsets that buffer, so zooming never re-generates.
 *
 * @param {CanvasRenderingContext2D} ctx      context of the on-screen canvas
 * @param {CanvasImageSource & {width:number,height:number}} source  map buffer
 * @param {{scale:number,x:number,y:number}} view  in CSS pixels
 * @param {{pixelRatio?:number}} [options]
 */
export function drawScene(ctx, source, view, { pixelRatio = 1 } = {}) {
  const canvas = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!(view.scale > 0) || source.width === 0 || source.height === 0) return;

  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  // Crisp cells: the map is pixel art, so never blur it when zoomed in.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, view.x, view.y, source.width * view.scale, source.height * view.scale);
}

/**
 * Build the legend markup as DOM nodes. Returns a DocumentFragment so the
 * caller decides where it goes.
 */
export function buildLegend(document, histogram) {
  const fragment = document.createDocumentFragment();
  for (const terrain of TERRAINS) {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = TERRAIN_COLORS[terrain];
    item.append(swatch, `${terrain} (${histogram[terrain] ?? 0})`);
    fragment.append(item);
  }
  return fragment;
}
