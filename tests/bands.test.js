import { describe, expect, it } from 'vitest';
import { BANDS, FALLBACK_COLOR, TERRAINS, TERRAIN_COLORS, colorFor } from '../src/bands.js';

describe('BANDS', () => {
  it('has strictly rising bounds, so no band is empty or out of order', () => {
    let previous = 0;
    for (const band of BANDS) {
      expect(band.max).toBeGreaterThan(previous);
      previous = band.max;
    }
  });

  it('covers every height, up to and past 1', () => {
    expect(BANDS[BANDS.length - 1].max).toBe(Infinity);
  });

  it('names each terrain once and gives it a colour', () => {
    expect(new Set(TERRAINS).size).toBe(BANDS.length);
    for (const band of BANDS) expect(band.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('is frozen, so nothing can reconfigure it at runtime', () => {
    expect(Object.isFrozen(BANDS)).toBe(true);
    expect(BANDS.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(TERRAINS)).toBe(true);
    expect(Object.isFrozen(TERRAIN_COLORS)).toBe(true);
  });
});

describe('TERRAINS', () => {
  it('mirrors the band order', () => {
    expect(TERRAINS).toEqual(BANDS.map((band) => band.terrain));
  });
});

describe('TERRAIN_COLORS', () => {
  it('maps every terrain to its band colour', () => {
    expect(Object.keys(TERRAIN_COLORS)).toEqual([...TERRAINS]);
    for (const band of BANDS) expect(TERRAIN_COLORS[band.terrain]).toBe(band.color);
  });
});

describe('colorFor', () => {
  it('returns the band colour of a known terrain', () => {
    for (const band of BANDS) expect(colorFor(band.terrain)).toBe(band.color);
  });

  it('falls back for an unknown terrain', () => {
    expect(colorFor('lava')).toBe(FALLBACK_COLOR);
    expect(colorFor(undefined)).toBe(FALLBACK_COLOR);
  });
});
