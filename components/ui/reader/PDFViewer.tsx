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

type FitMode = "width" | "page";
type ViewMode = "single" | "scroll";
type Theme = "light" | "sepia" | "dark";
type PanelTab = "outline" | "bookmarks" | "search" | "annotations" | null;
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

/* ──────────────────────────────────────────────────────────────────
   Constants
─────────────────────────────────────────────────────────────────── */
const PAD = 32; // horizontal/vertical breathing room inside the viewport
const MAX_SCROLL_W = 1000; // cap page width on very wide screens for readability
const SCROLL_PAGE_Y = 24; // vertical padding around each virtualized scroll page
const VIRTUAL_OVERSCAN = 2; // pages kept before/after the visible viewport
const MAX_RENDER_DPR = 2; // cap canvas density to avoid huge mobile/retina canvases
const TOOLBAR_H = 56;
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

/** Row style for the mobile overflow (⋯) menu. */
const MENU_ROW =
  "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-default disabled:opacity-50";

const clamp = (min: number, max: number, v: number) =>
  Math.max(min, Math.min(max, v));

const dist = (a: Touch, b: Touch) =>
  Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

function themeFilter(theme: Theme): string | undefined {
  if (theme === "dark") return "invert(1) hue-rotate(180deg)";
  if (theme === "sepia") return "sepia(0.5) saturate(1.1) brightness(0.98)";
  return undefined;
}

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


/* localStorage helpers (this runs in the user's app, not a sandbox) */
const lsGet = (k: string): string | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(k) : null;
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
};

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
        "inline-flex items-center justify-center rounded-md transition disabled:opacity-30",
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
   small moving window, so every mounted page is intentionally rendered. */
