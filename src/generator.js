/**
 * Seeded map generation.
 *
 * Everything in this module is pure: no DOM, no canvas, no module-level state.
 * The same seed always produces the same map, which is what makes it testable
 * and what lets the UI share a map by sharing its seed.
 */

/** Terrain names, ordered from lowest elevation to highest. */
export const TERRAINS = ['water', 'sand', 'grass', 'forest', 'rock', 'snow'];

/** Upper bound of each terrain band, in normalised height. */
const BANDS = [
  { max: 0.3, terrain: 'water' },
  { max: 0.38, terrain: 'sand' },
  { max: 0.55, terrain: 'grass' },
  { max: 0.7, terrain: 'forest' },
  { max: 0.85, terrain: 'rock' },
  { max: Infinity, terrain: 'snow' },
];

/**
 * Turn any seed value into a 32-bit integer. Numbers are truncated; anything
 * else is stringified and hashed (FNV-1a), so "coast" and "desert" are stable
 * seeds too.
 */
export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.trunc(seed) | 0;
  const str = String(seed ?? '');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

/**
 * Deterministic PRNG (mulberry32). Returns a function yielding floats in [0, 1).
 */
export function makeRng(seed) {
  let state = normalizeSeed(seed);
  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Map a normalised height to a terrain name. */
export function classify(height) {
  const h = clamp01(height);
  for (const band of BANDS) {
    if (h < band.max) return band.terrain;
  }
  return 'snow';
}

/**
 * Generate a normalised heightmap as a flat Float64Array of width * height
 * values, every one of them in [0, 1].
 */
export function generateHeightmap({ width, height, seed = 0, scale = 8, octaves = 4 } = {}) {
  assertPositiveInt(width, 'width');
  assertPositiveInt(height, 'height');

  const rng = makeRng(seed);
  const raw = new Float64Array(width * height);

  let amplitude = 1;
  let frequency = 1;
  let totalAmplitude = 0;

  for (let octave = 0; octave < Math.max(1, octaves); octave += 1) {
    const cols = Math.max(2, Math.ceil((scale * frequency) / 1) + 1);
    const rows = cols;
    const grid = randomGrid(cols, rows, rng);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        // Map pixel space onto the lattice, leaving a cell of headroom so the
        // bilinear sample always has a neighbour to interpolate towards.
        const lx = (x / width) * (cols - 1);
        const ly = (y / height) * (rows - 1);
        raw[y * width + x] += sampleGrid(grid, lx, ly) * amplitude;
      }
    }

    totalAmplitude += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  for (let i = 0; i < raw.length; i += 1) raw[i] /= totalAmplitude;
  return normalize(raw);
}

/**
 * Generate a complete map: heights plus the terrain each cell falls into.
 *
 * @returns {{width:number, height:number, seed:*, heights:Float64Array, terrain:string[]}}
 */
export function generateMap({ width = 96, height = 64, seed = 0, scale = 8, octaves = 4 } = {}) {
  const heights = generateHeightmap({ width, height, seed, scale, octaves });
  const terrain = new Array(heights.length);
  for (let i = 0; i < heights.length; i += 1) terrain[i] = classify(heights[i]);
  return { width, height, seed, heights, terrain };
}

/** Terrain name at a cell, or undefined when the coordinates are off the map. */
export function terrainAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return undefined;
  return map.terrain[y * map.width + x];
}

/** Count of cells per terrain, useful for a legend or for summary stats. */
export function terrainHistogram(map) {
  const counts = Object.fromEntries(TERRAINS.map((t) => [t, 0]));
  for (const t of map.terrain) counts[t] += 1;
  return counts;
}

// --- internals ---------------------------------------------------------

function randomGrid(cols, rows, rng) {
  const values = new Float64Array(cols * rows);
  for (let i = 0; i < values.length; i += 1) values[i] = rng();
  return { cols, rows, values };
}

function sampleGrid(grid, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);

  const at = (cx, cy) => {
    const gx = Math.min(grid.cols - 1, Math.max(0, cx));
    const gy = Math.min(grid.rows - 1, Math.max(0, cy));
    return grid.values[gy * grid.cols + gx];
  };

  const top = lerp(at(x0, y0), at(x0 + 1, y0), tx);
  const bottom = lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx);
  return lerp(top, bottom, ty);
}

function normalize(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    out[i] = span === 0 ? 0.5 : clamp01((values[i] - min) / span);
  }
  return out;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function assertPositiveInt(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer, got ${value}`);
  }
}
