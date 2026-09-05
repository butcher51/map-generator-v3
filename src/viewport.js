/**
 * Zoom and pan maths for showing a fixed-size map inside a viewport.
 *
 * Everything here is pure: no DOM, no canvas, no module-level state. A "view"
 * is `{ scale, x, y }` where `scale` is screen pixels per map cell and `x`/`y`
 * are the screen coordinates of the map's top-left corner.
 *
 * Two invariants hold for every view this module returns:
 *   - the map is never smaller than the viewport can show it (min scale = fit),
 *   - an axis is centred while it fits, and never leaves a gap once it does not.
 */

/** Largest allowed zoom, in screen pixels per map cell. */
export const MAX_SCALE = 32;

/** Multiplier applied by one press of the zoom in / zoom out buttons. */
export const BUTTON_ZOOM_STEP = 1.25;

/** How hard a wheel notch bites. Tuned against pixel-mode deltas. */
const WHEEL_SENSITIVITY = 0.002;

/** Pixels a wheel delta stands for, per WheelEvent.deltaMode. */
const DELTA_MODE_PIXELS = [1, 16, 100];

/** A single wheel gesture may never zoom by more than this factor. */
const MAX_WHEEL_FACTOR = 4;

/**
 * Scale at which the whole map fits inside the viewport. Degenerate sizes fall
 * back to 1 so a zero-height viewport (a hidden tab, a canvas measured before
 * layout) can never poison the view with NaN or Infinity.
 */
export function fitScale(content, viewport) {
  if (!isPositive(content?.width) || !isPositive(content?.height)) return 1;
  if (!isPositive(viewport?.width) || !isPositive(viewport?.height)) return 1;
  return Math.min(viewport.width / content.width, viewport.height / content.height);
}

/** Allowed scale range: never below the fit scale, never above MAX_SCALE. */
export function scaleLimits(content, viewport) {
  const min = fitScale(content, viewport);
  return { min, max: Math.max(min, MAX_SCALE) };
}

/** Clamp a scale into the allowed range, defaulting non-finite input to fit. */
export function clampScale(scale, content, viewport) {
  const { min, max } = scaleLimits(content, viewport);
  if (!Number.isFinite(scale)) return min;
  return Math.min(max, Math.max(min, scale));
}

/**
 * Clamp a view's offset: centre each axis that fits, and otherwise keep the map
 * covering the viewport so panning can never expose empty space at an edge.
 */
export function clampOffset(view, content, viewport) {
  const scale = Number.isFinite(view?.scale) ? view.scale : fitScale(content, viewport);
  return {
    scale,
    x: clampAxis(view?.x, content?.width * scale, viewport?.width),
    y: clampAxis(view?.y, content?.height * scale, viewport?.height),
  };
}

/** Clamp both the scale and the offset of a view. */
export function clampView(view, content, viewport) {
  const scale = clampScale(view?.scale, content, viewport);
  return clampOffset({ scale, x: view?.x, y: view?.y }, content, viewport);
}

/** The default view: whole map visible and centred. */
export function fitView(content, viewport) {
  return clampView({ scale: fitScale(content, viewport), x: 0, y: 0 }, content, viewport);
}

/**
 * Zoom by `factor` while holding the map point under `anchor` still, so the
 * spot the pointer is over stays put. A missing anchor zooms about the centre.
 */
export function zoomView(view, factor, anchor, content, viewport) {
  const current = clampView(view, content, viewport);
  const multiplier = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const scale = clampScale(current.scale * multiplier, content, viewport);
  const ratio = scale / current.scale;

  const ax = Number.isFinite(anchor?.x) ? anchor.x : (viewport?.width ?? 0) / 2;
  const ay = Number.isFinite(anchor?.y) ? anchor.y : (viewport?.height ?? 0) / 2;

  return clampOffset(
    {
      scale,
      x: ax - (ax - current.x) * ratio,
      y: ay - (ay - current.y) * ratio,
    },
    content,
    viewport,
  );
}

/** Move the map by a screen-space delta, clamped to the viewport. */
export function panView(view, dx, dy, content, viewport) {
  const current = clampView(view, content, viewport);
  return clampOffset(
    {
      scale: current.scale,
      x: current.x + (Number.isFinite(dx) ? dx : 0),
      y: current.y + (Number.isFinite(dy) ? dy : 0),
    },
    content,
    viewport,
  );
}

/** True when the map is larger than the viewport, so panning can do something. */
export function canPan(view, content, viewport) {
  const current = clampView(view, content, viewport);
  return (
    content.width * current.scale > (viewport?.width ?? 0) + 0.5 ||
    content.height * current.scale > (viewport?.height ?? 0) + 0.5
  );
}

/**
 * Zoom multiplier for a wheel event. Scrolling up (negative delta) zooms in.
 * Line and page deltas are converted to pixels first so a mouse wheel and a
 * trackpad feel the same, and one gesture is capped so a flung trackpad or a
 * page-mode wheel cannot jump the whole zoom range at once.
 */
export function wheelZoomFactor({ deltaY = 0, deltaMode = 0 } = {}) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  const pixels = deltaY * (DELTA_MODE_PIXELS[deltaMode] ?? 1);
  const factor = Math.exp(-pixels * WHEEL_SENSITIVITY);
  return Math.min(MAX_WHEEL_FACTOR, Math.max(1 / MAX_WHEEL_FACTOR, factor));
}

/**
 * Zoom shown to the user, as a percentage of the fit scale, so a freshly
 * generated map always reads 100% whatever the window size.
 */
export function zoomPercent(view, content, viewport) {
  const scale = clampScale(view?.scale, content, viewport);
  return Math.round((scale / fitScale(content, viewport)) * 100);
}

// --- internals ---------------------------------------------------------

function clampAxis(offset, contentSize, viewportSize) {
  const size = Number.isFinite(contentSize) ? contentSize : 0;
  const available = Number.isFinite(viewportSize) ? viewportSize : 0;
  if (size <= available) return (available - size) / 2;
  if (!Number.isFinite(offset)) return (available - size) / 2;
  return Math.min(0, Math.max(available - size, offset));
}

function isPositive(value) {
  return Number.isFinite(value) && value > 0;
}
