import { describe, expect, it } from 'vitest';
import {
  BUTTON_ZOOM_STEP,
  MAX_SCALE,
  canPan,
  clampOffset,
  clampScale,
  clampView,
  fitScale,
  fitView,
  panView,
  scaleLimits,
  wheelZoomFactor,
  zoomPercent,
  zoomView,
} from '../src/viewport.js';

const MAP = { width: 500, height: 500 };
const WIDE = { width: 1000, height: 600 };

describe('fitScale', () => {
  it('fits by the tighter axis', () => {
    // 600 / 500 is tighter than 1000 / 500.
    expect(fitScale(MAP, WIDE)).toBeCloseTo(1.2);
    expect(fitScale({ width: 500, height: 200 }, WIDE)).toBeCloseTo(2);
  });

  it('falls back to 1 for degenerate sizes', () => {
    expect(fitScale(MAP, { width: 0, height: 0 })).toBe(1);
    expect(fitScale(MAP, { width: 100, height: Number.NaN })).toBe(1);
    expect(fitScale({ width: 0, height: 10 }, WIDE)).toBe(1);
    expect(fitScale({ width: 10, height: -1 }, WIDE)).toBe(1);
    expect(fitScale(undefined, undefined)).toBe(1);
  });
});

describe('scaleLimits', () => {
  it('runs from the fit scale up to MAX_SCALE', () => {
    expect(scaleLimits(MAP, WIDE)).toEqual({ min: fitScale(MAP, WIDE), max: MAX_SCALE });
  });

  it('never reports a max below the min', () => {
    // A tiny map on a big screen fits at a scale above MAX_SCALE.
    const limits = scaleLimits({ width: 2, height: 2 }, WIDE);
    expect(limits.min).toBe(300);
    expect(limits.max).toBe(300);
  });
});

describe('clampScale', () => {
  it('keeps a scale inside the limits', () => {
    expect(clampScale(4, MAP, WIDE)).toBe(4);
    expect(clampScale(0.1, MAP, WIDE)).toBeCloseTo(1.2);
    expect(clampScale(1e6, MAP, WIDE)).toBe(MAX_SCALE);
  });

  it('defaults non-finite scales to fit', () => {
    expect(clampScale(Number.NaN, MAP, WIDE)).toBeCloseTo(1.2);
    expect(clampScale(undefined, MAP, WIDE)).toBeCloseTo(1.2);
  });
});

describe('clampOffset', () => {
  it('centres an axis that fits', () => {
    // At the fit scale the map is 600x600 inside 1000x600.
    const view = clampOffset({ scale: 1.2, x: 999, y: 999 }, MAP, WIDE);
    expect(view.x).toBeCloseTo(200);
    expect(view.y).toBeCloseTo(0);
  });

  it('stops an oversized axis from leaving a gap', () => {
    // At scale 4 the map is 2000x2000: x may run from -1000 to 0.
    expect(clampOffset({ scale: 4, x: 50, y: -100 }, MAP, WIDE).x).toBe(0);
    expect(clampOffset({ scale: 4, x: -5000, y: -100 }, MAP, WIDE).x).toBe(-1000);
    expect(clampOffset({ scale: 4, x: -250, y: -100 }, MAP, WIDE).x).toBe(-250);
  });

  it('recentres when the offset is missing or non-finite', () => {
    expect(clampOffset({ scale: 4 }, MAP, WIDE)).toEqual({ scale: 4, x: -500, y: -700 });
    expect(clampOffset({ scale: 4, x: Number.NaN, y: 0 }, MAP, WIDE).x).toBe(-500);
  });

  it('falls back to the fit scale when the scale is not a number', () => {
    expect(clampOffset({ x: 0, y: 0 }, MAP, WIDE).scale).toBeCloseTo(1.2);
    expect(clampOffset(undefined, MAP, WIDE).scale).toBeCloseTo(1.2);
  });
});

