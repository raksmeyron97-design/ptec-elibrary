/* Pure zoom math for the PDF reader — kept out of the component so the
   preset-stepping and input-parsing rules are unit-testable. */

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 3;

/** Predictable zoom stops. Buttons step between these instead of adding
    an arbitrary delta, matching desktop PDF readers. */
export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

const EPS = 0.001;

export const clampScale = (v: number): number =>
  Math.max(MIN_SCALE, Math.min(MAX_SCALE, v));

/** Next preset above/below `current`. A scale sitting between two presets
    snaps to the nearest one in the requested direction. */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    for (const level of ZOOM_LEVELS) {
      if (level > current + EPS) return level;
    }
    return MAX_SCALE;
  }
  for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
    if (ZOOM_LEVELS[i] < current - EPS) return ZOOM_LEVELS[i];
  }
  return MIN_SCALE;
}

const KH_DIGITS = "០១២៣៤៥៦៧៨៩";

/** Parse a user-typed zoom percentage ("125", "125%", " ១២៥ %") into a
    clamped scale factor, or null when the input is not a usable number. */
export function parseZoomInput(raw: string): number | null {
  const normalized = raw
    .replace(/[០-៩]/g, (d) => String(KH_DIGITS.indexOf(d)))
    .replace(/%/g, "")
    .trim();
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return clampScale(value / 100);
}

/** The presets the zoom menu offers — a short, predictable list rather than
    every stop the ± buttons step through. Fit modes are listed by the menu
    itself ahead of these. */
export const ZOOM_PRESETS = [0.75, 1, 1.25, 1.5, 2] as const;

/** Where a double-tap takes the reader. Zoomed in (noticeably past the
    fit-width scale) → back to fit-width; otherwise → a comfortable reading
    zoom around the tap point. Returns null for "fit width". */
export function doubleTapTarget(effectiveScale: number, fitWidthScale: number): number | null {
  if (effectiveScale > fitWidthScale * 1.15) return null;
  return clampScale(Math.max(effectiveScale, fitWidthScale) * 1.9);
}

/** True when the page is not zoomed beyond fit-width — the state in which a
    horizontal swipe turns the page instead of panning. */
export function isAtFitWidth(effectiveScale: number, fitWidthScale: number, fitMode: string): boolean {
  return fitMode !== "custom" || effectiveScale <= fitWidthScale * 1.05;
}
