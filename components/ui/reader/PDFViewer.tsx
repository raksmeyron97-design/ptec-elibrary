"use client";

import {
  useState,
  useTransition,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
} from "react";
import type { ComponentProps } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  Bookmark,
  Check,
  LayoutGrid,
  List,
  MoreHorizontal,
  Moon,
  PanelLeft,
  PenLine,
  RotateCw,
  Search as SearchIcon,
  Sun,
} from "lucide-react";
import Icon from "@/components/ui/core/Icon";
import { useTranslations, useLocale } from "next-intl";
import { saveReadingProgress } from "@/app/actions/reading-progress";
import { incrementDownloadCount } from "@/app/actions/download";
import { PTEC } from "@/lib/ptec";
import {
  getBookAnnotations,
  addAnnotation,
  deleteAnnotation,
  type Annotation,
} from "@/app/actions/book-annotations";
import {
  nfc,
  itemStrings,
  findPageMatches,
  renderItemHtml,
  type ItemDecoration,
  type MatchSpan,
} from "@/lib/reader/search-matches";
import { clampScale, stepZoom } from "@/lib/reader/zoom";
import {
  READER_KEYS,
  READER_THEMES,
  loadNativePageWidth,
  loadReaderFitMode,
  loadReaderRotation,
  loadReaderTheme,
  loadReaderViewMode,
  loadReaderZoom,
  lsGet,
  lsSet,
  type ReaderFitMode,
  type ReaderTheme,
  type ReaderViewMode,
} from "./reader-config";
import ThemeControl from "./ThemeControl";
import ZoomControl from "./ZoomControl";
import ThumbnailsPanel from "./ThumbnailsPanel";
import { useAutoHideControls } from "./useAutoHideControls";

/* ──────────────────────────────────────────────────────────────────
   Worker — SELF-HOSTED for true offline support.
   Run `node scripts/copy-pdf-assets.mjs` first (see PDF-OFFLINE-SETUP.md):
   it copies the worker + cmaps + standard_fonts from the SAME pdfjs-dist
   version react-pdf uses into /public/pdf, so versions always match and
   nothing is fetched from a CDN.
   ── Before you run the copy script, you can temporarily use the CDN:
   // pdfjs.GlobalWorkerOptions.workerSrc =
   //   `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
─────────────────────────────────────────────────────────────────── */
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";

/* ──────────────────────────────────────────────────────────────────
   Types
─────────────────────────────────────────────────────────────────── */
// Derive the proxy type from react-pdf itself so it always matches the
// pdfjs-dist version react-pdf bundles (avoids the dual-package mismatch
// you get from importing PDFDocumentProxy straight out of "pdfjs-dist").
type PdfDocumentProxy = Parameters<
  NonNullable<ComponentProps<typeof Document>["onLoadSuccess"]>
>[0];

type PDFViewerProps = {
  title: string;
  pdfUrl?: string | null;
  bookId: string;
  totalPages?: number;
  initialProgressPct?: number;
  initialMaxProgressPct?: number;
  /** Set false to hide the download button for protected books. Default true. */
  allowDownload?: boolean;
  isLoggedIn?: boolean;
};

type PanelTab = "pages" | "outline" | "bookmarks" | "search" | "annotations" | null;
type PdfErrorKind = "missing" | "permission" | "invalid" | "network" | "unknown";
type ReaderEventType =
  | "pdf_load_error"
  | "pdf_load_slow"
  | "pdf_render_error"
  | "broken_file_report";

type SelectionPopup = {
  text: string;
  page: number;
  x: number;
  y: number;
} | null;
type OutlineNode = {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
};
/** One row in the search-results list: a page with ≥1 match. */
type PageHit = { page: number; count: number; snippet: string; firstMatch: number };
/** A page's matches, each tagged with its global (document-wide) index. */
type IndexedPageMatch = { spans: MatchSpan[]; idx: number };

type PageColors = { background: string; foreground: string };

/* ──────────────────────────────────────────────────────────────────
   Constants
─────────────────────────────────────────────────────────────────── */
const PAD = 32; // horizontal/vertical breathing room inside the viewport
const MAX_SCROLL_W = 1000; // cap page width on very wide screens for readability
const SCROLL_PAGE_Y = 24; // vertical padding around each virtualized scroll page
const VIRTUAL_OVERSCAN = 2; // pages kept before/after the visible viewport
const MAX_RENDER_DPR = 2; // cap canvas density to avoid huge mobile/retina canvases
const AUTOSAVE_MS = 1500;
const MAX_MATCHES = 500; // stop in-doc search here to keep low-end phones responsive
const DEFAULT_ASPECT = Math.SQRT2; // A4 height/width — placeholder until page 1 is measured

const KH_DIGITS = "០១២៣៤៥៦៧៨៩";
/** Render digits in Khmer numerals when the active locale is Khmer. */
function localizeDigits(value: number | string, locale: string): string {
  const s = String(value);
  return locale === "km" ? s.replace(/[0-9]/g, (d) => KH_DIGITS[+d]) : s;
}

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

/** Row style for overflow (⋯) menus. */
const MENU_ROW =
  "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-default disabled:opacity-50";

const clamp = (min: number, max: number, v: number) =>
  Math.max(min, Math.min(max, v));

const dist = (a: Touch, b: Touch) =>
  Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

function classifyPdfError(error: Error): PdfErrorKind {
  const message = error.message.toLowerCase();
  if (message.includes("404") || message.includes("not found") || message.includes("missing")) return "missing";
  if (message.includes("401") || message.includes("403") || message.includes("unauthorized") || message.includes("forbidden")) return "permission";
  if (message.includes("invalid") || message.includes("corrupt") || message.includes("password")) return "invalid";
  if (message.includes("network") || message.includes("failed to fetch")) return "network";
  return "unknown";
}

function safePdfPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://library.ptec.edu.kh";
    return new URL(raw, base).pathname;
  } catch {
    return raw.split("?")[0]?.slice(0, 160) || null;
  }
}

function sendReaderEvent(payload: {
  type: ReaderEventType;
  bookId: string;
  file: string | null;
  page?: number;
  message?: string;
  durationMs?: number;
}) {
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/reader-events",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
    void fetch("/api/reader-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    /* logging must never interrupt reading */
  }
}