describe('fitView / clampView', () => {
  it('shows the whole map, centred', () => {
    const view = fitView(MAP, WIDE);
    expect(view.scale).toBeCloseTo(1.2);
    expect(view.x).toBeCloseTo(200);
    expect(view.y).toBeCloseTo(0);
    expect(MAP.width * view.scale).toBeLessThanOrEqual(WIDE.width);
    expect(MAP.height * view.scale).toBeLessThanOrEqual(WIDE.height);
  });

  it('clamps scale and offset together', () => {
    const view = clampView({ scale: 0.01, x: -900, y: -900 }, MAP, WIDE);
    expect(view.scale).toBeCloseTo(1.2);
    expect(view.x).toBeCloseTo(200);
  });

  it('re-fits a zoomed view when the viewport grows past it', () => {
    const zoomed = { scale: 1.2, x: 200, y: 0 };
    const grown = clampView(zoomed, MAP, { width: 2000, height: 2000 });
    expect(grown.scale).toBe(4);
    expect(grown.x).toBe(0);
  });

  it('tolerates a missing view', () => {
    expect(clampView(undefined, MAP, WIDE).scale).toBeCloseTo(1.2);
  });
});

describe('zoomView', () => {
  it('holds the anchored map point still', () => {
    const start = fitView(MAP, WIDE); // scale 1.2, x 200, y 0
    const anchor = { x: 500, y: 300 };
    const mapX = (anchor.x - start.x) / start.scale;
    const mapY = (anchor.y - start.y) / start.scale;

    const zoomed = zoomView(start, 2, anchor, MAP, WIDE);
    expect(zoomed.scale).toBeCloseTo(2.4);
    expect(zoomed.x + mapX * zoomed.scale).toBeCloseTo(anchor.x);
    expect(zoomed.y + mapY * zoomed.scale).toBeCloseTo(anchor.y);
  });

  it('zooms about the viewport centre without an anchor', () => {
    const start = fitView(MAP, WIDE);
    const zoomed = zoomView(start, 2, undefined, MAP, WIDE);
    const centreX = zoomed.x + (MAP.width * zoomed.scale) / 2;
    expect(centreX).toBeCloseTo(WIDE.width / 2);
  });

  it('cannot zoom out past fit or in past MAX_SCALE', () => {
    const start = fitView(MAP, WIDE);
    expect(zoomView(start, 0.01, undefined, MAP, WIDE)).toEqual(start);
    expect(zoomView(start, 1e6, undefined, MAP, WIDE).scale).toBe(MAX_SCALE);
  });

  it('round-trips a button zoom in and back out', () => {
    const start = fitView(MAP, WIDE);
    const inThenOut = zoomView(
      zoomView(start, BUTTON_ZOOM_STEP, undefined, MAP, WIDE),
      1 / BUTTON_ZOOM_STEP,
      undefined,
      MAP,
      WIDE,
    );
    expect(inThenOut.scale).toBeCloseTo(start.scale);
    expect(inThenOut.x).toBeCloseTo(start.x);
  });

  it('ignores a non-positive or non-finite factor', () => {
    const start = fitView(MAP, WIDE);
    expect(zoomView(start, 0, undefined, MAP, WIDE)).toEqual(start);
    expect(zoomView(start, Number.NaN, undefined, MAP, WIDE)).toEqual(start);
    expect(zoomView(start, -2, undefined, MAP, WIDE)).toEqual(start);
  });

  it('survives a degenerate viewport', () => {
    const view = zoomView({ scale: 1, x: 0, y: 0 }, 2, undefined, MAP, { width: 0, height: 0 });
    expect(Number.isFinite(view.scale)).toBe(true);
    expect(Number.isFinite(view.x)).toBe(true);
  });
});

