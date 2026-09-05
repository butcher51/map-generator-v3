/**
 * The single source of truth for terrain bands.
 *
 * A band is one entry of `{ terrain, max, color }`: the terrain name, the
 * exclusive upper bound of its slice of normalised height, and the colour it is
 * painted with. Add, remove, re-order or re-colour a terrain here and the
 * generator, the renderer and the legend all follow.
 *
 * This module is pure data plus lookups derived from it: no DOM, no canvas, no
 * mutable state.
 */

/**
 * Bands ordered from lowest elevation to highest. Bounds are exclusive, so a
 * height belongs to the first band whose `max` it falls under; the last band
 * uses `Infinity` to catch everything above.
 *
 * @type {ReadonlyArray<{terrain: string, max: number, color: string}>}
 */
export const BANDS = Object.freeze(
  [
    { terrain: 'water', max: 0.3, color: '#2b6cb0' },
    { terrain: 'sand', max: 0.38, color: '#ddc48c' },
    { terrain: 'grass', max: 0.55, color: '#5f9e4f' },
    { terrain: 'forest', max: 0.7, color: '#2f6b3a' },
    { terrain: 'rock', max: 0.85, color: '#8d8d8d' },
    { terrain: 'snow', max: Infinity, color: '#eef2f6' },
  ].map(Object.freeze),
);

/** Colour used when something asks for a terrain that has no band. */
export const FALLBACK_COLOR = '#ff00ff';

/** Terrain names, ordered from lowest elevation to highest. */
export const TERRAINS = Object.freeze(BANDS.map((band) => band.terrain));

/** Fill colour per terrain. */
export const TERRAIN_COLORS = Object.freeze(
  Object.fromEntries(BANDS.map((band) => [band.terrain, band.color])),
);

/** Colour for a terrain name, falling back to a loud colour for unknown ones. */
export function colorFor(terrain) {
  return TERRAIN_COLORS[terrain] ?? FALLBACK_COLOR;
}
