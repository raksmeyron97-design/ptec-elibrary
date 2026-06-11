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
type PanelTab = "outline" | "bookmarks" | "search" | null;
type OutlineNode = {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
};
type SearchHit = { page: number; snippet: string };

/* ──────────────────────────────────────────────────────────────────
   Constants
─────────────────────────────────────────────────────────────────── */
const PAD = 32; // horizontal/vertical breathing room inside the viewport
const MAX_SCROLL_W = 1000; // cap page width on very wide screens for readability
const RENDER_WINDOW = 3; // pages rendered on each side of the active page (scroll mode)
const TOOLBAR_H = 56;
const AUTOSAVE_MS = 1500;

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
          : "text-text-muted hover:bg-bg-surface/10 hover:text-white",
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
      {items.map((it, i) => (
        <li key={i}>
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
      ))}
    </ul>
  );
});

/* One page inside continuous-scroll mode. Outer wrapper always exists
   (keeps a stable IntersectionObserver target + reserves layout height);
   the heavy <Page> only mounts when inside the render window. */
const ScrollPage = memo(function ScrollPage({
  pageNumber,
  width,
  estHeight,
  render,
  filter,
  customTextRenderer,
  registerRef,
}: {
  pageNumber: number;
  width?: number;
  estHeight: number;
  render: boolean;
  filter?: string;
  customTextRenderer?: (item: { str: string }) => string;
  registerRef: (page: number, el: HTMLDivElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    registerRef(pageNumber, ref.current);
    return () => registerRef(pageNumber, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber]);

  return (
    <div
      ref={ref}
      data-page={pageNumber}
      className="flex w-full justify-center px-1 py-3"
      style={{ minHeight: estHeight }}
    >
      {render ? (
        <div className="relative shadow-lg">
          <div style={{ filter }}>
            <Page
              pageNumber={pageNumber}
              width={width}
              renderTextLayer
              renderAnnotationLayer
              customTextRenderer={customTextRenderer}
              loading={
                <div
                  style={{ height: estHeight, width }}
                  className="animate-pulse rounded bg-paper/60"
                />
              }
            />
          </div>
        </div>
      ) : (
        <div
          style={{ height: estHeight, width }}
          className="flex items-center justify-center rounded bg-paper/40 text-xs text-text-muted"
        >
          {pageNumber}
        </div>
      )}
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
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setFile(pdfUrl ?? null);
    setFromCache(false);
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
  
  const [maxProgressPct, setMaxProgressPct] = useState(initialMaxProgressPct || initialProgressPct || 0);

  /* ── Layout measurement ─────────────────────────────────────── */
  const [containerWidth, setContainerWidth] = useState<number>();
  const [containerHeight, setContainerHeight] = useState<number>();
  const [aspectRatio, setAspectRatio] = useState<number>(); // height / width of page 1

  /* ── Reading preferences (persisted) ────────────────────────── */
  const [viewMode, setViewMode] = useState<ViewMode>("scroll");
  const [fitMode, setFitMode] = useState<FitMode>("width");
  const [theme, setTheme] = useState<Theme>("light");

  /* ── Navigation / save status ───────────────────────────────── */
  const [pageInputValue, setPageInputValue] = useState(String(currentPage));
  const [isPageInputFocused, setIsPageInputFocused] = useState(false);

  /* ── Mobile overflow menu (⋯) — holds the secondary controls ─── */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /* ── Panel (outline / bookmarks / search) ───────────────────── */
  const [panelTab, setPanelTab] = useState<PanelTab>(null);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  /* ── Refs ───────────────────────────────────────────────────── */
  const docAreaRef = useRef<HTMLDivElement>(null); // touch target + fullscreen box
  const containerRef = useRef<HTMLDivElement>(null); // scroll viewport (measured)
  const pdfRef = useRef<PdfDocumentProxy | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const ratios = useRef<Map<number, number>>(new Map());
  const programmaticScroll = useRef(false);
  const progScrollTimer = useRef<number | undefined>(undefined);

  // refs mirroring state for stable native touch handlers
  const scaleRef = useRef(scale);
  const viewModeRef = useRef(viewMode);
  const currentPageRef = useRef(currentPage);
  const numPagesRef = useRef(numPages);
  const navigateRef = useRef<(p: number) => void>(() => {});
  const progressRef = useRef(0);
  const lastSavedRef = useRef(initialProgressPct);

  /* ── Derived ────────────────────────────────────────────────── */
  const progressPct =
    numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0;
  const isSaved = progressPct === lastSavedRef.current;
  const isBookmarked = bookmarks.includes(currentPage);

  useEffect(() => void (scaleRef.current = scale), [scale]);
  useEffect(() => void (viewModeRef.current = viewMode), [viewMode]);
  useEffect(() => void (currentPageRef.current = currentPage), [currentPage]);
  useEffect(() => void (numPagesRef.current = numPages), [numPages]);
  useEffect(() => void (progressRef.current = progressPct), [progressPct]);
  
  useEffect(() => {
    if (progressPct > maxProgressPct) setMaxProgressPct(progressPct);
  }, [progressPct, maxProgressPct]);

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
  const estHeight =
    pageWidth && aspectRatio ? Math.round(pageWidth * aspectRatio) : 600;

  /* ── Load persisted prefs after mount (avoids hydration mismatch) ── */
  useEffect(() => {
    const v = lsGet("ebook:viewMode");
    if (v === "single" || v === "scroll") setViewMode(v);
    const f = lsGet("ebook:fitMode");
    if (f === "width" || f === "page") setFitMode(f);
    const th = lsGet("ebook:theme");
    if (th === "light" || th === "sepia" || th === "dark") setTheme(th);
    const bm = lsGet(`ebook:bm:${bookId}`);
    if (bm) {
      try {
        const arr = JSON.parse(bm);
        if (Array.isArray(arr)) setBookmarks(arr);
      } catch {
        /* ignore */
      }
    }
  }, [bookId]);

  useEffect(() => lsSet("ebook:viewMode", viewMode), [viewMode]);
  useEffect(() => lsSet("ebook:fitMode", fitMode), [fitMode]);
  useEffect(() => lsSet("ebook:theme", theme), [theme]);
  useEffect(
    () => lsSet(`ebook:bm:${bookId}`, JSON.stringify(bookmarks)),
    [bookmarks, bookId],
  );

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

  /* ── Zoom Focal Point (preserve scroll center) ────────────────── */
  const prevScaleRef = useRef(scale);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || prevScaleRef.current === scale) return;
    const ratio = scale / prevScaleRef.current;
    el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * ratio - el.clientWidth / 2;
    el.scrollTop = (el.scrollTop + el.clientHeight / 2) * ratio - el.clientHeight / 2;
    prevScaleRef.current = scale;
  }, [scale]);

  /* ── Aria-Live Announcer ──────────────────────────────────────── */
  const [ariaPageAnnouncement, setAriaPageAnnouncement] = useState("");
  useEffect(() => {
    if (numPages > 0) setAriaPageAnnouncement(`${t("page")} ${fmtNum(currentPage)} / ${fmtNum(numPages)}`);
  }, [currentPage, numPages, t, fmtNum]);

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
  useEffect(() => {
    if (!isPageInputFocused) setPageInputValue(String(currentPage));
  }, [currentPage, isPageInputFocused]);

  /* ── Central navigation (also scrolls the page into view in
        scroll mode and suppresses observer fighting) ──────────── */
  const navigateToPage = useCallback(
    (val: number) => {
      const clamped = clamp(1, numPagesRef.current || 1, val);
      setCurrentPage(clamped);
      if (viewModeRef.current === "scroll") {
        programmaticScroll.current = true;
        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        requestAnimationFrame(() => {
          pageRefs.current
            .get(clamped)
            ?.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" });
        });
        window.clearTimeout(progScrollTimer.current);
        progScrollTimer.current = window.setTimeout(() => {
          programmaticScroll.current = false;
        }, 700);
      }
    },
    [],
  );
  useEffect(() => void (navigateRef.current = navigateToPage), [navigateToPage]);

  /* ── Document / page load callbacks ─────────────────────────── */
  function onDocumentLoadSuccess(pdf: PdfDocumentProxy) {
    pdfRef.current = pdf;
    setNumPages(pdf.numPages);
    if (currentPage > pdf.numPages) setCurrentPage(pdf.numPages);
    pdf
      .getOutline()
      .then((o) => setOutline((o as unknown as OutlineNode[]) ?? []))
      .catch(() => setOutline([]));
  }

  function onFirstPageLoad(page: {
    originalWidth?: number;
    originalHeight?: number;
    width: number;
    height: number;
  }) {
    const w = page.originalWidth ?? page.width;
    const h = page.originalHeight ?? page.height;
    if (w && h) setAspectRatio(h / w);
  }

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
          pageRefs.current.get(p)?.scrollIntoView({ behavior: "auto", block: "start" });
        });
        return "scroll";
      });
    },
    [],
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
      lastSavedRef.current = progressPct;
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
        lastSavedRef.current = progressRef.current;
        saveReadingProgress(bookId, progressRef.current);
      }
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [bookId, isLoggedIn]);

  function saveNow() {
    if (!isLoggedIn || !bookId || numPages === 0) return;
    lastSavedRef.current = progressPct;
    startTransition(() => {
      saveReadingProgress(bookId, progressPct);
    });
  }

  /* ── Search ─────────────────────────────────────────────────── */
  const highlight = useCallback(
    (item: { str: string }) => {
      if (!searchQuery) return item.str;
      const q = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return item.str.replace(
        new RegExp(q, "gi"),
        (m) => `<mark class="ebook-mark">${m}</mark>`,
      );
    },
    [searchQuery],
  );

  async function runSearch(raw: string) {
    const q = raw.trim();
    setSearchQuery(q);
    setSearchHits([]);
    const pdf = pdfRef.current;
    if (!pdf || !q) return;
    setSearching(true);
    const lower = q.toLowerCase();
    const hits: SearchHit[] = [];
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        const text = tc.items
          .map((it) => ("str" in it ? (it as { str: string }).str : ""))
          .join(" ");
        const idx = text.toLowerCase().indexOf(lower);
        if (idx !== -1) {
          const snippet = text
            .slice(Math.max(0, idx - 30), idx + q.length + 40)
            .trim();
          hits.push({ page: i, snippet });
          setSearchHits([...hits]); // progressive results
        }
        if (i % 10 === 0) await new Promise((r) => setTimeout(r, 0)); // keep UI responsive
      }
    } catch {
      /* ignore */
    }
    setSearching(false);
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

  /* ── Continuous-scroll: track the active page via IntersectionObserver ── */
  useEffect(() => {
    if (viewMode !== "scroll" || !numPages) return;
    const root = containerRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const p = Number((e.target as HTMLElement).dataset.page);
          ratios.current.set(p, e.isIntersecting ? e.intersectionRatio : 0);
        }
        if (programmaticScroll.current) return;
        let best = currentPageRef.current;
        let bestR = -1;
        ratios.current.forEach((r, p) => {
          if (r > bestR) {
            bestR = r;
            best = p;
          }
        });
        if (bestR > 0 && best !== currentPageRef.current) {
          currentPageRef.current = best;
          setCurrentPage(best);
        }
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    observerRef.current = io;
    pageRefs.current.forEach((el) => el && io.observe(el));
    return () => {
      io.disconnect();
      observerRef.current = null;
      ratios.current.clear();
    };
  }, [viewMode, numPages]);

  const registerPageRef = useCallback(
    (page: number, el: HTMLDivElement | null) => {
      const map = pageRefs.current;
      if (el) {
        map.set(page, el);
        observerRef.current?.observe(el);
      } else {
        const prev = map.get(page);
        if (prev) observerRef.current?.unobserve(prev);
        map.delete(page);
      }
    },
    [],
  );

  /* ── Keyboard navigation ────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
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
          e.preventDefault();
          setPanelTab("search");
          break;
        case "Escape":
          if (panelTab) setPanelTab(null);
          else if (isFullscreen) setIsFullscreen(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIn, zoomOut, panelTab, isFullscreen]);

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
  const pages = numPages > 0 ? Array.from({ length: numPages }, (_, i) => i + 1) : [];

  return (
    <>
      {/* search-highlight color (scoped) */}
      <style>{`.ebook-mark{background:#fde047;color:#000;border-radius:2px;}`}</style>
      
      {/* Aria-live region for screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {ariaPageAnnouncement}
      </div>

      <div
        className={cx(
          "flex flex-col overflow-hidden",
          isFullscreen
            ? "fixed inset-0 z-50 bg-slate-950"
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
                <p className="text-[11px] text-text-muted">{t("readOnline")}</p>
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

                {/* ── Mobile overflow (⋯) — secondary controls live here ── */}
                <div className="relative sm:hidden">
                  <ToolButton
                    onClick={() => setMobileMenuOpen((v) => !v)}
                    active={mobileMenuOpen}
                    label={locale === "km" ? "មុខងារផ្សេងទៀត" : "More"}
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
                        role="menu"
                        className="absolute bottom-full right-0 z-50 mb-1.5 w-60 rounded-lg border border-white/10 bg-slate-900 p-1.5 shadow-2xl"
                      >
                        {/* Zoom */}
                        <div className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm text-slate-200">
                          <span className="flex items-center gap-3">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-text-muted">
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
                            <span className="w-9 text-center text-[11px] font-semibold text-text-muted">
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
                        <button type="button" role="menuitem" onClick={toggleView} className={MENU_ROW}>
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-text-muted">
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
                          <button type="button" role="menuitem" onClick={toggleFit} className={MENU_ROW}>
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-text-muted">
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
                        <button type="button" role="menuitem" onClick={cycleTheme} className={MENU_ROW}>
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-text-muted">
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
                          <button type="button" role="menuitem" onClick={toggleBookmark} className={MENU_ROW}>
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-text-muted">
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
                          role="menuitem"
                          onClick={() => {
                            setPanelTab("outline");
                            setMobileMenuOpen(false);
                          }}
                          className={MENU_ROW}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-text-muted">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                            </svg>
                          </span>
                          {t("outline")}
                        </button>

                        {/* Bookmarks panel */}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setPanelTab("bookmarks");
                            setMobileMenuOpen(false);
                          }}
                          className={MENU_ROW}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-text-muted">
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
                            role="menuitem"
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
                                <svg className="h-4 w-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
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
                          role="menuitem"
                          onClick={() => {
                            setIsFullscreen((v) => !v);
                            setMobileMenuOpen(false);
                          }}
                          className={MENU_ROW}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-text-muted">
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
                <span className="w-9 text-center text-[11px] font-semibold text-text-muted">
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
                    className="w-9 bg-transparent text-center text-sm font-semibold text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="text-[11px] text-text-muted">/ {fmtNum(numPages)}</span>
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
                    <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-bg-surface/20">
                      <div className="absolute h-full rounded-full bg-white/10 transition-all duration-300" style={{ width: `${maxProgressPct}%` }} />
                      <div className="absolute h-full rounded-full bg-cyan-400 transition-all duration-300" style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-cyan-300">{fmtNum(progressPct)}%</span>
                  </div>
                  <span className="text-[10px] text-text-muted">
                    ≈ {fmtNum(Math.max(0, numPages - Math.round((maxProgressPct / 100) * numPages)))} {locale === "km" ? "នាទីនៅសល់" : "min left"}
                  </span>
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
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-surface/20">
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
                    {panelTab === "outline" ? t("outline") : panelTab === "bookmarks" ? t("bookmarks") : t("search")}
                  </span>
                  <button type="button" onClick={() => setPanelTab(null)} aria-label={t("close")} className="rounded p-1 text-text-muted hover:bg-white/10 hover:text-white">
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
                      <p className="p-3 text-xs text-text-muted">{t("noOutline")}</p>
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
                              className="rounded p-1 text-text-muted hover:bg-white/10 hover:text-red-400"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="p-3 text-xs text-text-muted">{t("noBookmarks")}</p>
                    ))}

                  {panelTab === "search" && (
                    <div className="flex h-full flex-col">
                      <div className="flex gap-1 p-1">
                        <input
                          type="text"
                          value={searchInput}
                          onChange={(e) => setSearchInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") runSearch(searchInput);
                          }}
                          placeholder={t("searchPlaceholder")}
                          className="min-w-0 flex-1 rounded-md border border-white/15 bg-slate-800 px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-text-muted focus:border-cyan-400"
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
                      <div className="px-2 py-1 text-[11px] text-text-muted">
                        {searching ? t("searching") : searchQuery ? (searchHits.length ? t("hits", { count: fmtNum(searchHits.length) }) : t("noResults")) : ""}
                      </div>
                      <ul className="flex-1 space-y-1 overflow-y-auto">
                        {searchHits.map((h) => (
                          <li key={h.page}>
                            <button
                              type="button"
                              onClick={() => {
                                navigateToPage(h.page);
                                if (window.innerWidth < 768) setPanelTab(null);
                              }}
                              className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/10"
                            >
                              <span className="text-xs font-semibold text-cyan-300">{t("page")} {fmtNum(h.page)}</span>
                              <span className="mt-0.5 block truncate text-[11px] text-slate-300">…{h.snippet}…</span>
                            </button>
                          </li>
                        ))}
                      </ul>
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
            style={{ touchAction: "pan-y" }}
          >
            <Document
              key={docKey}
              file={resolvedFile ?? undefined}
              options={pdfOptions}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <div className="flex h-full flex-col items-center justify-center gap-3 p-10">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-divider border-t-brand" />
                  <p className="text-sm text-text-muted">{t("loading")}</p>
                </div>
              }
              error={
                <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
                  <p className="text-sm text-red-500">
                    {isOffline ? t("offlineError") : t("loadError")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDocKey((k) => k + 1)}
                    className="rounded-md bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-cyan-400"
                  >
                    {t("retry")}
                  </button>
                </div>
              }
            >
              {viewMode === "scroll" ? (
                <div className="flex flex-col items-center">
                  {pages.map((p) => (
                    <ScrollPage
                      key={p}
                      pageNumber={p}
                      width={pageWidth}
                      estHeight={estHeight}
                      render={Math.abs(p - currentPage) <= RENDER_WINDOW}
                      filter={filter}
                      customTextRenderer={searchQuery ? highlight : undefined}
                      registerRef={registerPageRef}
                    />
                  ))}
                  {/* capture page-1 aspect ratio once */}
                  {!aspectRatio && (
                    <div className="hidden">
                      <Page pageNumber={1} width={1} onLoadSuccess={onFirstPageLoad} renderTextLayer={false} renderAnnotationLayer={false} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex justify-center py-4">
                  <div className="relative shadow-lg">
                    <div style={{ filter }}>
                      <Page
                        pageNumber={currentPage}
                        width={pageWidth}
                        onLoadSuccess={!aspectRatio ? onFirstPageLoad : undefined}
                        renderTextLayer
                        renderAnnotationLayer
                        customTextRenderer={searchQuery ? highlight : undefined}
                        loading={
                          <div style={{ height: estHeight, width: pageWidth }} className="animate-pulse rounded bg-paper/60" />
                        }
                      />
                    </div>
                            </div>
                  {/* preload neighbours off-screen for instant page turns */}
                  <div aria-hidden className="pointer-events-none absolute opacity-0" style={{ left: -99999, top: 0 }}>
                    {currentPage > 1 && (
                      <Page pageNumber={currentPage - 1} width={pageWidth} renderTextLayer={false} renderAnnotationLayer={false} />
                    )}
                    {currentPage < numPages && (
                      <Page pageNumber={currentPage + 1} width={pageWidth} renderTextLayer={false} renderAnnotationLayer={false} />
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