describe('panView', () => {
  it('moves a zoomed map', () => {
    const zoomed = clampView({ scale: 4, x: -500, y: -700 }, MAP, WIDE);
    const panned = panView(zoomed, 100, -50, MAP, WIDE);
    expect(panned.x).toBe(-400);
    expect(panned.y).toBe(-750);
  });

  it('cannot drag the map off the viewport', () => {
    const zoomed = clampView({ scale: 4, x: -500, y: -700 }, MAP, WIDE);
    expect(panView(zoomed, 5000, 0, MAP, WIDE).x).toBe(0);
    expect(panView(zoomed, -5000, 0, MAP, WIDE).x).toBe(-1000);
  });

  it('does nothing while the map fits', () => {
    const fitted = fitView(MAP, WIDE);
    expect(panView(fitted, 250, 250, MAP, WIDE)).toEqual(fitted);
  });

  it('treats non-finite deltas as zero', () => {
    const zoomed = clampView({ scale: 4, x: -500, y: -700 }, MAP, WIDE);
    expect(panView(zoomed, Number.NaN, undefined, MAP, WIDE)).toEqual(zoomed);
  });
});

describe('canPan', () => {
  it('is false at fit and true once zoomed in', () => {
    expect(canPan(fitView(MAP, WIDE), MAP, WIDE)).toBe(false);
    expect(canPan({ scale: 4, x: -500, y: -700 }, MAP, WIDE)).toBe(true);
  });

  it('is true when only one axis overflows', () => {
    // 500 wide by 100 tall at the fit scale of 2 covers 1000x200 in 1000x600.
    const wideMap = { width: 500, height: 100 };
    expect(canPan({ scale: 3, x: 0, y: 0 }, wideMap, WIDE)).toBe(true);
  });
});

describe('wheelZoomFactor', () => {
  it('zooms in when scrolling up and out when scrolling down', () => {
    expect(wheelZoomFactor({ deltaY: -100 })).toBeGreaterThan(1);
    expect(wheelZoomFactor({ deltaY: 100 })).toBeLessThan(1);
    expect(wheelZoomFactor({ deltaY: -100 }) * wheelZoomFactor({ deltaY: 100 })).toBeCloseTo(1);
  });

  it('is neutral for no scroll or a broken event', () => {
    expect(wheelZoomFactor({ deltaY: 0 })).toBe(1);
    expect(wheelZoomFactor({ deltaY: Number.NaN })).toBe(1);
    expect(wheelZoomFactor({})).toBe(1);
    expect(wheelZoomFactor()).toBe(1);
  });

  it('scales line and page deltas up to pixels', () => {
    expect(wheelZoomFactor({ deltaY: -3, deltaMode: 1 })).toBeGreaterThan(
      wheelZoomFactor({ deltaY: -3, deltaMode: 0 }),
    );
    expect(wheelZoomFactor({ deltaY: -1, deltaMode: 2 })).toBeGreaterThan(
      wheelZoomFactor({ deltaY: -1, deltaMode: 1 }),
    );
    expect(wheelZoomFactor({ deltaY: -100, deltaMode: 9 })).toBe(
      wheelZoomFactor({ deltaY: -100, deltaMode: 0 }),
    );
  });

  it('caps one gesture so a fling cannot jump the whole range', () => {
    expect(wheelZoomFactor({ deltaY: -100000 })).toBe(4);
    expect(wheelZoomFactor({ deltaY: 100000 })).toBe(0.25);
  });
});

describe('zoomPercent', () => {
  it('reads 100% at fit, whatever the window size', () => {
    expect(zoomPercent(fitView(MAP, WIDE), MAP, WIDE)).toBe(100);
    const tall = { width: 400, height: 1200 };
    expect(zoomPercent(fitView(MAP, tall), MAP, tall)).toBe(100);
  });

  it('grows with the zoom', () => {
    expect(zoomPercent({ scale: 2.4, x: 0, y: 0 }, MAP, WIDE)).toBe(200);
    expect(zoomPercent({ scale: 1e6, x: 0, y: 0 }, MAP, WIDE)).toBe(
      Math.round((MAX_SCALE / 1.2) * 100),
    );
  });
});
