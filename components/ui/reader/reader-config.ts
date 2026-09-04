/* Shared reader preference model: theme palette, versioned localStorage
   keys, and safe read helpers (including migration from the pre-v2 keys). */

export type ReaderTheme = "light" | "dark";
export type ReaderFitMode = "width" | "page" | "custom";
export type ReaderViewMode = "single" | "scroll";
/** Single-page turn animation. "auto" follows the OS reduced-motion setting. */
export type ReaderPageTransition = "auto" | "off";

/** Reader palette. Dark page colors are fed to pdf.js's `pageColors`
    (its official high-contrast recolor API) — never a CSS invert filter. */
export const READER_THEMES = {
  light: {
    viewerBackground: "#E5E7EB",
    pageBackground: "#FFFFFF",
    pageForeground: "#111827",
  },
  dark: {
    viewerBackground: "#090E17",
    pageBackground: "#151B26",
    pageForeground: "#E6EAF0",
  },
} as const satisfies Record<ReaderTheme, Record<string, string>>;

/* Global preferences (theme / view / fit / zoom) are shared across books;
   rotation and reading position are per book. */
export const READER_KEYS = {
  theme: "ebook:reader:v2:theme",
  viewMode: "ebook:reader:v2:viewMode",
  fitMode: "ebook:reader:v2:fitMode",
  zoom: "ebook:reader:v2:zoom",
  rotation: (bookId: string) => `ebook:reader:v2:rotation:${bookId}`,
  nativeWidth: (bookId: string) => `ebook:reader:v2:pw:${bookId}`,
  pageTransition: "ebook:reader:v2:pageTransition",
  /** Per-book exact reading position `{ p, pct }`. */
  position: (bookId: string) => `ebook:pos:${bookId}`,
  /** Per-book bookmarks (page numbers). */
  bookmarks: (bookId: string) => `ebook:bm:${bookId}`,
  /** Per-book page-1 aspect ratio, so the loading placeholder is the right shape. */
  aspect: (bookId: string) => `ebook:ar:${bookId}`,
} as const;

export const lsGet = (k: string): string | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(k) : null;
  } catch {
    return null;
  }
};

export const lsSet = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
};

/** v2 value first, then the legacy key ("sepia" collapses into "light" —
    the reader now has exactly two modes). */
export function loadReaderTheme(): ReaderTheme {
  const v2 = lsGet(READER_KEYS.theme);
  if (v2 === "light" || v2 === "dark") return v2;
  const legacy = lsGet("ebook:theme");
  if (legacy === "dark") return "dark";
  return "light";
}

export function loadReaderViewMode(): ReaderViewMode {
  const v = lsGet(READER_KEYS.viewMode) ?? lsGet("ebook:viewMode");
  return v === "single" || v === "scroll" ? v : "scroll";
}

export function loadReaderFitMode(): ReaderFitMode {
  const v = lsGet(READER_KEYS.fitMode) ?? lsGet("ebook:fitMode");
  return v === "width" || v === "page" || v === "custom" ? v : "width";
}

export function loadReaderZoom(): number {
  const v = parseFloat(lsGet(READER_KEYS.zoom) ?? "");
  return Number.isFinite(v) && v >= 0.5 && v <= 3 ? v : 1;
}

export function loadReaderRotation(bookId: string): number {
  const v = parseInt(lsGet(READER_KEYS.rotation(bookId)) ?? "", 10);
  return v === 90 || v === 180 || v === 270 ? v : 0;
}

export function loadNativePageWidth(bookId: string): number | undefined {
  const v = parseFloat(lsGet(READER_KEYS.nativeWidth(bookId)) ?? "");
  return Number.isFinite(v) && v > 40 && v < 20000 ? v : undefined;
}

export function loadReaderPageTransition(): ReaderPageTransition {
  return lsGet(READER_KEYS.pageTransition) === "off" ? "off" : "auto";
}

export function loadBookmarks(bookId: string): number[] {
  try {
    const arr = JSON.parse(lsGet(READER_KEYS.bookmarks(bookId)) ?? "[]");
    return Array.isArray(arr)
      ? Array.from(new Set(arr.filter((n): n is number => typeof n === "number" && n >= 1))).sort((a, b) => a - b)
      : [];
  } catch {
    return [];
  }
}

export function loadAspectRatio(bookId: string): number | undefined {
  const ar = parseFloat(lsGet(READER_KEYS.aspect(bookId)) ?? "");
  return Number.isFinite(ar) && ar > 0.2 && ar < 5 ? ar : undefined;
}
