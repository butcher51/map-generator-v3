import { describe, expect, it } from 'vitest';
import {
  TERRAINS,
  classify,
  generateHeightmap,
  generateMap,
  makeRng,
  normalizeSeed,
  terrainAt,
  terrainHistogram,
} from '../src/generator.js';

describe('normalizeSeed', () => {
  it('passes integers through', () => {
    expect(normalizeSeed(42)).toBe(42);
  });

  it('truncates floats', () => {
    expect(normalizeSeed(7.9)).toBe(7);
  });

  it('hashes strings stably', () => {
    expect(normalizeSeed('coast')).toBe(normalizeSeed('coast'));
    expect(normalizeSeed('coast')).not.toBe(normalizeSeed('desert'));
  });

  it('tolerates nullish and non-finite seeds', () => {
    expect(Number.isInteger(normalizeSeed(undefined))).toBe(true);
    expect(Number.isInteger(normalizeSeed(null))).toBe(true);
    expect(Number.isInteger(normalizeSeed(Number.NaN))).toBe(true);
  });
});

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng('seed');
    const b = makeRng('seed');
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });

  it('diverges for different seeds', () => {
    const a = Array.from({ length: 5 }, makeRng(1));
    const b = Array.from({ length: 5 }, makeRng(2));
    expect(a).not.toEqual(b);
  });

  it('stays within [0, 1)', () => {
    const rng = makeRng('range');
    for (let i = 0; i < 500; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('classify', () => {
  it('maps the bands in elevation order', () => {
    expect(classify(0)).toBe('water');
    expect(classify(0.34)).toBe('sand');
    expect(classify(0.45)).toBe('grass');
    expect(classify(0.6)).toBe('forest');
    expect(classify(0.8)).toBe('rock');
    expect(classify(0.95)).toBe('snow');
  });

  it('clamps out-of-range and non-finite heights', () => {
    expect(classify(-5)).toBe('water');
    expect(classify(5)).toBe('snow');
    expect(classify(Number.NaN)).toBe('water');
  });

  it('only ever returns a known terrain', () => {
    for (let h = 0; h <= 1; h += 0.01) {
      expect(TERRAINS).toContain(classify(h));
    }
  });
});

describe('generateHeightmap', () => {
  it('honours the requested dimensions', () => {
    expect(generateHeightmap({ width: 20, height: 12, seed: 1 })).toHaveLength(240);
  });

  it('normalises every height into [0, 1]', () => {
    const heights = generateHeightmap({ width: 40, height: 30, seed: 'range' });
    for (const h of heights) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
    }
  });

  it('spans the full range rather than hugging the middle', () => {
    const heights = generateHeightmap({ width: 60, height: 40, seed: 'span' });
    expect(Math.min(...heights)).toBeCloseTo(0, 5);
    expect(Math.max(...heights)).toBeCloseTo(1, 5);
  });

  it('falls back to mid-height when the field is flat', () => {
    expect(Array.from(generateHeightmap({ width: 1, height: 1, seed: 3 }))).toEqual([0.5]);
  });

  it('accepts a single octave', () => {
    expect(generateHeightmap({ width: 8, height: 8, seed: 1, octaves: 0 })).toHaveLength(64);
  });

  it('rejects invalid dimensions', () => {
    expect(() => generateHeightmap({ width: 0, height: 10 })).toThrow(TypeError);
    expect(() => generateHeightmap({ width: 10, height: -1 })).toThrow(/height/);
    expect(() => generateHeightmap({ width: 1.5, height: 10 })).toThrow(/width/);
  });
});

describe('generateMap', () => {
  it('produces the same map for the same seed', () => {
    const a = generateMap({ width: 24, height: 16, seed: 'coast' });
    const b = generateMap({ width: 24, height: 16, seed: 'coast' });
    expect(a.terrain).toEqual(b.terrain);
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
  });

  it('produces a different map for a different seed', () => {
    const a = generateMap({ width: 24, height: 16, seed: 'coast' });
    const b = generateMap({ width: 24, height: 16, seed: 'desert' });
    expect(a.terrain).not.toEqual(b.terrain);
  });

  it('classifies every cell to a known terrain', () => {
    const map = generateMap({ width: 24, height: 16, seed: 7 });
    expect(map.terrain).toHaveLength(24 * 16);
    expect(new Set(map.terrain).size).toBeGreaterThan(1);
    for (const t of map.terrain) expect(TERRAINS).toContain(t);
  });

  it('has usable defaults', () => {
    const map = generateMap();
    expect(map.width).toBe(96);
    expect(map.height).toBe(64);
  });
});

describe('terrainAt', () => {
  const map = generateMap({ width: 10, height: 8, seed: 2 });

  it('reads a cell in row-major order', () => {
    expect(terrainAt(map, 3, 2)).toBe(map.terrain[2 * 10 + 3]);
  });

  it('returns undefined outside the map', () => {
    expect(terrainAt(map, -1, 0)).toBeUndefined();
    expect(terrainAt(map, 0, -1)).toBeUndefined();
    expect(terrainAt(map, 10, 0)).toBeUndefined();
    expect(terrainAt(map, 0, 8)).toBeUndefined();
  });
});

describe('terrainHistogram', () => {
  it('counts every cell exactly once', () => {
    const map = generateMap({ width: 32, height: 24, seed: 'hist' });
    const histogram = terrainHistogram(map);
    expect(Object.keys(histogram).sort()).toEqual([...TERRAINS].sort());
    const total = Object.values(histogram).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(32 * 24);
  });
});