const ScrollPage = memo(function ScrollPage({
  pageNumber,
  width,
  estHeight,
  filter,
  devicePixelRatio,
  customTextRenderer,
  onRenderError,
}: {
  pageNumber: number;
  width?: number;
  estHeight: number;
  filter?: string;
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
      <div className="relative mx-auto w-max shadow-lg">
        <div style={{ filter }}>
          <Page
            pageNumber={pageNumber}
            width={width}
            devicePixelRatio={devicePixelRatio}
            renderTextLayer
            renderAnnotationLayer
            customTextRenderer={customTextRenderer}
            onRenderError={onRenderError}
            loading={
              <div
                style={{ height: estHeight, width: width ?? "min(100%, 720px)" }}
                className="animate-pulse rounded bg-paper/60"
              />
            }
          />
        </div>
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
  const [scale, setScale] = useState(1);
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
  const [scrollTop, setScrollTop] = useState(0);
  const [renderPixelRatio, setRenderPixelRatio] = useState(1);

  /* ── Reading preferences (persisted) ──────────────────────────
     Lazy-initialized straight from localStorage: this component only ever
     mounts client-side (ssr:false wrapper), so there is no hydration pass,
     and reading in an effect instead lets the persist-effects clobber the
     stored value under StrictMode's double-run. */
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = lsGet("ebook:viewMode");
    return v === "single" || v === "scroll" ? v : "scroll";
  });
  const [fitMode, setFitMode] = useState<FitMode>(() => {
    const f = lsGet("ebook:fitMode");
    return f === "width" || f === "page" ? f : "width";
  });
  const [theme, setTheme] = useState<Theme>(() => {
    const th = lsGet("ebook:theme");
    return th === "light" || th === "sepia" || th === "dark" ? th : "light";
  });

  /* ── Navigation / save status ───────────────────────────────── */
  const [pageInputValue, setPageInputValue] = useState(String(currentPage));
  const [isPageInputFocused, setIsPageInputFocused] = useState(false);

  /* ── Mobile overflow menu (⋯) — holds the secondary controls ─── */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /* ── Panel (outline / bookmarks / search) ───────────────────── */
  const [panelTab, setPanelTab] = useState<PanelTab>(null);
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
  const docAreaRef = useRef<HTMLDivElement>(null); // touch target + fullscreen box
  const containerRef = useRef<HTMLDivElement>(null); // scroll viewport (measured)
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
  const scaleRef = useRef(scale);
  const viewModeRef = useRef(viewMode);
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

  useEffect(() => void (scaleRef.current = scale), [scale]);
  useEffect(() => void (viewModeRef.current = viewMode), [viewMode]);
  useEffect(() => void (currentPageRef.current = currentPage), [currentPage]);
  useEffect(() => void (numPagesRef.current = numPages), [numPages]);
  useEffect(() => void (progressRef.current = progressPct), [progressPct]);

  const markMaxProgressForPage = useCallback((page: number, pages = numPagesRef.current) => {
    if (!pages) return;
    const pct = Math.round((page / pages) * 100);
    setMaxProgressPct((prev) => Math.max(prev, pct));
  }, []);

  /* ── Page width (folds zoom in; implements REAL fit-to-page) ──── */
  const baseWidth = useMemo(() => {
    if (!containerWidth) return undefined;
    const availW = containerWidth - PAD;
    if (viewMode === "scroll") return Math.min(availW, MAX_SCROLL_W);
    if (fitMode === "width" || !aspectRatio || !containerHeight)
      return availW;
    // fit-to-page: pick the width so the *whole* page fits the viewport height
    const widthByHeight = (containerHeight - PAD) / aspectRatio;
    return Math.floor(Math.min(availW, widthByHeight));
  }, [containerWidth, containerHeight, viewMode, fitMode, aspectRatio]);

  const pageWidth = baseWidth ? Math.round(baseWidth * scale) : undefined;
  const estHeight = pageWidth
    ? Math.round(pageWidth * (aspectRatio ?? DEFAULT_ASPECT))
    : 600;
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

  useEffect(() => lsSet("ebook:viewMode", viewMode), [viewMode]);
  useEffect(() => lsSet("ebook:fitMode", fitMode), [fitMode]);
  useEffect(() => lsSet("ebook:theme", theme), [theme]);
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

  /* ── Zoom Focal Point (preserve scroll center) ────────────────── */
  const prevScaleRef = useRef(scale);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || prevScaleRef.current === scale) return;
    const ratio = scale / prevScaleRef.current;
    el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * ratio - el.clientWidth / 2;
    el.scrollTop = (el.scrollTop + el.clientHeight / 2) * ratio - el.clientHeight / 2;
    setScrollTop(el.scrollTop);
    prevScaleRef.current = scale;
  }, [scale]);

  /* ── Aria-Live Announcer ──────────────────────────────────────── */
  const [ariaPageAnnouncement, setAriaPageAnnouncement] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (numPages > 0) setAriaPageAnnouncement(`${t("page")} ${fmtNum(currentPage)} / ${fmtNum(numPages)}`);
  }, [currentPage, numPages, t, fmtNum]);

  /* ── Strip dangling aria-owns from the pdf.js text layer ────────
     pdf.js links every text-layer span to a structure-tree element via
     aria-owns, but react-pdf never renders the structure tree, so each
     reference dangles (axe: aria-valid-attr-value, critical). Removing
     the attribute restores natural DOM reading order for screen readers. */
  useEffect(() => {
    const root = docAreaRef.current;
    if (!root) return;
    const strip = (scope: ParentNode) => {
      const els = scope.querySelectorAll("[aria-owns]");
      els.forEach((el) => {
        const ids = el.getAttribute("aria-owns")?.split(/\s+/).filter(Boolean) ?? [];
        if (!ids.length || ids.some((id) => !document.getElementById(id))) {
          el.removeAttribute("aria-owns");
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
      attributeFilter: ["aria-owns"],
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
  }) {
    const w = page.originalWidth ?? page.width;
    const h = page.originalHeight ?? page.height;
    if (w && h) {
      arMeasuredRef.current = true;
      setAspectRatio(h / w);
      lsSet(`ebook:ar:${bookId}`, (h / w).toFixed(4));
    }
  }

  useEffect(() => {
    return () => {
      const pdf = pdfRef.current;
      pdfRef.current = null;
      void pdf?.destroy?.();
    };
  }, []);

  /* ── Zoom / fit / theme ─────────────────────────────────────── */
  const zoomIn = useCallback(() => setScale((s) => clamp(0.5, 3, s + 0.25)), []);
  const zoomOut = useCallback(() => setScale((s) => clamp(0.5, 3, s - 0.25)), []);
  const toggleFit = useCallback(() => {
    setFitMode((m) => (m === "width" ? "page" : "width"));
    setScale(1);
  }, []);
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
  const cycleTheme = useCallback(
    () =>
      setTheme((th) =>
        th === "light" ? "sepia" : th === "sepia" ? "dark" : "light",
      ),
    [],
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
        case "/":
          // The navbar (NavSearch) binds "/" site-wide to router.push("/search").
          // While a document is open, in-document search owns the key — this
          // listener is registered in the CAPTURE phase so it always runs
          // first, and stopPropagation keeps the navbar from navigating away.
          e.preventDefault();
          e.stopPropagation();
          setPanelTab("search");
          // covers the panel-already-open case; the panel-open effect covers the rest
          requestAnimationFrame(() => searchInputRef.current?.focus());
          break;
        case "Escape":
          if (inField) (e.target as HTMLElement).blur();
          if (mobileMenuOpen) setMobileMenuOpen(false);
          else if (panelTab) setPanelTab(null);
          else if (isFullscreen) setIsFullscreen(false);
          else break;
          e.stopPropagation(); // consumed — don't also trigger other Esc handlers
          break;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoomIn, zoomOut, panelTab, isFullscreen, mobileMenuOpen]);

  /* ── "/" or the toolbar button opened the search panel → focus it ── */
  useEffect(() => {
    if (panelTab !== "search") return;
    const id = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [panelTab]);

  /* ── Touch: swipe (single mode), pinch-zoom, double-tap-zoom ── */
  useEffect(() => {
    const el = docAreaRef.current;
    if (!el) return;
    let touchStart: { x: number; y: number; time: number } | null = null;
    let pinch: { dist: number; base: number } | null = null;
    let lastTap = { time: 0, x: 0, y: 0 };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinch = { dist: dist(e.touches[0], e.touches[1]), base: scaleRef.current };
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
        setScale(clamp(0.5, 3, pinch.base * (d / pinch.dist)));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (pinch && e.touches.length < 2) {
        pinch = null;
        touchStart = null;
        return;
      }
      const start = touchStart;
      touchStart = null;
      if (!start) return;
      const tch = e.changedTouches[0];
      const dx = tch.clientX - start.x;
      const dy = tch.clientY - start.y;
      const dt = Date.now() - start.time;

      // double-tap → toggle zoom
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 250) {
        const now = Date.now();
        if (
          now - lastTap.time < 300 &&
          Math.abs(tch.clientX - lastTap.x) < 30 &&
          Math.abs(tch.clientY - lastTap.y) < 30
        ) {
          setScale((s) => (s > 1.2 ? 1 : 2));
          lastTap = { time: 0, x: 0, y: 0 };
          return;
        }
        lastTap = { time: now, x: tch.clientX, y: tch.clientY };
      }

      // horizontal swipe → page turn (single mode, not zoomed in)
      if (
        viewModeRef.current === "single" &&
        scaleRef.current <= 1.05 &&
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
    // Focus first element on open
    first.focus();
    return () => el.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

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

  const docAreaBg =
    theme === "dark" ? "bg-neutral-900" : theme === "sepia" ? "bg-[#f3e9d6]" : "bg-paper";
  const filter = themeFilter(theme);
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

  return (
    <>
      {/* search + annotation highlight colors (scoped) */}
      <style>{`
        .ebook-mark{background:#fde047;color:#000;border-radius:2px;}
        .ebook-mark-current{background:#fb923c;box-shadow:0 0 0 2px #ea580c;}
        .ann-yellow{background:#fef08a80;border-radius:2px;}
        .ann-green{background:#bbf7d080;border-radius:2px;}
        .ann-blue{background:#bfdbfe80;border-radius:2px;}
        .ann-pink{background:#fbcfe880;border-radius:2px;}
      `}</style>
      
      {/* Aria-live region for screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {ariaPageAnnouncement}
      </div>

      <div
        className={cx(
          "flex flex-col overflow-hidden",
          isFullscreen
            ? "fixed inset-0 z-[9999] bg-slate-950"
            : "rounded-lg border border-divider bg-bg-surface shadow-sm",
        )}
        role={isFullscreen ? "dialog" : undefined}
        aria-modal={isFullscreen ? true : undefined}
        aria-label={isFullscreen ? title : undefined}
      >
        {/* ── TOOLBAR ─────────────────────────────────────────── */}
        <div className="order-2 shrink-0 border-white/10 bg-slate-950 px-3 py-2.5 text-white sm:order-1 sm:border-b sm:px-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
            {/* Title + panel toggles */}
            <div className="flex min-w-0 items-center gap-2.5 sm:flex-1">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-surface/10">
                <Icon name="pdf" className="text-xl text-cyan-100" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 title={title} className="truncate text-[15px] font-bold sm:text-base">{title}</h2>
                <p className="text-[11px] text-slate-400">{t("readOnline")}</p>
              </div>

              <div className="flex items-center gap-1">
                <ToolButton
                  onClick={() => setPanelTab((p) => (p === "outline" ? null : "outline"))}
                  active={panelTab === "outline"}
                  label={t("outline")}
                  className="hidden h-8 w-8 sm:inline-flex"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                  </svg>
                </ToolButton>
                <ToolButton
                  onClick={() => setPanelTab((p) => (p === "bookmarks" ? null : "bookmarks"))}
                  active={panelTab === "bookmarks"}
                  label={t("bookmarks")}
                  className="hidden h-8 w-8 sm:inline-flex"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </ToolButton>
                <ToolButton
                  onClick={() => setPanelTab((p) => (p === "search" ? null : "search"))}
                  active={panelTab === "search"}
                  label={t("search")}
                  className="h-8 w-8"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </ToolButton>

                {isLoggedIn && (
                  <ToolButton
                    onClick={() => setPanelTab((p) => (p === "annotations" ? null : "annotations"))}
                    active={panelTab === "annotations"}
                    label={t("annotations")}
                    className="relative hidden h-8 w-8 sm:inline-flex"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    {annotations.length > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[9px] font-bold text-white">
                        {annotations.length > 9 ? "9+" : annotations.length}
                      </span>
                    )}
                  </ToolButton>
                )}

                {/* ── Mobile overflow (⋯) — secondary controls live here ── */}
                <div className="relative sm:hidden">
                  <ToolButton
                    onClick={() => setMobileMenuOpen((v) => !v)}
                    active={mobileMenuOpen}
                    label={t("moreOptions")}
                    className="h-8 w-8"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
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
                      <div
                        className="absolute bottom-full right-0 z-50 mb-1.5 w-60 rounded-lg border border-white/10 bg-slate-900 p-1.5 shadow-2xl"
                      >
                        {/* Zoom */}
                        <div className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm text-slate-200">
                          <span className="flex items-center gap-3">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m21 21-4.3-4.3M8 11h6" />
                              </svg>
                            </span>
                            {locale === "km" ? "ការពង្រីក" : "Zoom"}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={zoomOut}
                              disabled={scale <= 0.5}
                              aria-label={t("zoomOut")}
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-white/5 text-white transition hover:bg-white/15 disabled:opacity-30"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round">
                                <path d="M20 12H4" />
                              </svg>
                            </button>
                            <span className="w-9 text-center text-[11px] font-semibold text-slate-400">
                              {fmtNum(Math.round(scale * 100))}%
                            </span>
                            <button
                              type="button"
                              onClick={zoomIn}
                              disabled={scale >= 3}
                              aria-label={t("zoomIn")}
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-white/5 text-white transition hover:bg-white/15 disabled:opacity-30"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round">
                                <path d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          </span>
                        </div>

                        <div className="my-1 h-px bg-white/10" />

                        {/* View mode */}
                        <button type="button" onClick={toggleView} className={MENU_ROW}>
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

                        {/* Fit (single mode only) */}
                        {viewMode === "single" && (
                          <button type="button" onClick={toggleFit} className={MENU_ROW}>
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                              {fitMode === "width" ? (
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                                  <path d="M21 12H3m6-4-6 4 6 4m6-8 6 4-6 4" />
                                </svg>
                              ) : (
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <rect x="6" y="3" width="12" height="18" rx="1" />
                                  <path d="M9 12h6" />
                                </svg>
                              )}
                            </span>
                            {fitMode === "width" ? t("fitWidth") : t("fitPage")}
                          </button>
                        )}

                        {/* Theme */}
                        <button type="button" onClick={cycleTheme} className={MENU_ROW}>
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                            {theme === "dark" ? (
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                              </svg>
                            ) : theme === "sepia" ? (
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <circle cx="12" cy="12" r="4" />
                                <path d="M12 2v2m0 16v2M4 12H2m20 0h-2m-2.5-7.5-1.4 1.4M6.9 17.1l-1.4 1.4m0-13.4 1.4 1.4m10.2 10.2 1.4 1.4" strokeLinecap="round" />
                              </svg>
                            )}
                          </span>
                          {t("theme")}: {theme}
                        </button>

                        {/* Bookmark current page */}
                        {numPages > 0 && (
                          <button type="button" onClick={toggleBookmark} className={MENU_ROW}>
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill={isBookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                              </svg>
                            </span>
                            {isBookmarked ? t("bookmarkRemove") : t("bookmarkAdd")}
                          </button>
                        )}

                        <div className="my-1 h-px bg-white/10" />

                        {/* Outline */}
                        <button
                          type="button"
                          onClick={() => {
                            setPanelTab("outline");
                            setMobileMenuOpen(false);
                          }}
                          className={MENU_ROW}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                            </svg>
                          </span>
                          {t("outline")}
                        </button>

                        {/* Bookmarks panel */}
                        <button
                          type="button"
                          onClick={() => {
                            setPanelTab("bookmarks");
                            setMobileMenuOpen(false);
                          }}
                          className={MENU_ROW}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                            </svg>
                          </span>
                          {t("bookmarks")}
                        </button>

                        <div className="my-1 h-px bg-white/10" />

                        {/* Save */}
                        {numPages > 0 && (
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

            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 sm:shrink-0 sm:justify-end">
              {/* Zoom */}
              <div className="hidden items-center gap-1 rounded-md bg-bg-surface/10 px-1 py-1 sm:flex">
                <ToolButton onClick={zoomOut} disabled={scale <= 0.5} label={t("zoomOut")} className="h-7 w-7">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round">
                    <path d="M20 12H4" />
                  </svg>
                </ToolButton>
                <span className="w-9 text-center text-[11px] font-semibold text-slate-400">
                  {fmtNum(Math.round(scale * 100))}%
                </span>
                <ToolButton onClick={zoomIn} disabled={scale >= 3} label={t("zoomIn")} className="h-7 w-7">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round">
                    <path d="M12 4v16m8-8H4" />
                  </svg>
                </ToolButton>
              </div>

              {/* View mode */}
              <ToolButton
                onClick={toggleView}
                active={viewMode === "scroll"}
                label={viewMode === "scroll" ? t("scrollMode") : t("singleMode")}
                className="hidden h-8 w-8 sm:inline-flex"
              >
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
              </ToolButton>

              {/* Fit (single mode only) */}
              {viewMode === "single" && (
                <ToolButton
                  onClick={toggleFit}
                  active={fitMode === "page"}
                  label={fitMode === "width" ? t("fitWidth") : t("fitPage")}
                  className="hidden h-8 w-8 sm:inline-flex"
                >
                  {fitMode === "width" ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="M21 12H3m6-4-6 4 6 4m6-8 6 4-6 4" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="6" y="3" width="12" height="18" rx="1" />
                      <path d="M9 12h6" />
                    </svg>
                  )}
                </ToolButton>
              )}

              {/* Theme */}
              <ToolButton onClick={cycleTheme} label={`${t("theme")}: ${theme}`} className="hidden h-8 w-8 sm:inline-flex">
                {theme === "dark" ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                  </svg>
                ) : theme === "sepia" ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2m0 16v2M4 12H2m20 0h-2m-2.5-7.5-1.4 1.4M6.9 17.1l-1.4 1.4m0-13.4 1.4 1.4m10.2 10.2 1.4 1.4" strokeLinecap="round" />
                  </svg>
                )}
              </ToolButton>

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

              {/* Bookmark current page */}
              {numPages > 0 && (
                <ToolButton
                  onClick={toggleBookmark}
                  active={isBookmarked}
                  label={isBookmarked ? t("bookmarkRemove") : t("bookmarkAdd")}
                  className="hidden h-8 w-8 sm:inline-flex"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill={isBookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </ToolButton>
              )}

              {/* Progress */}
              {numPages > 0 && (
                <div className="hidden flex-col gap-0.5 lg:flex">
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
                  {/* The value is pages remaining, so label it as pages — it
                      was previously mislabeled "min left". Hidden until the
                      reader has actually started ("≈ N left" at 0% is noise). */}
                  {maxProgressPct > 0 && (
                    <span className="text-[10px] text-slate-400">
                      {fmtNum(Math.max(0, numPages - Math.round((maxProgressPct / 100) * numPages)))} {locale === "km" ? "ទំព័រនៅសល់" : "pages left"}
                    </span>
                  )}
                </div>
              )}

              {/* Download */}
              {allowDownload && (
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  aria-label={t("download")}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-800 px-2.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60 sm:px-3"
                >
                  {downloading ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  )}
                  <span className="hidden md:inline">{downloading ? t("opening") : t("download")}</span>
                </button>
              )}

              {/* Save status / force-save */}
              {numPages > 0 && (
                <button
                  type="button"
                  onClick={saveNow}
                  disabled={isSaved}
                  aria-label={isSaved ? t("saved") : t("save")}
                  className={cx(
                    "hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition sm:inline-flex sm:px-3",
                    isSaved
                      ? "cursor-default bg-emerald-500/20 text-emerald-400"
                      : "bg-cyan-500 text-white hover:bg-cyan-400",
                  )}
                >
                  {isSaved ? (
                    <>
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      {t("saved")}
                    </>
                  ) : (
                    <>
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <path d="M17 21v-8H7v8M7 3v5h8" />
                      </svg>
                      {t("save")}
                    </>
                  )}
                </button>
              )}

              {/* Fullscreen */}
              <ToolButton
                onClick={() => setIsFullscreen((v) => !v)}
                label={isFullscreen ? t("exit") : t("fullscreen")}
                className="hidden h-8 w-8 border border-white/20 sm:inline-flex"
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
            </div>
          </div>

          {/* Mobile progress — hidden on phones, shown on tablet only */}
          {numPages > 0 && (
            <div className="mt-2 hidden items-center gap-2 sm:flex lg:hidden">
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
        </div>

        {/* ── DOCUMENT AREA ───────────────────────────────────── */}
        <div
          ref={docAreaRef}
          className={cx("group relative order-1 w-full overflow-hidden sm:order-2", docAreaBg)}
          style={
            isFullscreen
              ? { height: `calc(100vh - ${TOOLBAR_H}px)` }
              : { height: "76vh", minHeight: 560 }
          }
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
                  className="flex-1 rounded-lg bg-cyan-500 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-cyan-400 disabled:opacity-60"
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

          {/* Side panel: outline / bookmarks / search */}
          {panelTab && (
            <>
              <div
                className="absolute inset-0 z-20 bg-black/40 md:hidden"
                onClick={() => setPanelTab(null)}
                aria-hidden
              />
              <aside className="absolute left-0 top-0 z-30 flex h-full w-[85%] max-w-[300px] flex-col border-r border-white/10 bg-slate-900 text-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
                  <span className="text-sm font-semibold">
                    {panelTab === "outline" ? t("outline") : panelTab === "bookmarks" ? t("bookmarks") : panelTab === "annotations" ? t("annotations") : t("search")}
                  </span>
                  <button type="button" onClick={() => setPanelTab(null)} aria-label={t("close")} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
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
                          className="rounded-md bg-cyan-500 px-2.5 text-white hover:bg-cyan-400"
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
            <Document
              key={docKey}
              file={resolvedFile ?? undefined}
              options={pdfOptions}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              onSourceError={onDocumentLoadError}
              loading={
                <div className="flex h-full flex-col items-center justify-center gap-3 p-10" aria-live="polite">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-divider border-t-brand" />
                  <p className="text-sm text-text-muted">{t("loading")}</p>
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
                      className="rounded-md bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
                      filter={filter}
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
                  <div className="relative mx-auto w-max shadow-lg">
                    <div style={{ filter }}>
                      <Page
                        pageNumber={currentPage}
                        width={pageWidth}
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
                          <div style={{ height: estHeight, width: pageWidth }} className="animate-pulse rounded bg-paper/60" />
                        }
                      />
                    </div>
                  </div>
                  {/* preload neighbours off-screen for instant page turns */}
                  <div aria-hidden className="pointer-events-none absolute opacity-0" style={{ left: -99999, top: 0 }}>
                    {currentPage > 1 && (
                      <Page
                        pageNumber={currentPage - 1}
                        width={pageWidth}
                        devicePixelRatio={renderPixelRatio}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    )}
                    {currentPage < numPages && (
                      <Page
                        pageNumber={currentPage + 1}
                        width={pageWidth}
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

          {/* Keyboard hint */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 rounded-md bg-slate-900/70 px-3 py-1.5 text-xs text-white/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 sm:block">
            {t("hint")}
          </div>
        </div>
      </div>
    </>
  );
}