/* ──────────────────────────────────────────────────────────────────
   Module-scope sub-components (stable identity → no remount on re-render)
─────────────────────────────────────────────────────────────────── */
const ToolButton = memo(function ToolButton({
  onClick,
  disabled,
  active,
  label,
  className,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cx(
        "inline-flex items-center justify-center rounded-md transition disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
        active
          ? "bg-cyan-500/20 text-cyan-300"
          : "text-slate-400 hover:bg-bg-surface/10 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
});

const OutlineTree = memo(function OutlineTree({
  items,
  onSelect,
  depth = 0,
}: {
  items: OutlineNode[];
  onSelect: (dest: OutlineNode["dest"]) => void;
  depth?: number;
}) {
  return (
    <ul className={cx("space-y-0.5", depth > 0 && "ml-2 border-l border-white/10 pl-2")}>
      {items.map((it, i) => {
        const itemKey =
          typeof it.dest === "string"
            ? it.dest
            : `${it.title || "untitled"}-${depth}-${i}`;
        return (
          <li key={itemKey}>
            <button
              type="button"
              onClick={() => onSelect(it.dest)}
              className="block w-full truncate rounded px-2 py-1 text-left text-xs text-slate-200 transition hover:bg-white/10"
              title={it.title}
            >
              {it.title || "—"}
            </button>
            {it.items?.length ? (
              <OutlineTree items={it.items} onSelect={onSelect} depth={depth + 1} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
});

/* One page inside continuous-scroll mode. The parent virtualizer only mounts a
   small moving window, so every mounted page is intentionally rendered.
   Dark mode arrives via pdf.js's own pageColors recolor API (passed through
   react-pdf), NOT a CSS invert filter — images keep usable appearance and
   highlights/links/text selection are untouched. */
const ScrollPage = memo(function ScrollPage({
  pageNumber,
  width,
  estHeight,
  rotate,
  pageColors,
  pageFrameClass,
  placeholderClass,
  devicePixelRatio,
  customTextRenderer,
  onRenderError,
}: {
  pageNumber: number;
  width?: number;
  estHeight: number;
  rotate?: number;
  pageColors?: PageColors;
  pageFrameClass: string;
  placeholderClass: string;
  devicePixelRatio: number;
  customTextRenderer?: (item: { str: string; itemIndex: number }) => string;
  onRenderError?: (error: Error) => void;
}) {
  return (
    <div
      data-page={pageNumber}
      className="w-full px-1"
      style={{
        boxSizing: "border-box",
        height: estHeight + SCROLL_PAGE_Y,
        paddingBottom: SCROLL_PAGE_Y / 2,
        paddingTop: SCROLL_PAGE_Y / 2,
      }}
    >
      <div className={pageFrameClass}>
        <Page
          pageNumber={pageNumber}
          width={width}
          rotate={rotate}
          pageColors={pageColors}
          devicePixelRatio={devicePixelRatio}
          renderTextLayer
          renderAnnotationLayer
          customTextRenderer={customTextRenderer}
          onRenderError={onRenderError}
          loading={
            <div
              style={{ height: estHeight, width: width ?? "min(100%, 720px)" }}
              className={cx("animate-pulse rounded", placeholderClass)}
            />
          }
        />
      </div>
    </div>
  );
});

/* Offline-first source: if the PDF already lives in the browser Cache
   Storage (e.g. saved by your OfflineSaveButton / service worker), read it
   from there so reading works with zero network. Falls back to the URL.
   `caches.match` (no cache name) searches every cache, so this works no
   matter which cache name your SW used. */
function useResolvedPdfFile(pdfUrl: string | null | undefined) {
  const [file, setFile] = useState<string | null>(pdfUrl ?? null);
  const [fromCache, setFromCache] = useState(false);
  const [prevUrl, setPrevUrl] = useState(pdfUrl);

  if (pdfUrl !== prevUrl) {
    setPrevUrl(pdfUrl);
    setFile(pdfUrl ?? null);
    setFromCache(false);
  }

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    if (!pdfUrl || typeof window === "undefined" || !("caches" in window))
      return;
    const abs = new URL(pdfUrl, window.location.origin).href;
    caches
      .match(abs)
      .then(async (res) => {
        if (cancelled || !res) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setFile(objectUrl);
          setFromCache(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdfUrl]);
  return { file, fromCache };
}


/* ──────────────────────────────────────────────────────────────────
   Main component
─────────────────────────────────────────────────────────────────── */
export default function PDFViewer({
  title,
  pdfUrl,
  bookId,
  totalPages = 0,
  initialProgressPct = 0,
  initialMaxProgressPct = 0,
  allowDownload = true,
  isLoggedIn = false,
}: PDFViewerProps) {
  /* ── i18n (strings follow the site locale via next-intl) ──────── */
  const t = useTranslations("reader");
  const locale = useLocale();
  const fmtNum = useCallback(
    (n: number | string) => localizeDigits(n, locale),
    [locale],
  );

  /* ── Offline-first source + cMap options (Khmer / CID fonts) ──── */
  const { file: resolvedFile, fromCache } = useResolvedPdfFile(pdfUrl);
  const [isOffline, setIsOffline] = useState(false);
  // Memoised so react-pdf doesn't reload the document on every render.
  // Served from /public/pdf so they work offline (see copy script).
  const pdfOptions = useMemo(
    () => ({
      cMapUrl: "/pdf/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdf/standard_fonts/",
      // Forces pdf.js onto its non-eval PostScript path so the CSP can drop
      // 'unsafe-eval' (see docs/SECURITY-HEADERS.md). Only affects rare PDFs
      // with Type 4 PostScript functions, and only their first render.
      isEvalSupported: false,
      disableAutoFetch: true,
      disableStream: false,
      rangeChunkSize: 65536,
    }),
    [],
  );

  /* ── Core state ─────────────────────────────────────────────── */
  const [numPages, setNumPages] = useState<number>(totalPages);
  const [currentPage, setCurrentPage] = useState(
    totalPages > 0
      ? clamp(1, totalPages, Math.round((initialProgressPct / 100) * totalPages))
      : 1,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [, startTransition] = useTransition();
  const [docKey, setDocKey] = useState(0); // bump to force a reload on retry
  const [loadErrorKind, setLoadErrorKind] = useState<PdfErrorKind | null>(null);

  const [maxProgressPct, setMaxProgressPct] = useState(initialMaxProgressPct || initialProgressPct || 0);

  /* ── Layout measurement ─────────────────────────────────────── */
  const [containerWidth, setContainerWidth] = useState<number>();
  const [containerHeight, setContainerHeight] = useState<number>();
  // height / width of page 1 — seeded from the last visit so the loading
  // placeholder reserves the right height and page 1 lands without a shift
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(() => {
    const ar = parseFloat(lsGet(`ebook:ar:${bookId}`) ?? "");
    return Number.isFinite(ar) && ar > 0.2 && ar < 5 ? ar : undefined;
  });
  // page 1 width at scale 1 (CSS px) — makes "100%" mean actual size
  const [nativeWidth, setNativeWidth] = useState<number | undefined>(() =>
    loadNativePageWidth(bookId),
  );
  const [inherentRotate, setInherentRotate] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [renderPixelRatio, setRenderPixelRatio] = useState(1);

  /* ── Reading preferences (persisted, v2 keys w/ legacy fallback) ──
     Lazy-initialized straight from localStorage: this component only ever
     mounts client-side (ssr:false wrapper), so there is no hydration pass,
     and reading in an effect instead lets the persist-effects clobber the
     stored value under StrictMode's double-run.
     Theme / view / fit / zoom are global reader preferences; rotation and
     reading position are per book. */
  const [viewMode, setViewMode] = useState<ReaderViewMode>(loadReaderViewMode);
  const [fitMode, setFitMode] = useState<ReaderFitMode>(loadReaderFitMode);
  const [zoomScale, setZoomScale] = useState<number>(loadReaderZoom);
  const [theme, setTheme] = useState<ReaderTheme>(loadReaderTheme);
  const [rotation, setRotation] = useState<number>(() => loadReaderRotation(bookId));

  /* ── Navigation / save status ───────────────────────────────── */
  const [pageInputValue, setPageInputValue] = useState(String(currentPage));
  const [isPageInputFocused, setIsPageInputFocused] = useState(false);

  /* ── Overflow menus ─────────────────────────────────────────── */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  /* ── Panel (pages / outline / bookmarks / search / annotations) ── */
  const [panelTab, setPanelTab] = useState<PanelTab>(null);
  const lastPanelTabRef = useRef<Exclude<PanelTab, null>>("outline");
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentProxy | null>(null);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [bookmarks, setBookmarks] = useState<number[]>(() => {
    try {
      const arr = JSON.parse(lsGet(`ebook:bm:${bookId}`) ?? "[]");
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageHits, setPageHits] = useState<PageHit[]>([]);
  const [matchPages, setMatchPages] = useState<number[]>([]); // global match idx → page
  const [matchesByPage, setMatchesByPage] = useState<Map<number, IndexedPageMatch[]>>(
    () => new Map(),
  );
  const [currentMatch, setCurrentMatch] = useState(-1);
  const [searching, setSearching] = useState(false);
  const searchSeqRef = useRef(0); // bump to cancel an in-flight search
  const pageTextCacheRef = useRef<Map<number, string[]>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);

  /* ── Annotations ────────────────────────────────────────────── */
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopup>(null);
  const [annotationNote, setAnnotationNote] = useState("");
  const [annotationColor, setAnnotationColor] = useState<"yellow" | "green" | "blue" | "pink">("yellow");
  const [savingAnnotation, setSavingAnnotation] = useState(false);

  /* ── Refs ───────────────────────────────────────────────────── */
  const rootRef = useRef<HTMLDivElement>(null); // whole reader (toolbar + doc)
  const docAreaRef = useRef<HTMLDivElement>(null); // touch target + fullscreen box
  const containerRef = useRef<HTMLDivElement>(null); // scroll viewport (measured)
  const gestureLayerRef = useRef<HTMLDivElement>(null); // pinch preview transform target
  const pdfRef = useRef<PdfDocumentProxy | null>(null);
  const programmaticScroll = useRef(false);
  const progScrollTimer = useRef<number | undefined>(undefined);
  const scrollRafRef = useRef<number | null>(null);
  const initialScrollDoneRef = useRef(false);
  const loadStartedAtRef = useRef(0);
  // A persisted aspect ratio is only an estimate — still measure page 1 once.
  const arMeasuredRef = useRef(false);
  // Exact page to resume at (from localStorage), applied on document load.
  const pendingRestoreRef = useRef<number | null>(null);

  // refs mirroring state for stable native touch handlers
  const viewModeRef = useRef(viewMode);
  const fitModeRef = useRef(fitMode);
  const currentPageRef = useRef(currentPage);
  const numPagesRef = useRef(numPages);
  const navigateRef = useRef<(p: number) => void>(() => {});
  const progressRef = useRef(0);
  const [lastSaved, setLastSaved] = useState(initialProgressPct);
  const lastSavedRef = useRef(initialProgressPct);
  useEffect(() => { lastSavedRef.current = lastSaved; }, [lastSaved]);

  const reportReaderEvent = useCallback(
    (
      type: ReaderEventType,
      details: { message?: string; page?: number; durationMs?: number } = {},
    ) => {
      sendReaderEvent({
        type,
        bookId,
        file: safePdfPath(pdfUrl),
        page: details.page ?? currentPageRef.current,
        message: details.message?.slice(0, 240),
        durationMs: details.durationMs,
      });
    },
    [bookId, pdfUrl],
  );

  /* ── Derived ────────────────────────────────────────────────── */
  const progressPct =
    numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0;
  const isSaved = progressPct === lastSaved;
  const isBookmarked = bookmarks.includes(currentPage);

  useEffect(() => void (viewModeRef.current = viewMode), [viewMode]);
  useEffect(() => void (fitModeRef.current = fitMode), [fitMode]);
  useEffect(() => void (currentPageRef.current = currentPage), [currentPage]);
  useEffect(() => void (numPagesRef.current = numPages), [numPages]);
  useEffect(() => void (progressRef.current = progressPct), [progressPct]);

  const markMaxProgressForPage = useCallback((page: number, pages = numPagesRef.current) => {
    if (!pages) return;
    const pct = Math.round((page / pages) * 100);
    setMaxProgressPct((prev) => Math.max(prev, pct));
  }, []);

  /* ── Theme (pdf.js pageColors — no CSS invert filter) ─────────── */
  const themeColors = READER_THEMES[theme];
  const pageColors = useMemo<PageColors | undefined>(
    () =>
      theme === "dark"
        ? {
            background: READER_THEMES.dark.pageBackground,
            foreground: READER_THEMES.dark.pageForeground,
          }
        : undefined,
    [theme],
  );
  const pageFrameClass = cx(
    "relative mx-auto w-max",
    theme === "dark" ? "shadow-xl shadow-black/60 ring-1 ring-white/10" : "shadow-lg",
  );
  const placeholderClass = theme === "dark" ? "bg-white/10" : "bg-black/10";

  /* ── Page geometry (rotation-aware) ─────────────────────────────
     `width` on react-pdf's <Page> is the post-rotation rendered width, so
     all layout math uses the rotation-adjusted aspect ratio. The intrinsic
     aspect (h/w at the page's inherent rotation) is measured from page 1. */
  const rotatedQuarter = rotation % 180 !== 0;
  const intrinsicAspect = aspectRatio ?? DEFAULT_ASPECT;
  const effAspect = rotatedQuarter ? 1 / intrinsicAspect : intrinsicAspect;
  const nativeWRot = nativeWidth
    ? rotatedQuarter
      ? nativeWidth * intrinsicAspect
      : nativeWidth
    : undefined;
  // Extra user rotation is applied on top of the page's inherent /Rotate.
  const pageRotate = rotation === 0 ? undefined : (inherentRotate + rotation) % 360;

  /* ── Page width (fit modes + true actual-size zoom) ───────────── */
  const pageWidth = useMemo(() => {
    if (!containerWidth) return undefined;
    const availW = containerWidth - PAD;
    if (fitMode === "custom") {
      // 100% = the page's actual size; fall back to fit-width until page 1
      // has been measured (first ever open of a book).
      const base = nativeWRot ?? Math.min(availW, MAX_SCROLL_W);
      return Math.max(64, Math.round(base * zoomScale));
    }
    if (fitMode === "page" && containerHeight) {
      // fit-to-page: pick the width so the *whole* page fits the viewport
      return Math.max(
        64,
        Math.floor(Math.min(availW, (containerHeight - PAD) / effAspect)),
      );
    }
    const capped = viewMode === "scroll" ? Math.min(availW, MAX_SCROLL_W) : availW;
    return Math.max(64, Math.round(capped));
  }, [containerWidth, containerHeight, effAspect, fitMode, nativeWRot, viewMode, zoomScale]);

  const effectiveScale = pageWidth && nativeWRot ? pageWidth / nativeWRot : zoomScale;
  const zoomPercent = Math.round(effectiveScale * 100);
  const effScaleRef = useRef(effectiveScale);
  useEffect(() => void (effScaleRef.current = effectiveScale), [effectiveScale]);
  // Effective scale of fit-width — the gesture handlers treat anything near
  // this as "not zoomed in" (swipe allowed, double-tap zooms in).
  const fitWidthScaleRef = useRef(1);
  useEffect(() => {
    if (!containerWidth || !nativeWRot) return;
    const availW = containerWidth - PAD;
    fitWidthScaleRef.current =
      (viewMode === "scroll" ? Math.min(availW, MAX_SCROLL_W) : availW) / nativeWRot;
  }, [containerWidth, nativeWRot, viewMode]);

  const estHeight = pageWidth ? Math.round(pageWidth * effAspect) : 600;
  const scrollRowHeight = estHeight + SCROLL_PAGE_Y;
  const virtualRange = useMemo(() => {
    if (viewMode !== "scroll" || !numPages || !containerHeight || !scrollRowHeight) {
      return { start: 1, end: Math.min(numPages || 1, 1), before: 0, after: 0 };
    }
    const firstVisible = Math.floor(scrollTop / scrollRowHeight) + 1;
    const visibleCount = Math.max(1, Math.ceil(containerHeight / scrollRowHeight));
    const start = clamp(1, numPages, firstVisible - VIRTUAL_OVERSCAN);
    const end = clamp(1, numPages, firstVisible + visibleCount + VIRTUAL_OVERSCAN);
    return {
      start,
      end,
      before: (start - 1) * scrollRowHeight,
      after: (numPages - end) * scrollRowHeight,
    };
  }, [containerHeight, numPages, scrollRowHeight, scrollTop, viewMode]);
  const visiblePages = useMemo(() => {
    if (viewMode !== "scroll" || !numPages) return [];
    return Array.from(
      { length: Math.max(0, virtualRange.end - virtualRange.start + 1) },
      (_, i) => virtualRange.start + i,
    );
  }, [numPages, virtualRange.end, virtualRange.start, viewMode]);

  /* ── Polite status announcements (zoom / theme / rotation) ────── */
  const [statusMessage, setStatusMessage] = useState("");
  const statusTimerRef = useRef<number | undefined>(undefined);
  const announceStatus = useCallback((msg: string) => {
    window.clearTimeout(statusTimerRef.current);
    // small debounce so rapid wheel/pinch steps announce once, not per step
    statusTimerRef.current = window.setTimeout(() => setStatusMessage(msg), 250);
  }, []);
  useEffect(() => () => window.clearTimeout(statusTimerRef.current), []);

  /* ── Zoom actions ───────────────────────────────────────────────
     Buttons/wheel step through ZOOM_LEVELS presets; the focal point (the
     content point that must stay put) is recorded here and consumed by the
     scroll-adjustment effect below once the new width has committed. */
  const zoomFocalRef = useRef<{ x: number; y: number } | null>(null);
  const applyCustomZoom = useCallback(
    (scale: number, focal?: { x: number; y: number }) => {
      const clamped = clampScale(scale);
      zoomFocalRef.current = focal ?? null;
      setFitMode("custom");
      setZoomScale(clamped);
      announceStatus(t("zoomAnnounce", { percent: fmtNum(Math.round(clamped * 100)) }));
    },
    [announceStatus, fmtNum, t],
  );
  const applyFitMode = useCallback(
    (mode: "width" | "page") => {
      zoomFocalRef.current = null;
      setFitMode(mode);
      announceStatus(mode === "width" ? t("fitWidth") : t("fitPage"));
    },
    [announceStatus, t],
  );
  const zoomIn = useCallback(
    () => applyCustomZoom(stepZoom(effScaleRef.current, 1)),
    [applyCustomZoom],
  );
  const zoomOut = useCallback(
    () => applyCustomZoom(stepZoom(effScaleRef.current, -1)),
    [applyCustomZoom],
  );
  const resetZoom = useCallback(() => applyCustomZoom(1), [applyCustomZoom]);
  // stable refs for the native touch/wheel handlers
  const commitZoomRef = useRef(applyCustomZoom);
  useEffect(() => void (commitZoomRef.current = applyCustomZoom), [applyCustomZoom]);
  const applyFitRef = useRef(applyFitMode);
  useEffect(() => void (applyFitRef.current = applyFitMode), [applyFitMode]);

  const changeTheme = useCallback(
    (next: ReaderTheme) => {
      setTheme(next);
      announceStatus(t(next === "dark" ? "themeDarkEnabled" : "themeLightEnabled"));
    },
    [announceStatus, t],
  );

  const rotateClockwise = useCallback(() => {
    setRotation((r) => (r + 90) % 360);
  }, []);
  const rotationAnnouncedRef = useRef(rotation);
  useEffect(() => {
    if (rotationAnnouncedRef.current === rotation) return;
    rotationAnnouncedRef.current = rotation;
    announceStatus(t("rotationAnnounce", { degrees: fmtNum(rotation) }));
    // The aspect swap changes every virtual row height, so re-anchor the
    // viewport on the page being read (next frame, after heights commit).
    requestAnimationFrame(() => navigateRef.current(currentPageRef.current));
  }, [rotation, announceStatus, fmtNum, t]);

  /* ── Exact-page resume (applied on document load) ──────────────
     The server stores a rounded percentage (≈5-page error on a 500-page
     book) and knows nothing when logged out or offline; this device's exact
     page wins unless the server % has clearly moved away (book was read
     further on another device). The page is only APPLIED on document load,
     where the real page count is known — the `pages` column is unreliable
     metadata. */
  useEffect(() => {
    const pos = lsGet(`ebook:pos:${bookId}`);
    if (pos) {
      try {
        const saved = JSON.parse(pos) as { p?: number; pct?: number };
        const p = typeof saved.p === "number" ? Math.floor(saved.p) : 0;
        const pct = typeof saved.pct === "number" ? saved.pct : 0;
        const useLocal =
          p >= 1 &&
          (!isLoggedIn ||
            initialProgressPct === 0 ||
            Math.abs(pct - initialProgressPct) <= 2);
        if (useLocal) pendingRestoreRef.current = p;
      } catch {
        /* ignore */
      }
    }
  }, [bookId, initialProgressPct, isLoggedIn]);

  /* ── Persist the exact page (debounced) for next-visit resume ─── */
  useEffect(() => {
    if (!numPages || !currentPage) return;
    const id = window.setTimeout(() => {
      lsSet(
        `ebook:pos:${bookId}`,
        JSON.stringify({
          p: currentPage,
          pct: Math.round((currentPage / numPages) * 100),
        }),
      );
    }, 400);
    return () => window.clearTimeout(id);
  }, [currentPage, numPages, bookId]);

  useEffect(() => lsSet(READER_KEYS.viewMode, viewMode), [viewMode]);
  useEffect(() => lsSet(READER_KEYS.fitMode, fitMode), [fitMode]);
  useEffect(() => lsSet(READER_KEYS.theme, theme), [theme]);
  useEffect(() => lsSet(READER_KEYS.zoom, String(zoomScale)), [zoomScale]);
  useEffect(() => lsSet(READER_KEYS.rotation(bookId), String(rotation)), [rotation, bookId]);
  useEffect(
    () => lsSet(`ebook:bm:${bookId}`, JSON.stringify(bookmarks)),
    [bookmarks, bookId],
  );

  useEffect(() => {
    loadStartedAtRef.current = performance.now();
    pageTextCacheRef.current = new Map();
  }, [docKey, resolvedFile]);

  /* ── Load annotations on mount (logged-in users only) ──────── */
  useEffect(() => {
    if (!isLoggedIn) return;
    getBookAnnotations(bookId).then(setAnnotations);
  }, [bookId, isLoggedIn]);

  /* ── Text selection → annotation popup ─────────────────────── */
  useEffect(() => {
    const el = docAreaRef.current;
    if (!el || !isLoggedIn) return;

    const onMouseUp = (e: MouseEvent) => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!text || text.length < 3) {
        setSelectionPopup(null);
        return;
      }

      // Walk up from the anchor node to find data-page or data-page-number
      let node: Node | null = sel?.anchorNode ?? null;
      let page: number | null = null;
      while (node) {
        const el2 = node instanceof Element ? node : node.parentElement;
        if (!el2) break;
        const p =
          el2.getAttribute("data-page-number") ||
          el2.getAttribute("data-page");
        if (p) { page = parseInt(p, 10); break; }
        node = el2.parentElement;
      }

      if (!page) page = currentPageRef.current;

      const rect = el.getBoundingClientRect();
      setSelectionPopup({
        text,
        page,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setAnnotationNote("");
      setAnnotationColor("yellow");
    };

    el.addEventListener("mouseup", onMouseUp);
    return () => el.removeEventListener("mouseup", onMouseUp);
  }, [isLoggedIn]);

  /* ── Measure the scroll viewport (ResizeObserver also catches
        fullscreen + panel open/close, not just window resize) ──── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      setContainerWidth(el.clientWidth);
      setContainerHeight(el.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const update = () => {
      setRenderPixelRatio(clamp(1, MAX_RENDER_DPR, window.devicePixelRatio || 1));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  /* ── Zoom focal point (keep the interaction point stationary) ───
     When the committed page width changes, adjust the scroll offsets so the
     recorded focal point (button = viewport centre, wheel = pointer, pinch =
     finger midpoint, double-tap = tap position) stays put. Also clears any
     live pinch-preview CSS transform now that the real size has landed. */
  const prevPageWidthRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const el = containerRef.current;
    const prev = prevPageWidthRef.current;
    prevPageWidthRef.current = pageWidth;
    const layer = gestureLayerRef.current;
    if (layer) {
      layer.style.transform = "";
      layer.style.transformOrigin = "";
    }
    if (!el || !prev || !pageWidth || prev === pageWidth) return;
    const ratio = pageWidth / prev;
    const focal = zoomFocalRef.current ?? {
      x: el.clientWidth / 2,
      y: el.clientHeight / 2,
    };
    zoomFocalRef.current = null;
    el.scrollLeft = (el.scrollLeft + focal.x) * ratio - focal.x;
    el.scrollTop = (el.scrollTop + focal.y) * ratio - focal.y;
    setScrollTop(el.scrollTop);
  }, [pageWidth]);

  /* ── Aria-Live announcer (page position) ──────────────────────── */
  const [ariaPageAnnouncement, setAriaPageAnnouncement] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (numPages > 0) setAriaPageAnnouncement(`${t("page")} ${fmtNum(currentPage)} / ${fmtNum(numPages)}`);
  }, [currentPage, numPages, t, fmtNum]);

  /* ── Sanitize pdf.js text-layer ARIA ────────────────────────────
     pdf.js links every text-layer span to a structure-tree element via
     aria-owns, but react-pdf never renders the structure tree, so each
     reference dangles (axe: aria-valid-attr-value, critical). It also
     emits hyphenation markers as <span aria-label="-"> with no role —
     aria-label is prohibited on a generic span (axe: aria-prohibited-attr,
     serious). Removing both restores natural DOM reading order. */
  useEffect(() => {
    const root = docAreaRef.current;
    if (!root) return;
    const strip = (scope: ParentNode) => {
      scope.querySelectorAll("[aria-owns]").forEach((el) => {
        const ids = el.getAttribute("aria-owns")?.split(/\s+/).filter(Boolean) ?? [];
        if (!ids.length || ids.some((id) => !document.getElementById(id))) {
          el.removeAttribute("aria-owns");
        }
      });
      scope.querySelectorAll("span[aria-label]:not([role])").forEach((el) => {
        if (el.closest(".textLayer, .react-pdf__Page__structTree")) {
          el.removeAttribute("aria-label");
        }
      });
      // Scanned/converted PDFs often carry malformed table tagging (rows and
      // columnheaders without the required ancestry — axe: aria-required-
      // children/parent, critical). A broken table announcement is worse for
      // AT than the text layer's natural reading order, so hide those trees.
      // Anchored on root: the tree element itself can be the mutated node,
      // and querySelectorAll never matches the scope element itself.
      root.querySelectorAll(".react-pdf__Page__structTree").forEach((tree) => {
        if (
          tree.querySelector(
            '[role="table"], [role="row"], [role="rowgroup"], [role="columnheader"], [role="rowheader"], [role="cell"], [role="gridcell"]',
          )
        ) {
          tree.setAttribute("aria-hidden", "true");
        }
      });
    };
    strip(root);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes" && m.target instanceof Element) {
          strip(m.target.parentNode ?? root);
          continue;
        }
        for (const node of m.addedNodes) {
          if (node instanceof Element) strip(node);
        }
      }
    });
    mo.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-owns", "aria-label"],
    });
    return () => mo.disconnect();
  }, []);

  /* ── Track connectivity (for the offline badge + error copy) ──── */
  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  /* ── Keep the page input in sync when not being edited ──────── */
  if (!isPageInputFocused && pageInputValue !== String(currentPage)) {
    setPageInputValue(String(currentPage));
  }

  /* ── Central navigation (also scrolls the page into view in
        scroll mode and suppresses observer fighting) ──────────── */
  const navigateToPage = useCallback(
    (val: number) => {
      const clamped = clamp(1, numPagesRef.current || 1, val);
      currentPageRef.current = clamped;
      setCurrentPage(clamped);
      markMaxProgressForPage(clamped);
      if (viewModeRef.current === "scroll") {
        programmaticScroll.current = true;
        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const targetTop = (clamped - 1) * scrollRowHeight;
        requestAnimationFrame(() => {
          const el = containerRef.current;
          if (!el) return;
          el.scrollTo({
            top: targetTop,
            behavior: prefersReduced ? "auto" : "smooth",
          });
          setScrollTop(targetTop);
        });
        window.clearTimeout(progScrollTimer.current);
        progScrollTimer.current = window.setTimeout(() => {
          programmaticScroll.current = false;
        }, 700);
      }
    },
    [markMaxProgressForPage, scrollRowHeight],
  );
  useEffect(() => void (navigateRef.current = navigateToPage), [navigateToPage]);

  const openPanel = useCallback((tab: Exclude<PanelTab, null>) => {
    lastPanelTabRef.current = tab;
    setPanelTab(tab);
  }, []);
  const toggleSidebar = useCallback(() => {
    setPanelTab((p) => (p ? null : lastPanelTabRef.current));
  }, []);

  useEffect(() => {
    initialScrollDoneRef.current = false;
  }, [docKey, pdfUrl]);

  useEffect(() => {
    if (
      viewMode !== "scroll" ||
      !numPages ||
      !pageWidth ||
      initialScrollDoneRef.current
    ) {
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const targetTop = (currentPageRef.current - 1) * scrollRowHeight;
    el.scrollTop = targetTop;
    setScrollTop(targetTop);
    initialScrollDoneRef.current = true;
  }, [numPages, pageWidth, scrollRowHeight, viewMode]);

  const handleViewportScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const nextTop = el.scrollTop;
        setScrollTop(nextTop);
        if (
          viewModeRef.current !== "scroll" ||
          programmaticScroll.current ||
          !numPagesRef.current
        ) {
          return;
        }
        const nextPage = clamp(
          1,
          numPagesRef.current,
          Math.floor((nextTop + el.clientHeight * 0.35) / scrollRowHeight) + 1,
        );
        if (nextPage !== currentPageRef.current) {
          currentPageRef.current = nextPage;
          setCurrentPage(nextPage);
          markMaxProgressForPage(nextPage);
        }
      });
    },
    [markMaxProgressForPage, scrollRowHeight],
  );

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
      window.clearTimeout(progScrollTimer.current);
    };
  }, []);

  /* ── Document / page load callbacks ─────────────────────────── */
  function onDocumentLoadSuccess(pdf: PdfDocumentProxy) {
    pdfRef.current = pdf;
    setPdfDoc(pdf);
    setLoadErrorKind(null);
    setNumPages(pdf.numPages);
    numPagesRef.current = pdf.numPages; // fresh for navigateToPage below
    const pending = pendingRestoreRef.current;
    pendingRestoreRef.current = null;
    let target = Math.min(currentPageRef.current, pdf.numPages);
    if (pending) target = clamp(1, pdf.numPages, pending);
    if (target !== currentPageRef.current) {
      currentPageRef.current = target;
      setCurrentPage(target);
      // We position explicitly (next frame, after the spacers commit) —
      // suppress the layout-ready initial scroll so it can't fight us.
      initialScrollDoneRef.current = true;
      requestAnimationFrame(() => navigateToPage(target));
    }
    markMaxProgressForPage(target, pdf.numPages);
    const durationMs = Math.round(performance.now() - loadStartedAtRef.current);
    if (durationMs > 8000) {
      reportReaderEvent("pdf_load_slow", { durationMs });
    }
    pdf
      .getOutline()
      .then((o) => setOutline((o as unknown as OutlineNode[]) ?? []))
      .catch(() => setOutline([]));
  }

  function onDocumentLoadError(error: Error) {
    setLoadErrorKind(classifyPdfError(error));
    reportReaderEvent("pdf_load_error", { message: error.message });
  }

  const onPageRenderError = useCallback(
    (page: number, error: Error) => {
      reportReaderEvent("pdf_render_error", { page, message: error.message });
    },
    [reportReaderEvent],
  );

  function onFirstPageLoad(page: {
    originalWidth?: number;
    originalHeight?: number;
    width: number;
    height: number;
    rotate?: number;
  }) {
    const w = page.originalWidth ?? page.width;
    const h = page.originalHeight ?? page.height;
    if (w && h) {
      arMeasuredRef.current = true;
      setAspectRatio(h / w);
      setNativeWidth(w);
      if (typeof page.rotate === "number") {
        setInherentRotate(((page.rotate % 360) + 360) % 360);
      }
      lsSet(`ebook:ar:${bookId}`, (h / w).toFixed(4));
      lsSet(READER_KEYS.nativeWidth(bookId), String(Math.round(w)));
    }
  }

  useEffect(() => {
    return () => {
      const pdf = pdfRef.current;
      pdfRef.current = null;
      void pdf?.destroy?.();
    };
  }, []);

  /* ── View mode / bookmarks ──────────────────────────────────── */
  const toggleView = useCallback(
    () => {
      setViewMode((m) => {
        if (m === "scroll") return "single";
        // When switching to scroll, scroll directly to the current page element
        const p = currentPageRef.current;
        requestAnimationFrame(() => {
          const el = containerRef.current;
          if (!el) return;
          const targetTop = (p - 1) * scrollRowHeight;
          el.scrollTo({ top: targetTop, behavior: "auto" });
          setScrollTop(targetTop);
        });
        return "scroll";
      });
    },
    [scrollRowHeight],
  );
  const toggleBookmark = useCallback(() => {
    setBookmarks((bm) =>
      bm.includes(currentPageRef.current)
        ? bm.filter((p) => p !== currentPageRef.current)
        : [...bm, currentPageRef.current].sort((a, b) => a - b),
    );
  }, []);

  /* ── Auto-save (debounced) + flush when the tab is hidden ───── */
  useEffect(() => {
    if (!isLoggedIn || !bookId || numPages === 0 || progressPct === lastSavedRef.current) return;
    const id = window.setTimeout(() => {
      setLastSaved(progressPct);
      startTransition(() => {
        saveReadingProgress(bookId, progressPct);
      });
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(id);
  }, [progressPct, bookId, numPages, isLoggedIn]);

  useEffect(() => {
    const flush = () => {
      if (
        document.visibilityState === "hidden" &&
        isLoggedIn &&
        bookId &&
        numPagesRef.current > 0 &&
        progressRef.current !== lastSavedRef.current
      ) {
        setLastSaved(progressRef.current);
        saveReadingProgress(bookId, progressRef.current);
      }
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [bookId, isLoggedIn]);

  function saveNow() {
    if (!isLoggedIn || !bookId || numPages === 0) return;
    setLastSaved(progressPct);
    startTransition(() => {
      saveReadingProgress(bookId, progressPct);
    });
  }

  /* ── Search + annotation text renderer ─────────────────────── */
  const highlight = useCallback(
    (item: { str: string; itemIndex: number }, pageNumber: number) => {
      const nStr = nfc(item.str);
      const decorations: ItemDecoration[] = [];

      // Annotation highlights (page-specific, best-effort text match).
      // Lowest priority — pushed first so search marks win on overlap.
      const lower = nStr.toLowerCase();
      for (const ann of annotations) {
        if (ann.page_number !== pageNumber) continue;
        const needle = nfc(ann.selected_text).slice(0, 40).toLowerCase();
        if (needle.length < 3) continue;
        let from = 0;
        for (;;) {
          const at = lower.indexOf(needle, from);
          if (at === -1) break;
          decorations.push({
            start: at,
            end: at + needle.length,
            cls: `ann-${ann.highlight_color}`,
          });
          from = at + needle.length;
        }
      }

      // Search matches — exact spans from the same extraction the search ran on
      const pageMatches = matchesByPage.get(pageNumber);
      if (pageMatches) {
        for (const m of pageMatches) {
          for (const s of m.spans) {
            if (s.itemIndex !== item.itemIndex) continue;
            decorations.push({
              start: s.start,
              end: s.end,
              cls:
                m.idx === currentMatch
                  ? "ebook-mark ebook-mark-current"
                  : "ebook-mark",
            });
          }
        }
      }

      return renderItemHtml(nStr, decorations);
    },
    [annotations, matchesByPage, currentMatch],
  );

  /* ── Match cycling ──────────────────────────────────────────── */
  const goToMatch = useCallback(
    (idx: number) => {
      const total = matchPages.length;
      if (!total) return;
      const wrapped = ((idx % total) + total) % total;
      setCurrentMatch(wrapped);
      const page = matchPages[wrapped];
      if (page !== currentPageRef.current) navigateToPage(page);
    },
    [matchPages, navigateToPage],
  );

  /* Bring the active match into view once its text layer has rendered.
     Scrolls ONLY the viewer's own viewport (never window) to avoid yanking
     the page around. */
  useEffect(() => {
    if (currentMatch < 0) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const el = containerRef.current;
      const mark = el?.querySelector<HTMLElement>(".ebook-mark-current");
      if (el && mark) {
        const mr = mark.getBoundingClientRect();
        const cr = el.getBoundingClientRect();
        if (mr.top < cr.top + 48 || mr.bottom > cr.bottom - 48) {
          el.scrollTop += mr.top - (cr.top + cr.height / 2);
        }
        if (mr.left < cr.left + 16 || mr.right > cr.right - 16) {
          el.scrollLeft += mr.left - (cr.left + cr.width / 2);
        }
        window.clearInterval(timer);
      } else if (tries > 12) {
        window.clearInterval(timer);
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [currentMatch]);

  async function runSearch(raw: string) {
    const q = raw.trim();
    const seq = ++searchSeqRef.current;
    setSearchQuery(q);
    setPageHits([]);
    setMatchPages([]);
    setMatchesByPage(new Map());
    setCurrentMatch(-1);
    const pdf = pdfRef.current;
    if (!pdf || !q) return;
    setSearching(true);
    const hits: PageHit[] = [];
    const flat: number[] = [];
    const byPage = new Map<number, IndexedPageMatch[]>();
    let globalIdx = 0;
    let jumped = false;
    let dirty = false;
    // Every flush re-renders the mounted text layers, so batch progressive
    // results per yield instead of per hit — low-end phones choke otherwise.
    const flush = () => {
      if (!dirty) return;
      dirty = false;
      setPageHits([...hits]);
      setMatchPages([...flat]);
      setMatchesByPage(new Map(byPage));
    };
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        if (searchSeqRef.current !== seq || !pdfRef.current) return;
        let items = pageTextCacheRef.current.get(i);
        if (!items) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          items = itemStrings(tc.items as Array<{ str?: unknown }>);
          pageTextCacheRef.current.set(i, items);
        }
        const pageMatches = findPageMatches(items, q);
        if (pageMatches.length) {
          const firstIdx = globalIdx;
          byPage.set(
            i,
            pageMatches.map((m) => ({ spans: m.spans, idx: globalIdx++ })),
          );
          for (let k = 0; k < pageMatches.length; k++) flat.push(i);
          hits.push({
            page: i,
            count: pageMatches.length,
            snippet: pageMatches[0].snippet,
            firstMatch: firstIdx,
          });
          dirty = true;
          if (!jumped) {
            jumped = true;
            flush();
            setCurrentMatch(firstIdx);
            if (i !== currentPageRef.current) navigateToPage(i);
          }
          if (globalIdx >= MAX_MATCHES) break;
        }
        if (i % 10 === 0) {
          flush();
          await new Promise((r) => setTimeout(r, 0)); // keep UI responsive
        }
      }
    } catch {
      /* ignore */
    }
    if (searchSeqRef.current === seq) {
      flush();
      setSearching(false);
    }
  }

  /* ── Outline destination → page ─────────────────────────────── */
  async function goToDest(dest: OutlineNode["dest"]) {
    const pdf = pdfRef.current;
    if (!pdf || !dest) return;
    try {
      const explicit =
        typeof dest === "string" ? await pdf.getDestination(dest) : dest;
      if (!Array.isArray(explicit) || !explicit.length) return;
      const pageIndex = await pdf.getPageIndex(explicit[0] as never);
      navigateToPage(pageIndex + 1);
      if (window.innerWidth < 768) setPanelTab(null);
    } catch {
      /* ignore */
    }
  }

  /* ── Keyboard navigation ────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (inField && e.key !== "Escape") return; // Esc must close panes from the search box too
      // Modified shortcuts: only Ctrl/Cmd+0 (reset zoom) is claimed, and only
      // while the reader owns focus — browser zoom shortcuts stay untouched.
      if (e.ctrlKey || e.metaKey) {
        if (
          e.key === "0" &&
          (isFullscreen || rootRef.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          resetZoom();
        }
        return;
      }
      if (e.altKey) return;
      const p = currentPageRef.current;
      const n = numPagesRef.current;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
          e.preventDefault();
          navigateRef.current(p + 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          navigateRef.current(p - 1);
          break;
        case "Home":
          e.preventDefault();
          navigateRef.current(1);
          break;
        case "End":
          e.preventDefault();
          navigateRef.current(n);
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomIn();
          break;
        case "-":
          e.preventDefault();
          zoomOut();
          break;
        case "f":
        case "F":
          e.preventDefault();
          setIsFullscreen((v) => !v);
          break;
        case "r":
        case "R":
          e.preventDefault();
          rotateClockwise();
          break;
        case "/":
          // The navbar (NavSearch) binds "/" site-wide to router.push("/search").
          // While a document is open, in-document search owns the key — this
          // listener is registered in the CAPTURE phase so it always runs
          // first, and stopPropagation keeps the navbar from navigating away.
          e.preventDefault();
          e.stopPropagation();
          openPanel("search");
          // covers the panel-already-open case; the panel-open effect covers the rest
          requestAnimationFrame(() => searchInputRef.current?.focus());
          break;
        case "Escape":
          if (inField) (e.target as HTMLElement).blur();
          if (mobileMenuOpen) setMobileMenuOpen(false);
          else if (moreMenuOpen) setMoreMenuOpen(false);
          else if (panelTab) setPanelTab(null);
          else if (isFullscreen) setIsFullscreen(false);
          else break;
          e.stopPropagation(); // consumed — don't also trigger other Esc handlers
          break;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoomIn, zoomOut, resetZoom, rotateClockwise, openPanel, panelTab, isFullscreen, mobileMenuOpen, moreMenuOpen]);

  /* ── "/" or the toolbar button opened the search panel → focus it ── */
  useEffect(() => {
    if (panelTab !== "search") return;
    const id = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [panelTab]);

  /* ── Touch: swipe (single mode), pinch-zoom, double-tap-zoom ────
     Pinch uses a two-stage strategy: while fingers move, a cheap CSS
     transform on the gesture layer previews the zoom (rAF-throttled, no
     React re-render, no canvas re-raster); on release the final scale is
     committed to React state around the pinch midpoint, and the preview
     transform is dropped once the re-rendered width lands (see the focal
     point effect), so the final output is sharp. */
  useEffect(() => {
    const el = docAreaRef.current;
    if (!el) return;
    let touchStart: { x: number; y: number; time: number } | null = null;
    let pinch: {
      startDist: number;
      baseScale: number;
      midX: number;
      midY: number;
      gesture: number;
      raf: number | null;
    } | null = null;
    let lastTap = { time: 0, x: 0, y: 0 };

    const containerPoint = (clientX: number, clientY: number) => {
      const c = containerRef.current;
      const rect = c?.getBoundingClientRect();
      return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const mid = containerPoint(
          (e.touches[0].clientX + e.touches[1].clientX) / 2,
          (e.touches[0].clientY + e.touches[1].clientY) / 2,
        );
        pinch = {
          startDist: dist(e.touches[0], e.touches[1]),
          baseScale: effScaleRef.current,
          midX: mid.x,
          midY: mid.y,
          gesture: 1,
          raf: null,
        };
        touchStart = null;
      } else if (e.touches.length === 1) {
        const tch = e.touches[0];
        touchStart = { x: tch.clientX, y: tch.clientY, time: Date.now() };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        // clamp the preview so it can never exceed what the commit allows
        const raw = pinch.baseScale * (d / pinch.startDist);
        pinch.gesture = clampScale(raw) / pinch.baseScale;
        if (pinch.raf === null) {
          pinch.raf = requestAnimationFrame(() => {
            if (!pinch) return;
            pinch.raf = null;
            const layer = gestureLayerRef.current;
            const c = containerRef.current;
            if (!layer || !c) return;
            layer.style.transformOrigin = `${c.scrollLeft + pinch.midX}px ${c.scrollTop + pinch.midY}px`;
            layer.style.transform = `scale(${pinch.gesture})`;
          });
        }
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (pinch && e.touches.length < 2) {
        const { baseScale, gesture, midX, midY, raf } = pinch;
        if (raf !== null) cancelAnimationFrame(raf);
        pinch = null;
        touchStart = null;
        const next = clampScale(baseScale * gesture);
        if (Math.abs(next - baseScale) > 0.01) {
          commitZoomRef.current(next, { x: midX, y: midY });
        } else {
          // no-op pinch (or clamped at the limit): drop the preview now
          const layer = gestureLayerRef.current;
          if (layer) {
            layer.style.transform = "";
            layer.style.transformOrigin = "";
          }
        }
        return;
      }
      const start = touchStart;
      touchStart = null;
      if (!start) return;
      const tch = e.changedTouches[0];
      const dx = tch.clientX - start.x;
      const dy = tch.clientY - start.y;
      const dt = Date.now() - start.time;

      // double-tap → toggle zoom around the tapped point
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 250) {
        const now = Date.now();
        if (
          now - lastTap.time < 300 &&
          Math.abs(tch.clientX - lastTap.x) < 30 &&
          Math.abs(tch.clientY - lastTap.y) < 30
        ) {
          lastTap = { time: 0, x: 0, y: 0 };
          // never hijack link taps, annotation taps or active text selections
          const target = e.target as HTMLElement | null;
          const sel = window.getSelection();
          if (target?.closest("a, .annotationLayer") || (sel && !sel.isCollapsed)) {
            return;
          }
          const fitScale = fitWidthScaleRef.current;
          if (effScaleRef.current > fitScale * 1.15) {
            applyFitRef.current("width"); // zoomed in → back to fitted
          } else {
            const focal = containerPoint(tch.clientX, tch.clientY);
            commitZoomRef.current(
              clampScale(Math.max(effScaleRef.current, fitScale) * 1.9),
              focal,
            );
          }
          return;
        }
        lastTap = { time: now, x: tch.clientX, y: tch.clientY };
      }

      // horizontal swipe → page turn (single mode, not zoomed in)
      const notZoomedIn =
        fitModeRef.current !== "custom" ||
        effScaleRef.current <= fitWidthScaleRef.current * 1.05;
      if (
        viewModeRef.current === "single" &&
        notZoomedIn &&
        dt < 500 &&
        Math.abs(dx) > 50 &&
        Math.abs(dy) < Math.abs(dx) * 0.7
      ) {
        navigateRef.current(currentPageRef.current + (dx < 0 ? 1 : -1));
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

  /* ── Ctrl/Cmd + mousewheel zoom (and trackpad pinch, which browsers
        report as ctrl+wheel) — steps presets around the pointer.
        Unmodified wheel events pass through untouched. ─────────── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf: number | null = null;
    let pendingDelta = 0;
    let focal = { x: 0, y: 0 };
    let lastStep = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      pendingDelta += e.deltaY;
      const rect = el.getBoundingClientRect();
      focal = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const now = performance.now();
        if (Math.abs(pendingDelta) < 4 || now - lastStep < 80) {
          pendingDelta = 0;
          return;
        }
        const dir: 1 | -1 = pendingDelta < 0 ? 1 : -1;
        pendingDelta = 0;
        lastStep = now;
        commitZoomRef.current(stepZoom(effScaleRef.current, dir), focal);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  /* ── Focus Trap (Fullscreen) ────────────────────────────────── */
  useEffect(() => {
    if (!isFullscreen) return;
    const el = docAreaRef.current?.parentElement;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      } else if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    el.addEventListener("keydown", onKey);
    // Focus the document viewport on open (not a toolbar button): arrow keys
    // work immediately and the auto-hide timer isn't pinned open by a
    // toolbar control holding focus.
    (containerRef.current ?? first).focus();
    return () => el.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  /* ── Fullscreen auto-hide controls ──────────────────────────── */
  const controlsPaused = Boolean(
    panelTab || mobileMenuOpen || moreMenuOpen || selectionPopup,
  );
  const controlsVisible = useAutoHideControls({
    enabled: isFullscreen,
    paused: controlsPaused,
    rootRef,
  });

  /* ── Page input submit ──────────────────────────────────────── */
  function submitPageInput() {
    const v = parseInt(pageInputValue, 10);
    if (!isNaN(v)) navigateToPage(v);
    setIsPageInputFocused(false);
  }

  /* ── Save annotation ────────────────────────────────────────── */
  async function handleSaveAnnotation() {
    if (!selectionPopup || savingAnnotation) return;
    setSavingAnnotation(true);
    const result = await addAnnotation(
      bookId,
      selectionPopup.page,
      selectionPopup.text,
      annotationNote,
      annotationColor
    );
    setSavingAnnotation(false);
    if (result.success && result.annotation) {
      setAnnotations((prev) => [...prev, result.annotation!]);
      window.getSelection()?.removeAllRanges();
    }
    setSelectionPopup(null);
    setAnnotationNote("");
  }

  /* ── Delete annotation ──────────────────────────────────────── */
  async function handleDeleteAnnotation(id: string) {
    await deleteAnnotation(id);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }

  /* ── Download ───────────────────────────────────────────────── */
  async function handleDownload() {
    if (downloading || !pdfUrl || !allowDownload) return;
    if (!isLoggedIn) {
      window.location.href = `/auth/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    setDownloading(true);
    try {
      startTransition(() => {
        incrementDownloadCount(bookId);
      });
      const a = document.createElement("a");
      // When we already have an offline blob, download that (works with no
      // network); otherwise hit the original URL.
      a.href = fromCache && resolvedFile ? resolvedFile : pdfUrl;
      a.download = `${title}.pdf`;
      if (!fromCache) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setTimeout(() => setDownloading(false), 2000);
    }
  }

  /* ── No-PDF fallback ────────────────────────────────────────── */
  if (!pdfUrl) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-divider bg-paper p-8 text-center">
        <Icon name="pdf" className="mb-3 text-5xl text-brand" />
        <h2 className="text-xl font-bold text-text-heading">{title}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-text-body">{t("noPdf")}</p>
      </div>
    );
  }

  const loadErrorMessage = isOffline
    ? t("offlineError")
    : loadErrorKind === "missing"
      ? t("fileUnavailable")
      : loadErrorKind === "permission"
        ? t("permissionDenied")
        : loadErrorKind === "invalid"
          ? t("invalidPdf")
          : loadErrorKind === "network"
            ? t("networkError")
            : t("loadErrorDetailed");
  const reportBrokenHref = `mailto:${PTEC.email}?subject=${encodeURIComponent(
    `Broken PDF: ${title}`,
  )}&body=${encodeURIComponent(
    `Please check this PDF file.\n\nTitle: ${title}\nResource ID: ${bookId}\nFile: ${safePdfPath(pdfUrl) ?? "unknown"}\nPage: ${currentPage}`,
  )}`;

  const panelTabs: { id: Exclude<PanelTab, null>; label: string; icon: React.ReactNode }[] = [
    { id: "pages", label: t("pagesTab"), icon: <LayoutGrid className="h-4 w-4" aria-hidden /> },
    { id: "outline", label: t("outline"), icon: <List className="h-4 w-4" aria-hidden /> },
    { id: "bookmarks", label: t("bookmarks"), icon: <Bookmark className="h-4 w-4" aria-hidden /> },
    { id: "search", label: t("search"), icon: <SearchIcon className="h-4 w-4" aria-hidden /> },
    ...(isLoggedIn
      ? [{ id: "annotations" as const, label: t("notesTab"), icon: <PenLine className="h-4 w-4" aria-hidden /> }]
      : []),
  ];

  const fitCheck = (active: boolean) =>
    active ? <Check className="ml-auto h-4 w-4 text-cyan-300" aria-hidden /> : null;

  return (
    <>
      {/* search + annotation highlight colors (scoped), with dedicated
          dark-theme values so highlights stay readable on recolored pages */}
      <style>{`
        .ebook-mark{background:#fde047;color:#000;border-radius:2px;}
        .ebook-mark-current{background:#fb923c;box-shadow:0 0 0 2px #ea580c;}
        .ann-yellow{background:#fef08a80;border-radius:2px;}
        .ann-green{background:#bbf7d080;border-radius:2px;}
        .ann-blue{background:#bfdbfe80;border-radius:2px;}
        .ann-pink{background:#fbcfe880;border-radius:2px;}
        .reader-dark .ebook-mark{background:#FACC15;color:#111827;}
        .reader-dark .ebook-mark-current{background:#FB923C;color:#111827;box-shadow:0 0 0 2px #FDBA74;}
        .reader-dark .ann-yellow{background:rgba(250,204,21,.38);}
        .reader-dark .ann-green{background:rgba(74,222,128,.35);}
        .reader-dark .ann-blue{background:rgba(96,165,250,.35);}
        .reader-dark .ann-pink{background:rgba(244,114,182,.35);}
      `}</style>

      {/* Aria-live regions for screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {ariaPageAnnouncement}
      </div>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {statusMessage}
      </div>

      <div
        ref={rootRef}
        className={cx(
          "flex flex-col overflow-hidden",
          theme === "dark" && "reader-dark",
          isFullscreen
            ? "fixed inset-0 z-[9999] bg-slate-950"
            : "rounded-lg border border-divider bg-bg-surface shadow-sm",
        )}
        role={isFullscreen ? "dialog" : undefined}
        aria-modal={isFullscreen ? true : undefined}
        aria-label={isFullscreen ? title : undefined}
      >
        {/* ── TOOLBAR ─────────────────────────────────────────── */}
        <div
          data-reader-toolbar
          className={cx(
            "order-2 shrink-0 border-white/10 bg-slate-950 px-2 py-1.5 text-white sm:order-1 sm:border-b sm:px-4 sm:py-2.5",
            isFullscreen && "transition-opacity duration-300 motion-reduce:transition-none",
            isFullscreen && !controlsVisible && "pointer-events-none opacity-0",
          )}
          aria-hidden={isFullscreen && !controlsVisible ? true : undefined}
        >
          {/* ══ Desktop toolbar (sm+): title · sidebar/search · nav · zoom ·
                theme · fullscreen · ⋯ ══ */}
          <div className="hidden items-center gap-3 sm:flex">
            {/* Title + panel/search toggles */}
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-surface/10 md:flex">
                <Icon name="pdf" className="text-xl text-cyan-100" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 title={title} className="truncate text-[15px] font-bold sm:text-base">{title}</h2>
                <p className="hidden text-[11px] text-slate-400 md:block">{t("readOnline")}</p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <ToolButton
                  onClick={toggleSidebar}
                  active={!!panelTab}
                  label={t("sidebar")}
                  className="h-9 w-9"
                >
                  <PanelLeft className="h-4 w-4" aria-hidden />
                </ToolButton>
                <ToolButton
                  onClick={() => (panelTab === "search" ? setPanelTab(null) : openPanel("search"))}
                  active={panelTab === "search"}
                  label={t("search")}
                  className="h-9 w-9"
                >
                  <SearchIcon className="h-4 w-4" aria-hidden />
                </ToolButton>
                {isLoggedIn && (
                  <ToolButton
                    onClick={() =>
                      panelTab === "annotations" ? setPanelTab(null) : openPanel("annotations")
                    }
                    active={panelTab === "annotations"}
                    label={t("annotations")}
                    className="relative h-9 w-9"
                  >
                    <PenLine className="h-4 w-4" aria-hidden />
                    {annotations.length > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-700 text-[9px] font-bold text-white">
                        {annotations.length > 9 ? "9+" : annotations.length}
                      </span>
                    )}
                  </ToolButton>
                )}
              </div>
            </div>

            {/* Grouped controls */}
            <div className="flex shrink-0 items-center gap-2">
              {/* Pagination */}
              {numPages > 0 && (
                <div className="flex items-center gap-1 rounded-md bg-bg-surface/10 px-1.5 py-1">
                  <ToolButton onClick={() => navigateToPage(currentPage - 1)} disabled={currentPage <= 1} label={t("prev")} className="h-7 w-7">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round">
                      <path d="M15 19l-7-7 7-7" />
                    </svg>
                  </ToolButton>
                  <input
                    type="number"
                    min={1}
                    max={numPages}
                    aria-label={t("goToPage")}
                    value={isPageInputFocused ? pageInputValue : currentPage}
                    onFocus={() => {
                      setIsPageInputFocused(true);
                      setPageInputValue(String(currentPage));
                    }}
                    onBlur={submitPageInput}
                    onChange={(e) => setPageInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitPageInput();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-9 rounded bg-transparent text-center text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="text-[11px] text-slate-400">/ {fmtNum(numPages)}</span>
                  <ToolButton onClick={() => navigateToPage(currentPage + 1)} disabled={currentPage >= numPages} label={t("next")} className="h-7 w-7">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round">
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </ToolButton>
                </div>
              )}

              {/* Zoom cluster: presets, editable %, fit menu, reset */}
              <ZoomControl
                percent={zoomPercent}
                fitMode={fitMode}
                onZoomIn={zoomIn}
                onZoomOut={zoomOut}
                onFit={applyFitMode}
                onScale={applyCustomZoom}
                fmtNum={fmtNum}
              />

              {/* Appearance: explicit Light | Dark */}
              <ThemeControl theme={theme} onChange={changeTheme} />

              {/* Progress (large screens) */}
              {numPages > 0 && (
                <div className="hidden flex-col gap-0.5 xl:flex">
                  <div className="flex items-center gap-2">
                    <div
                      role="progressbar"
                      aria-label={t("readingProgress")}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progressPct}
                      className="relative h-1.5 w-24 overflow-hidden rounded-full bg-bg-surface/20"
                    >
                      <div className="absolute h-full rounded-full bg-white/10 transition-all duration-300" style={{ width: `${maxProgressPct}%` }} />
                      <div className="absolute h-full rounded-full bg-cyan-400 transition-all duration-300" style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-cyan-300">{fmtNum(progressPct)}%</span>
                  </div>
                  {maxProgressPct > 0 && (
                    <span className="text-[10px] text-slate-400">
                      {fmtNum(Math.max(0, numPages - Math.round((maxProgressPct / 100) * numPages)))} {locale === "km" ? "ទំព័រនៅសល់" : "pages left"}
                    </span>
                  )}
                </div>
              )}

              {/* Fullscreen */}
              <ToolButton
                onClick={() => setIsFullscreen((v) => !v)}
                label={isFullscreen ? t("exit") : t("fullscreen")}
                className="h-9 w-9 border border-white/20"
              >
                {isFullscreen ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                  </svg>
                )}
              </ToolButton>

              {/* Secondary actions live in the More (⋯) menu */}
              <div className="relative">
                <ToolButton
                  onClick={() => setMoreMenuOpen((v) => !v)}
                  active={moreMenuOpen}
                  label={t("moreOptions")}
                  className="h-9 w-9"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </ToolButton>

                {moreMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setMoreMenuOpen(false)}
                      aria-hidden
                    />
                    <div className="absolute right-0 top-full z-50 mt-1.5 w-60 rounded-lg border border-white/10 bg-slate-900 p-1.5 shadow-2xl">
                      {/* View mode */}
                      <button
                        type="button"
                        onClick={() => {
                          toggleView();
                          setMoreMenuOpen(false);
                        }}
                        className={MENU_ROW}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                          {viewMode === "scroll" ? (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <rect x="5" y="3" width="14" height="7" rx="1" />
                              <rect x="5" y="14" width="14" height="7" rx="1" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <rect x="6" y="3" width="12" height="18" rx="1" />
                            </svg>
                          )}
                        </span>
                        {viewMode === "scroll" ? t("scrollMode") : t("singleMode")}
                      </button>

                      {/* Rotate */}
                      <button
                        type="button"
                        onClick={() => {
                          rotateClockwise();
                          setMoreMenuOpen(false);
                        }}
                        className={MENU_ROW}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                          <RotateCw className="h-4 w-4" aria-hidden />
                        </span>
                        {t("rotateCw")}
                        {rotation !== 0 && (
                          <span className="ml-auto text-[10px] text-slate-400">{fmtNum(rotation)}°</span>
                        )}
                      </button>

                      <div className="my-1 h-px bg-white/10" />

                      {/* Bookmark current page */}
                      {numPages > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            toggleBookmark();
                            setMoreMenuOpen(false);
                          }}
                          className={MENU_ROW}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                            <Bookmark className="h-4 w-4" fill={isBookmarked ? "currentColor" : "none"} aria-hidden />
                          </span>
                          {isBookmarked ? t("bookmarkRemove") : t("bookmarkAdd")}
                        </button>
                      )}

                      {/* Save progress */}
                      {numPages > 0 && isLoggedIn && (
                        <button
                          type="button"
                          onClick={() => {
                            saveNow();
                            setMoreMenuOpen(false);
                          }}
                          disabled={isSaved}
                          className={cx(MENU_ROW, isSaved && "text-emerald-400")}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                            {isSaved ? (
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                <path d="M17 21v-8H7v8M7 3v5h8" />
                              </svg>
                            )}
                          </span>
                          {isSaved ? t("saved") : t("save")}
                        </button>
                      )}

                      {/* Download */}
                      {allowDownload && (
                        <button
                          type="button"
                          onClick={() => {
                            handleDownload();
                            setMoreMenuOpen(false);
                          }}
                          disabled={downloading}
                          className={MENU_ROW}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                            {downloading ? (
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            ) : (
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                            )}
                          </span>
                          {downloading ? t("opening") : t("download")}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Tablet progress (sm..xl) */}
          {numPages > 0 && (
            <div className="mt-2 hidden items-center gap-2 sm:flex xl:hidden">
              <div
                role="progressbar"
                aria-label={t("readingProgress")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPct}
                className="h-1 flex-1 overflow-hidden rounded-full bg-bg-surface/20"
              >
                <div className="h-full rounded-full bg-cyan-400 transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-[11px] font-semibold text-cyan-300">{fmtNum(progressPct)}%</span>
            </div>
          )}

          {/* ══ Mobile bottom toolbar (< sm): page nav, zoom and theme stay
                one tap away; everything else lives in the ⋯ sheet ══ */}
          <div
            className="flex items-center justify-between gap-0.5 sm:hidden"
            style={isFullscreen ? { paddingBottom: "env(safe-area-inset-bottom)" } : undefined}
          >
            <ToolButton
              onClick={() => navigateToPage(currentPage - 1)}
              disabled={numPages === 0 || currentPage <= 1}
              label={t("prev")}
              className="h-11 w-10"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M15 19l-7-7 7-7" />
              </svg>
            </ToolButton>

            <div className="flex items-center gap-0.5">
              <input
                type="number"
                min={1}
                max={numPages || 1}
                aria-label={t("goToPage")}
                value={isPageInputFocused ? pageInputValue : currentPage}
                onFocus={() => {
                  setIsPageInputFocused(true);
                  setPageInputValue(String(currentPage));
                }}
                onBlur={submitPageInput}
                onChange={(e) => setPageInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitPageInput();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="h-9 w-10 rounded bg-bg-surface/10 text-center text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-[11px] text-slate-400">/{fmtNum(numPages || 0)}</span>
            </div>

            <ToolButton
              onClick={() => navigateToPage(currentPage + 1)}
              disabled={numPages === 0 || currentPage >= numPages}
              label={t("next")}
              className="h-11 w-10"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </ToolButton>

            <span className="h-6 w-px shrink-0 bg-white/10" aria-hidden />

            <ToolButton
              onClick={zoomOut}
              disabled={zoomPercent <= 50}
              label={t("zoomOut")}
              className="h-11 w-10"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M20 12H4" />
              </svg>
            </ToolButton>
            <ToolButton
              onClick={zoomIn}
              disabled={zoomPercent >= 300}
              label={t("zoomIn")}
              className="h-11 w-10"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M12 4v16m8-8H4" />
              </svg>
            </ToolButton>

            <ToolButton
              onClick={() => changeTheme(theme === "dark" ? "light" : "dark")}
              active={theme === "dark"}
              label={theme === "dark" ? t("themeLight") : t("themeDark")}
              className="h-11 w-10"
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" aria-hidden />
              ) : (
                <Moon className="h-5 w-5" aria-hidden />
              )}
            </ToolButton>

            {/* Mobile overflow (⋯) — secondary controls live here */}
            <div className="relative">
              <ToolButton
                onClick={() => setMobileMenuOpen((v) => !v)}
                active={mobileMenuOpen}
                label={t("moreOptions")}
                className="h-11 w-10"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </ToolButton>

              {mobileMenuOpen && (
                <>
                  {/* tap-outside backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-hidden
                  />
                  {/* opens upward: on mobile the toolbar sits at the bottom */}
                  <div className="absolute bottom-full right-0 z-50 mb-1.5 max-h-[70vh] w-60 overflow-y-auto rounded-lg border border-white/10 bg-slate-900 p-1.5 shadow-2xl">
                    {/* Fit / zoom modes */}
                    <button
                      type="button"
                      onClick={() => {
                        applyFitMode("width");
                        setMobileMenuOpen(false);
                      }}
                      className={MENU_ROW}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                          <path d="M21 12H3m6-4-6 4 6 4m6-8 6 4-6 4" />
                        </svg>
                      </span>
                      {t("fitWidth")}
                      {fitCheck(fitMode === "width")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        applyFitMode("page");
                        setMobileMenuOpen(false);
                      }}
                      className={MENU_ROW}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <rect x="6" y="3" width="12" height="18" rx="1" />
                          <path d="M9 12h6" />
                        </svg>
                      </span>
                      {t("fitPage")}
                      {fitCheck(fitMode === "page")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        applyCustomZoom(1);
                        setMobileMenuOpen(false);
                      }}
                      className={MENU_ROW}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
                        </svg>
                      </span>
                      {t("actualSize")}
                      {fitCheck(fitMode === "custom" && zoomPercent === 100)}
                    </button>

                    <div className="my-1 h-px bg-white/10" />

                    {/* View mode + rotate */}
                    <button type="button" onClick={() => { toggleView(); setMobileMenuOpen(false); }} className={MENU_ROW}>
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                        {viewMode === "scroll" ? (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <rect x="5" y="3" width="14" height="7" rx="1" />
                            <rect x="5" y="14" width="14" height="7" rx="1" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <rect x="6" y="3" width="12" height="18" rx="1" />
                          </svg>
                        )}
                      </span>
                      {viewMode === "scroll" ? t("scrollMode") : t("singleMode")}
                    </button>
                    <button type="button" onClick={() => { rotateClockwise(); setMobileMenuOpen(false); }} className={MENU_ROW}>
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                        <RotateCw className="h-4 w-4" aria-hidden />
                      </span>
                      {t("rotateCw")}
                      {rotation !== 0 && (
                        <span className="ml-auto text-[10px] text-slate-400">{fmtNum(rotation)}°</span>
                      )}
                    </button>

                    <div className="my-1 h-px bg-white/10" />

                    {/* Panels */}
                    <button
                      type="button"
                      onClick={() => {
                        openPanel("search");
                        setMobileMenuOpen(false);
                      }}
                      className={MENU_ROW}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                        <SearchIcon className="h-4 w-4" aria-hidden />
                      </span>
                      {t("search")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openPanel("pages");
                        setMobileMenuOpen(false);
                      }}
                      className={MENU_ROW}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                        <LayoutGrid className="h-4 w-4" aria-hidden />
                      </span>
                      {t("pagesTab")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openPanel("outline");
                        setMobileMenuOpen(false);
                      }}
                      className={MENU_ROW}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                        <List className="h-4 w-4" aria-hidden />
                      </span>
                      {t("outline")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openPanel("bookmarks");
                        setMobileMenuOpen(false);
                      }}
                      className={MENU_ROW}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                        <Bookmark className="h-4 w-4" aria-hidden />
                      </span>
                      {t("bookmarks")}
                    </button>
                    {isLoggedIn && (
                      <button
                        type="button"
                        onClick={() => {
                          openPanel("annotations");
                          setMobileMenuOpen(false);
                        }}
                        className={MENU_ROW}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                          <PenLine className="h-4 w-4" aria-hidden />
                        </span>
                        {t("annotations")}
                      </button>
                    )}

                    <div className="my-1 h-px bg-white/10" />

                    {/* Bookmark current page */}
                    {numPages > 0 && (
                      <button type="button" onClick={() => { toggleBookmark(); setMobileMenuOpen(false); }} className={MENU_ROW}>
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                          <Bookmark className="h-4 w-4" fill={isBookmarked ? "currentColor" : "none"} aria-hidden />
                        </span>
                        {isBookmarked ? t("bookmarkRemove") : t("bookmarkAdd")}
                      </button>
                    )}

                    {/* Save */}
                    {numPages > 0 && isLoggedIn && (
                      <button
                        type="button"
                        onClick={() => {
                          saveNow();
                          setMobileMenuOpen(false);
                        }}
                        disabled={isSaved}
                        className={cx(MENU_ROW, isSaved && "text-emerald-400")}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                          {isSaved ? (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                              <path d="M17 21v-8H7v8M7 3v5h8" />
                            </svg>
                          )}
                        </span>
                        {isSaved ? t("saved") : t("save")}
                      </button>
                    )}

                    {/* Download */}
                    {allowDownload && (
                      <button
                        type="button"
                        onClick={() => {
                          handleDownload();
                          setMobileMenuOpen(false);
                        }}
                        disabled={downloading}
                        className={MENU_ROW}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </span>
                        {downloading ? t("opening") : t("download")}
                      </button>
                    )}

                    {/* Fullscreen */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsFullscreen((v) => !v);
                        setMobileMenuOpen(false);
                      }}
                      className={MENU_ROW}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                        {isFullscreen ? (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                          </svg>
                        )}
                      </span>
                      {isFullscreen ? t("exit") : t("fullscreen")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── DOCUMENT AREA ───────────────────────────────────── */}
        <div
          ref={docAreaRef}
          className={cx(
            "group relative order-1 w-full overflow-hidden sm:order-2",
            isFullscreen && "min-h-0 flex-1",
          )}
          style={{
            backgroundColor: themeColors.viewerBackground,
            ...(isFullscreen ? {} : { height: "76vh", minHeight: 560 }),
          }}
        >
          {/* ── Annotation selection popup ─────────────────────── */}
          {selectionPopup && isLoggedIn && (
            <div
              className="absolute z-50 w-64 rounded-xl border border-white/20 bg-slate-900 p-3 shadow-2xl"
              style={{
                left: Math.max(8, Math.min(selectionPopup.x, (containerWidth ?? 400) - 270)),
                top: Math.max(selectionPopup.y - 170, 8),
              }}
            >
              <p className="mb-2 line-clamp-2 text-[11px] italic text-slate-300">
                &ldquo;{selectionPopup.text.slice(0, 120)}{selectionPopup.text.length > 120 ? "…" : ""}&rdquo;
              </p>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] text-slate-400">{t("annotationColor")}:</span>
                {(["yellow", "green", "blue", "pink"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAnnotationColor(c)}
                    aria-pressed={annotationColor === c}
                    className={`h-5 w-5 rounded-full transition-transform ${
                      annotationColor === c ? "scale-125 ring-2 ring-white" : "hover:scale-110"
                    } ${
                      c === "yellow" ? "bg-yellow-300" :
                      c === "green" ? "bg-green-300" :
                      c === "blue" ? "bg-blue-300" : "bg-pink-300"
                    }`}
                    aria-label={
                      c === "yellow" ? t("colorYellow") :
                      c === "green" ? t("colorGreen") :
                      c === "blue" ? t("colorBlue") : t("colorPink")
                    }
                  />
                ))}
              </div>
              <input
                type="text"
                value={annotationNote}
                onChange={(e) => setAnnotationNote(e.target.value)}
                placeholder={locale === "km" ? "ចំណាំ (ស្រេចចិត្ត)…" : "Note (optional)…"}
                className="mb-2 w-full rounded-lg border border-white/15 bg-slate-800 px-2.5 py-1.5 text-[12px] text-white outline-none placeholder:text-slate-400 focus:border-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400/60"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveAnnotation}
                  disabled={savingAnnotation}
                  className="flex-1 rounded-lg bg-cyan-700 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-60"
                >
                  {savingAnnotation ? "…" : locale === "km" ? "រក្សា" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectionPopup(null)}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-[12px] text-slate-300 transition hover:bg-white/10"
                >
                  {locale === "km" ? "បោះបង់" : "Cancel"}
                </button>
              </div>
            </div>
          )}

          {/* Offline / cached-copy badge */}
          {(fromCache || isOffline) && (
            <div className="pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 backdrop-blur">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
              </svg>
              {t("offlineBadge")}
            </div>
          )}

          {/* Side arrows (single mode only) */}
          {viewMode === "single" && numPages > 0 && currentPage > 1 && (
            <button
              type="button"
              onClick={() => navigateToPage(currentPage - 1)}
              aria-label={t("prev")}
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-slate-900/60 p-2 text-white opacity-0 shadow-lg backdrop-blur transition-all group-hover:opacity-75 hover:!bg-slate-900/90 hover:!opacity-100 active:scale-95 sm:left-4 sm:p-3"
            >
              <svg className="h-6 w-6 sm:h-8 sm:w-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {viewMode === "single" && numPages > 0 && currentPage < numPages && (
            <button
              type="button"
              onClick={() => navigateToPage(currentPage + 1)}
              aria-label={t("next")}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-slate-900/60 p-2 text-white opacity-0 shadow-lg backdrop-blur transition-all group-hover:opacity-75 hover:!bg-slate-900/90 hover:!opacity-100 active:scale-95 sm:right-4 sm:p-3"
            >
              <svg className="h-6 w-6 sm:h-8 sm:w-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Side panel: pages / outline / bookmarks / search / notes */}
          {panelTab && (
            <>
              <div
                className="absolute inset-0 z-20 bg-black/40 md:hidden"
                onClick={() => setPanelTab(null)}
                aria-hidden
              />
              <aside className="absolute left-0 top-0 z-30 flex h-full w-[85%] max-w-[300px] flex-col border-r border-white/10 bg-slate-900 text-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 px-2 py-1.5">
                  <div role="tablist" aria-label={t("sidebar")} className="flex items-center gap-0.5">
                    {panelTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={panelTab === tab.id}
                        aria-label={tab.label}
                        title={tab.label}
                        onClick={() => openPanel(tab.id)}
                        className={cx(
                          "inline-flex h-9 w-9 items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
                          panelTab === tab.id
                            ? "bg-cyan-500/20 text-cyan-300"
                            : "text-slate-400 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        {tab.icon}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => setPanelTab(null)} aria-label={t("close")} className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                  {panelTab === "pages" && (
                    <ThumbnailsPanel
                      pdf={pdfDoc}
                      numPages={numPages}
                      currentPage={currentPage}
                      pageAspect={effAspect}
                      rotate={pageRotate}
                      pageColors={pageColors}
                      onSelect={(p) => {
                        navigateToPage(p);
                        if (window.innerWidth < 768) setPanelTab(null);
                      }}
                      fmtNum={fmtNum}
                      pageLabel={t("page")}
                      loadingLabel={t("loading")}
                    />
                  )}

                  {panelTab === "outline" &&
                    (outline.length ? (
                      <OutlineTree items={outline} onSelect={goToDest} />
                    ) : (
                      <p className="p-3 text-xs text-slate-400">{t("noOutline")}</p>
                    ))}

                  {panelTab === "bookmarks" &&
                    (bookmarks.length ? (
                      <ul className="space-y-1">
                        {bookmarks.map((p) => (
                          <li key={p} className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                navigateToPage(p);
                                if (window.innerWidth < 768) setPanelTab(null);
                              }}
                              className="flex-1 rounded px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-white/10"
                            >
                              {t("page")} {fmtNum(p)}
                            </button>
                            <button
                              type="button"
                              onClick={() => setBookmarks((bm) => bm.filter((x) => x !== p))}
                              aria-label={t("bookmarkRemove")}
                              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-red-400"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="p-3 text-xs text-slate-400">{t("noBookmarks")}</p>
                    ))}

                  {panelTab === "search" && (
                    <div className="flex h-full flex-col">
                      <div className="flex gap-1 p-1">
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={searchInput}
                          onChange={(e) => setSearchInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const q = searchInput.trim();
                            // Same query again → cycle instead of re-searching
                            if (q && q === searchQuery && matchPages.length) {
                              goToMatch(currentMatch + (e.shiftKey ? -1 : 1));
                            } else {
                              runSearch(searchInput);
                            }
                          }}
                          placeholder={t("searchPlaceholder")}
                          className="min-w-0 flex-1 rounded-md border border-white/15 bg-slate-800 px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-slate-400 focus:border-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                        />
                        <button
                          type="button"
                          onClick={() => runSearch(searchInput)}
                          aria-label={t("search")}
                          className="rounded-md bg-cyan-700 px-2.5 text-white hover:bg-cyan-600"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m21 21-4.3-4.3" />
                          </svg>
                        </button>
                      </div>
                      {matchPages.length > 0 && (
                        <div className="flex items-center justify-between gap-1 px-2 py-1">
                          <span aria-live="polite" className="text-[11px] font-semibold text-cyan-300">
                            {t("matchCount", {
                              current: fmtNum(currentMatch + 1),
                              total: fmtNum(matchPages.length),
                            })}
                          </span>
                          <span className="flex items-center gap-1">
                            <ToolButton
                              onClick={() => goToMatch(currentMatch - 1)}
                              label={t("prevMatch")}
                              className="h-6 w-6"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                                <path d="m18 15-6-6-6 6" />
                              </svg>
                            </ToolButton>
                            <ToolButton
                              onClick={() => goToMatch(currentMatch + 1)}
                              label={t("nextMatch")}
                              className="h-6 w-6"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                                <path d="m6 9 6 6 6-6" />
                              </svg>
                            </ToolButton>
                          </span>
                        </div>
                      )}
                      <div className="px-2 py-1 text-[11px] text-slate-400">
                        {searching ? t("searching") : searchQuery ? (pageHits.length ? t("hits", { count: fmtNum(pageHits.length) }) : t("noResults")) : ""}
                      </div>
                      <ul className="flex-1 space-y-1 overflow-y-auto">
                        {pageHits.map((h) => (
                          <li key={h.page}>
                            <button
                              type="button"
                              onClick={() => {
                                goToMatch(h.firstMatch);
                                if (window.innerWidth < 768) setPanelTab(null);
                              }}
                              className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/10"
                            >
                              <span className="flex items-baseline justify-between gap-2">
                                <span className="text-xs font-semibold text-cyan-300">{t("page")} {fmtNum(h.page)}</span>
                                {h.count > 1 && (
                                  <span className="rounded bg-white/10 px-1 text-[10px] text-slate-300">{fmtNum(h.count)}</span>
                                )}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-slate-300">…{h.snippet}…</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {panelTab === "annotations" && (
                    <div className="flex h-full flex-col">
                      {annotations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                          <svg className="h-8 w-8 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          <p className="text-[11px] text-slate-400">
                            {locale === "km"
                              ? "គ្មានចំណារ។ ជ្រើសអត្ថបទ ហើយចុចប៊ូតុង \"ចំណារ\"។"
                              : "No annotations yet. Select any text in the PDF to add one."}
                          </p>
                        </div>
                      ) : (
                        <ul className="flex-1 space-y-1.5 overflow-y-auto p-2">
                          {annotations.map((ann) => {
                            const colorMap = {
                              yellow: "bg-yellow-300/20 border-yellow-300/40",
                              green: "bg-green-300/20 border-green-300/40",
                              blue: "bg-blue-300/20 border-blue-300/40",
                              pink: "bg-pink-300/20 border-pink-300/40",
                            };
                            const dotMap = {
                              yellow: "bg-yellow-300",
                              green: "bg-green-300",
                              blue: "bg-blue-300",
                              pink: "bg-pink-300",
                            };
                            return (
                              <li
                                key={ann.id}
                                className={`rounded-lg border p-2.5 ${colorMap[ann.highlight_color]}`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigateToPage(ann.page_number);
                                      if (window.innerWidth < 768) setPanelTab(null);
                                    }}
                                    className="flex items-center gap-1.5 text-left"
                                  >
                                    <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${dotMap[ann.highlight_color]}`} />
                                    <span className="text-[10px] font-semibold text-cyan-300">
                                      {locale === "km" ? "ទំព័រ" : "Page"} {fmtNum(ann.page_number)}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAnnotation(ann.id)}
                                    aria-label={t("deleteAnnotation")}
                                    className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-red-400"
                                  >
                                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                                      <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                                <p className="mt-1 line-clamp-3 text-[11px] italic text-slate-300">
                                  &ldquo;{ann.selected_text}&rdquo;
                                </p>
                                {ann.note_content && (
                                  <p className="mt-1 text-[11px] text-slate-400">
                                    {ann.note_content}
                                  </p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </aside>
            </>
          )}

          {/* Scroll viewport */}
          <div
            ref={containerRef}
            className="relative h-full w-full overflow-auto"
            // pan-x too: zoomed pages overflow horizontally and must stay
            // pannable on touch. Browser pinch-zoom remains disabled, so the
            // custom pinch handler above keeps receiving the events.
            style={{ touchAction: "pan-x pan-y" }}
            onScroll={handleViewportScroll}
            // Scrollable region must be keyboard-reachable (axe:
            // scrollable-region-focusable); arrows/PageUp/PageDown already
            // turn pages via the window keydown handler above.
            tabIndex={0}
            role="region"
            aria-label={`${title} — ${t("documentArea")}`}
          >
            {/* gesture layer: pinch previews scale this via CSS transform */}
            <div ref={gestureLayerRef}>
            <Document
              key={docKey}
              file={resolvedFile ?? undefined}
              options={pdfOptions}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              onSourceError={onDocumentLoadError}
              loading={
                <div className="flex h-full flex-col items-center justify-center gap-3 p-10" aria-live="polite">
                  <div className={cx("h-8 w-8 animate-spin rounded-full border-4", theme === "dark" ? "border-white/20 border-t-cyan-400" : "border-divider border-t-brand")} />
                  <p className={cx("text-sm", theme === "dark" ? "text-slate-300" : "text-text-muted")}>{t("loading")}</p>
                </div>
              }
              error={
                <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
                  <Icon name="alert-triangle" className="text-4xl text-red-500" />
                  <p className="max-w-md text-sm leading-6 text-red-500">
                    {loadErrorMessage}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLoadErrorKind(null);
                        setDocKey((k) => k + 1);
                      }}
                      className="rounded-md bg-cyan-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      {t("retry")}
                    </button>
                    <a
                      href={reportBrokenHref}
                      onClick={() => reportReaderEvent("broken_file_report")}
                      className="rounded-md border border-divider bg-bg-surface px-4 py-1.5 text-xs font-semibold text-text-heading hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      {t("reportBrokenFile")}
                    </a>
                  </div>
                </div>
              }
            >
              {viewMode === "scroll" ? (
                <div className="flex flex-col">
                  {virtualRange.before > 0 && (
                    <div style={{ height: virtualRange.before }} aria-hidden />
                  )}
                  {visiblePages.map((p) => (
                    <ScrollPage
                      key={p}
                      pageNumber={p}
                      width={pageWidth}
                      estHeight={estHeight}
                      rotate={pageRotate}
                      pageColors={pageColors}
                      pageFrameClass={pageFrameClass}
                      placeholderClass={placeholderClass}
                      devicePixelRatio={renderPixelRatio}
                      onRenderError={(error) => onPageRenderError(p, error)}
                      customTextRenderer={
                        matchesByPage.has(p) || annotations.some((a) => a.page_number === p)
                          ? (item) => highlight(item, p)
                          : undefined
                      }
                    />
                  ))}
                  {virtualRange.after > 0 && (
                    <div style={{ height: virtualRange.after }} aria-hidden />
                  )}
                  {/* capture page-1 aspect ratio once */}
                  {!arMeasuredRef.current && (
                    <div aria-hidden className="pointer-events-none h-px overflow-hidden opacity-0">
                      <Page
                        pageNumber={1}
                        width={1}
                        devicePixelRatio={1}
                        onLoadSuccess={onFirstPageLoad}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-4 w-full">
                  <div className={pageFrameClass}>
                    <Page
                      pageNumber={currentPage}
                      width={pageWidth}
                      rotate={pageRotate}
                      pageColors={pageColors}
                      devicePixelRatio={renderPixelRatio}
                      onLoadSuccess={arMeasuredRef.current ? undefined : onFirstPageLoad}
                      onRenderError={(error) => onPageRenderError(currentPage, error)}
                      renderTextLayer
                      renderAnnotationLayer
                      customTextRenderer={
                        matchesByPage.has(currentPage) || annotations.some((a) => a.page_number === currentPage)
                          ? (item) => highlight(item, currentPage)
                          : undefined
                      }
                      loading={
                        <div style={{ height: estHeight, width: pageWidth }} className={cx("animate-pulse rounded", placeholderClass)} />
                      }
                    />
                  </div>
                  {/* preload neighbours off-screen for instant page turns */}
                  <div aria-hidden className="pointer-events-none absolute opacity-0" style={{ left: -99999, top: 0 }}>
                    {currentPage > 1 && (
                      <Page
                        pageNumber={currentPage - 1}
                        width={pageWidth}
                        rotate={pageRotate}
                        pageColors={pageColors}
                        devicePixelRatio={renderPixelRatio}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    )}
                    {currentPage < numPages && (
                      <Page
                        pageNumber={currentPage + 1}
                        width={pageWidth}
                        rotate={pageRotate}
                        pageColors={pageColors}
                        devicePixelRatio={renderPixelRatio}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    )}
                  </div>
                </div>
              )}
            </Document>
            </div>
          </div>

          {/* Keyboard hint */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 rounded-md bg-slate-900/70 px-3 py-1.5 text-xs text-white/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 sm:block">
            {t("hint")}
          </div>
        </div>
      </div>
    </>
  );
}
