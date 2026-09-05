/** Wires the DOM controls to the generator and renderer. */

import { generateMap, terrainHistogram } from './generator.js';
import { renderMap, buildLegend } from './render.js';

const canvas = document.querySelector('#map');
const legend = document.querySelector('#legend');
const seedInput = document.querySelector('#seed');
const form = document.querySelector('#controls');
const randomButton = document.querySelector('#random');

const ctx = canvas.getContext('2d');

function draw(seed) {
  const map = generateMap({ width: 96, height: 64, seed });
  renderMap(ctx, map, { cellSize: 8 });
  legend.replaceChildren(buildLegend(document, terrainHistogram(map)));
  canvas.dataset.rendered = 'true';
  canvas.dataset.seed = String(seed);

  const url = new URL(window.location.href);
  url.searchParams.set('seed', seed);
  window.history.replaceState(null, '', url);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  draw(seedInput.value.trim() || '0');
});

randomButton.addEventListener('click', () => {
  seedInput.value = Math.floor(Math.random() * 1e6).toString(36);
  draw(seedInput.value);
});

const initialSeed = new URL(window.location.href).searchParams.get('seed') ?? 'map-generator-v3';
seedInput.value = initialSeed;
draw(initialSeed);
