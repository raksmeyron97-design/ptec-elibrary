/* Pure page-geometry maths for the PDF reader.

   Everything here is a function of measured numbers (viewport size, page 1's
   intrinsic size, the user's fit/zoom/rotation choices) and nothing else, so
   the width a page renders at — and therefore how many canvases mount and how
   much memory they take — is unit-testable without a DOM. */

export type FitMode = "width" | "page" | "custom";
export type ViewMode = "single" | "scroll";

/** Horizontal/vertical breathing room inside the viewport. */
export const PAD = 32;
/** Cap page width on very wide screens: a 2,000 px line of body text is not
    readable, and the canvas behind it is four times the memory of a 1,000 px one. */
export const MAX_SCROLL_W = 1000;
/** Vertical padding around each virtualised scroll row. */
export const SCROLL_PAGE_Y = 24;
/** A4 height/width — the placeholder aspect until page 1 has been measured. */
export const DEFAULT_ASPECT = Math.SQRT2;
/** Cap canvas density: a DPR-3 phone would otherwise raster 9× the pixels. */
export const MAX_RENDER_DPR = 2;
/** Smallest page width we will ever lay out. */
const MIN_PAGE_W = 64;

export type GeometryInput = {
  containerWidth?: number;
  containerHeight?: number;
  /** Intrinsic height/width of page 1 at its own /Rotate. */
  aspectRatio?: number;
  /** Page 1 width at scale 1 in CSS px (makes "100%" mean actual size). */
  nativeWidth?: number;
  /** User rotation on top of the page's inherent rotation (0/90/180/270). */
  rotation: number;
  fitMode: FitMode;
  viewMode: ViewMode;
  zoomScale: number;
};

export type Geometry = {
  /** Rotation-adjusted aspect (height / width as rendered). */
  effAspect: number;
  /** Rotation-adjusted native width, when page 1 has been measured. */
  nativeWRot?: number;
  /** Rendered page width in CSS px, or undefined until the viewport is measured. */
  pageWidth?: number;
  /** Rendered page height estimate (rows use this before a page mounts). */
  estHeight: number;
  /** Height of one virtualised scroll row (page + vertical padding). */
  rowHeight: number;
  /** Actual zoom relative to the page's real size (1 = 100%). */
  effectiveScale: number;
  /** The scale fit-width would produce — "not zoomed in" threshold for gestures. */
  fitWidthScale: number;
};

export function computeGeometry(input: GeometryInput): Geometry {
  const {
    containerWidth,
    containerHeight,
    aspectRatio,
    nativeWidth,
    rotation,
    fitMode,
    viewMode,
    zoomScale,
  } = input;

  const rotatedQuarter = rotation % 180 !== 0;
  const intrinsicAspect = aspectRatio ?? DEFAULT_ASPECT;
  const effAspect = rotatedQuarter ? 1 / intrinsicAspect : intrinsicAspect;
  const nativeWRot = nativeWidth
    ? rotatedQuarter
      ? nativeWidth * intrinsicAspect
      : nativeWidth
    : undefined;

  let pageWidth: number | undefined;
  let fitWidthPx: number | undefined;
  if (containerWidth) {
    const availW = containerWidth - PAD;
    fitWidthPx = viewMode === "scroll" ? Math.min(availW, MAX_SCROLL_W) : availW;
    if (fitMode === "custom") {
      // 100% = the page's actual size; fall back to fit-width until page 1
      // has been measured (first ever open of a book).
      const base = nativeWRot ?? Math.min(availW, MAX_SCROLL_W);
      pageWidth = Math.max(MIN_PAGE_W, Math.round(base * zoomScale));
    } else if (fitMode === "page" && containerHeight) {
      // Fit-to-page: pick the width so the WHOLE page fits the viewport.
      pageWidth = Math.max(
        MIN_PAGE_W,
        Math.floor(Math.min(availW, (containerHeight - PAD) / effAspect)),
      );
    } else {
      pageWidth = Math.max(MIN_PAGE_W, Math.round(fitWidthPx));
    }
  }

  const effectiveScale = pageWidth && nativeWRot ? pageWidth / nativeWRot : zoomScale;
  const fitWidthScale = fitWidthPx && nativeWRot ? fitWidthPx / nativeWRot : 1;
  const estHeight = pageWidth ? Math.round(pageWidth * effAspect) : 600;

  return {
    effAspect,
    nativeWRot,
    pageWidth,
    estHeight,
    rowHeight: estHeight + SCROLL_PAGE_Y,
    effectiveScale,
    fitWidthScale,
  };
}

/** Rotation the <Page> receives: undefined means "the page's own". */
export function pageRotateProp(inherentRotate: number, rotation: number): number | undefined {
  return rotation === 0 ? undefined : (inherentRotate + rotation) % 360;
}

export const clampDpr = (dpr: number): number =>
  Math.max(1, Math.min(MAX_RENDER_DPR, dpr || 1));
