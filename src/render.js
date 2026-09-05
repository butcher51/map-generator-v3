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
