"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  AlignJustify,
  Bookmark,
  Download,
  ExternalLink,
  Eye,
  Flag,
  Keyboard,
  LayoutGrid,
  List,
  LogIn,
  Maximize2,
  Moon,
  PenLine,
  Quote,
  RotateCw,
  Save,
  Search as SearchIcon,
  Settings2,
  Square,
} from "lucide-react";
import Icon from "@/components/ui/core/Icon";
import { useLocale, useTranslations } from "next-intl";
import { incrementDownloadCount } from "@/app/actions/download";
import { nfc, renderItemHtml, type ItemDecoration } from "@/lib/reader/search-matches";
import { clampScale, stepZoom } from "@/lib/reader/zoom";
import {
  clampDpr,
  computeGeometry,
  pageRotateProp,
  SCROLL_PAGE_Y,
} from "@/lib/reader/geometry";
import {
  clamp,
  computeVirtualRange,
  pageAtScroll,
  rowTop,
} from "@/lib/reader/virtual";
import {
  READER_BUDGETS,
  canvasBytes,
  classifyDevice,
  deviceBudgetClass,
  prefetchWindowSize,
} from "@/lib/reader/budgets";
import { readingDirection, type ReadingDirection } from "@/lib/reader/prefetch";
import { classifyPdfError, type PdfErrorKind } from "@/lib/reader/errors";
import { localizeDigits } from "@/lib/reader/page-input";
import { currentSectionIndex, sectionTitleForPage, type FlatOutlineEntry } from "@/lib/reader/outline";
import {
  pageFromPercent,
  parseLocalPosition,
  resolveResumePage,
  serverTimestamp,
  shouldOfferContinue,
} from "@/lib/reader/resume";
import { brokenFileReport } from "@/lib/reader/telemetry";
import type { ReaderAction } from "@/lib/reader/shortcuts";
import {
  READER_KEYS,
  READER_THEMES,
  loadAspectRatio,
  loadBookmarks,
  loadNativePageWidth,
  loadReaderFitMode,
  loadReaderPageTransition,
  loadReaderRotation,
  loadReaderTheme,
  loadReaderViewMode,
  loadReaderZoom,
  lsGet,
  lsSet,
  type ReaderFitMode,
  type ReaderPageTransition,
  type ReaderTheme,
  type ReaderViewMode,
} from "./reader-config";
import { PDF_DOCUMENT_OPTIONS, PDF_WORKER_SRC } from "./pdf-options";
import { useLatest } from "./hooks/useLatest";
import { useResolvedPdfFile } from "./hooks/useResolvedPdfFile";
import { useReaderTelemetry } from "./hooks/useReaderTelemetry";
import { useReaderPreload } from "./hooks/useReaderPreload";
import { useMountPlan } from "./hooks/useMountPlan";
import { useConnectivity } from "./hooks/useConnectivity";
import { useIdleDocumentCleanup } from "./hooks/useIdleDocumentCleanup";
import { useAutoHideControls } from "./hooks/useAutoHideControls";
import { useTextLayerA11y } from "./hooks/useTextLayerA11y";
import { useReaderGestures } from "./hooks/useReaderGestures";
import { useReaderKeyboard } from "./hooks/useReaderKeyboard";
import { useFocusModeTrap } from "./hooks/useFocusModeTrap";
import { useReaderProgress } from "./hooks/useReaderProgress";
import { useReaderSearch } from "./hooks/useReaderSearch";
import { useReaderOutline } from "./hooks/useReaderOutline";
import { useReaderAnnotations, type AnnotationColor } from "./hooks/useReaderAnnotations";
import { useSelectionPopup } from "./hooks/useSelectionPopup";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { ReaderBottomBar, ReaderTopBar } from "./ReaderHUD";
import ReaderPanel, { type PanelTab, type PanelTabId } from "./ReaderPanel";
import ReaderOutline from "./panels/ReaderOutline";
import ReaderBookmarks from "./panels/ReaderBookmarks";
import ReaderSearchPanel from "./panels/ReaderSearchPanel";
import ReaderAnnotations from "./panels/ReaderAnnotations";
import ThumbnailsPanel from "./ThumbnailsPanel";
import ReaderPage, { type PageColors } from "./ReaderPage";
import ReaderPageNavigator from "./ReaderPageNavigator";
import ReaderMoreMenu, { type MoreMenuItem } from "./ReaderMoreMenu";
import ReaderSettings from "./ReaderSettings";
import ReaderShortcuts from "./ReaderShortcuts";
import ReaderCitation, { type ReaderCitationSource } from "./ReaderCitation";
import ReaderContinuePrompt from "./ReaderContinuePrompt";
import ReaderLoadingState from "./ReaderLoadingState";
import ReaderErrorState from "./ReaderErrorState";
import ReaderSelectionPopup from "./ReaderSelectionPopup";

/* ──────────────────────────────────────────────────────────────────
   Worker — SELF-HOSTED for true offline support (see pdf-options.ts).
─────────────────────────────────────────────────────────────────── */
pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

/* ──────────────────────────────────────────────────────────────────
   Types
─────────────────────────────────────────────────────────────────── */
// Derive the proxy type from react-pdf itself so it always matches the
// pdfjs-dist version react-pdf bundles (avoids the dual-package mismatch
// you get from importing PDFDocumentProxy straight out of "pdfjs-dist").
type PdfDocumentProxy = Parameters<
  NonNullable<ComponentProps<typeof Document>["onLoadSuccess"]>
>[0];

export type PDFViewerProps = {
  title: string;
  pdfUrl?: string | null;
  bookId: string;
  totalPages?: number;
  initialProgressPct?: number;
  initialMaxProgressPct?: number;
  /** When the server position was written (`reading_progress.last_read_at`),
   *  so a newer position on this device is not overridden by a stale one. */
  initialProgressAt?: string | null;
  /** Set false to hide the download action for protected books. Default true.
   *  Presentation only — the server re-decides on every request. */
  allowDownload?: boolean;
  isLoggedIn?: boolean;
  /** Offline reading mode: the bytes came out of Cache Storage and there is no
   *  network to talk to. Every server round-trip (progress sync, annotations,
   *  download counting, reader telemetry) is switched off — offline they would
   *  be rejected promises, not features — while local state (bookmarks, last
   *  page, zoom) keeps working because it never left the device. */
  offline?: boolean;
  /** Published support address for the "report a broken file" mailto — comes
   *  from the server parent (`(await getSiteConfig()).email`). Without it the
   *  report link is hidden rather than pointing at a compiled-in address. */
  reportEmail?: string | null;
  /** Where "Back" goes (locale-prefixed by the caller). */
  backHref?: string;
  /** Embedded previews: a close button instead of a back link. */
  onClose?: () => void;
  /** Embedded previews: link to the dedicated reader route. */
  fullReaderHref?: string;
  /** Bibliographic metadata for "Cite this book"; omitted when insufficient. */
  citation?: ReaderCitationSource | null;
  /** "embedded" = a fixed-height card (book page preview); "fill" = fill the
   *  parent's flex column (the dedicated reader route). */
  layout?: "embedded" | "fill";
};

const ANNOTATION_DEFAULT_COLOR: AnnotationColor = "yellow";
/** Space reserved above page 1 / below the last page for the overlaid bars.
    Written to the CSS custom properties too, so the panel and the maths agree. */
const HUD_INSET_TOP = 52;
const HUD_INSET_BOTTOM = 60;

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

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
  initialProgressAt = null,
  allowDownload = true,
  isLoggedIn: isLoggedInProp = false,
  offline = false,
  reportEmail,
  backHref,
  onClose,
  fullReaderHref,
  citation,
  layout = "embedded",
}: PDFViewerProps) {
  // Everything below asks `isLoggedIn` before touching the server. Deriving it
  // here — rather than sprinkling `&& !offline` through twenty call sites — is
  // what makes the offline reader provably network-free.
  const isLoggedIn = isLoggedInProp && !offline;
  const t = useTranslations("reader");
  const locale = useLocale();
  const fmt = useCallback((n: number | string) => localizeDigits(n, locale), [locale]);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  /* ── Source + document ───────────────────────────────────────── */
  const { file: resolvedFile, fromCache } = useResolvedPdfFile(pdfUrl);
  const [docKey, setDocKey] = useState(0);
  const [loadErrorKind, setLoadErrorKind] = useState<PdfErrorKind | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentProxy | null>(null);
  const pdfRef = useRef<PdfDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(totalPages);
  const [currentPage, setCurrentPage] = useState(
    totalPages > 0 ? clamp(1, totalPages, Math.round((initialProgressPct / 100) * totalPages)) : 1,
  );
  const currentPageRef = useRef(currentPage);
  const numPagesRef = useRef(numPages);
  const [isOffline, setIsOffline] = useState(false);
  const [, startTransition] = useTransition();

  /* ── Preferences (persisted, v2 keys with legacy fallback) ─────
     Lazy-initialised straight from localStorage: this component only mounts
     client-side (ssr:false wrapper), so there is no hydration pass. */
  const [viewMode, setViewMode] = useState<ReaderViewMode>(loadReaderViewMode);
  const [fitMode, setFitMode] = useState<ReaderFitMode>(loadReaderFitMode);
  const [zoomScale, setZoomScale] = useState<number>(loadReaderZoom);
  const [theme, setTheme] = useState<ReaderTheme>(loadReaderTheme);
  const [pageTransition, setPageTransition] = useState<ReaderPageTransition>(loadReaderPageTransition);
  const [rotation, setRotation] = useState<number>(() => loadReaderRotation(bookId));
  const [bookmarks, setBookmarks] = useState<number[]>(() => loadBookmarks(bookId));
  useEffect(() => lsSet(READER_KEYS.viewMode, viewMode), [viewMode]);
  useEffect(() => lsSet(READER_KEYS.fitMode, fitMode), [fitMode]);
  useEffect(() => lsSet(READER_KEYS.theme, theme), [theme]);
  useEffect(() => lsSet(READER_KEYS.zoom, String(zoomScale)), [zoomScale]);
  useEffect(() => lsSet(READER_KEYS.pageTransition, pageTransition), [pageTransition]);
  useEffect(() => lsSet(READER_KEYS.rotation(bookId), String(rotation)), [rotation, bookId]);
  useEffect(() => lsSet(READER_KEYS.bookmarks(bookId), JSON.stringify(bookmarks)), [bookmarks, bookId]);

  /* ── Layout measurement ─────────────────────────────────────── */
  const [containerWidth, setContainerWidth] = useState<number>();
  const [containerHeight, setContainerHeight] = useState<number>();
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(() => loadAspectRatio(bookId));
  const [nativeWidth, setNativeWidth] = useState<number | undefined>(() => loadNativePageWidth(bookId));
  const [inherentRotate, setInherentRotate] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [renderPixelRatio, setRenderPixelRatio] = useState(1);
  const arMeasuredRef = useRef(false);

  /* ── UI state ───────────────────────────────────────────────── */
  const [focusMode, setFocusMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTabId>("outline");
  const [moreOpen, setMoreOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [citationOpen, setCitationOpen] = useState(false);
  const [resumePrompt, setResumePrompt] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [annotationColor, setAnnotationColor] = useState<AnnotationColor>(ANNOTATION_DEFAULT_COLOR);
  const [statusMessage, setStatusMessage] = useState("");
  /** Single-page mode: the page the reader is looking at has painted, so the
      off-screen neighbours may start. Reset on every page turn and on any
      geometry change, so a neighbour never competes with the current page. */
  const [singlePageReady, setSinglePageReady] = useState(false);
  const [pageAnnouncement, setPageAnnouncement] = useState("");

  /* ── Refs ───────────────────────────────────────────────────── */
  const rootRef = useRef<HTMLDivElement>(null);
  const docAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gestureLayerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const programmaticScroll = useRef(false);
  /** Where a programmatic scroll is heading; the guard lifts on ARRIVAL, not
      on a timer — a smooth scroll can outlast any fixed delay, and the scroll
      events it raises in between must not be read as page changes. */
  const programmaticTargetRef = useRef<number | null>(null);
  const progScrollTimer = useRef<number | undefined>(undefined);
  const scrollRafRef = useRef<number | null>(null);
  const initialScrollDoneRef = useRef(false);
  const localPositionRef = useRef<ReturnType<typeof parseLocalPosition>>(null);
  const statusTimerRef = useRef<number | undefined>(undefined);

  /* ── Telemetry + preload policy ─────────────────────────────── */
  const {
    reportReaderEvent,
    onFirstPagePainted,
    firstPagePainted,
    firstPageTransfer,
    elapsed,
  } = useReaderTelemetry({
    bookId,
    pdfUrl,
    offline,
    fromCache,
    docKey,
    currentPageRef,
  });
  // The tier follows Network Information where it exists and the measured
  // first-page transfer everywhere else (Safari, Firefox), so an iPhone on a
  // poor link is no longer treated as "normal" by default.
  const preload = useReaderPreload(firstPagePainted, firstPageTransfer);

  /* ── Connectivity ───────────────────────────────────────────────
     Offline reading is already network-free, and a blob: URL cannot be
     probed, so the machine is inert there. Everywhere else it freezes new
     requests during an outage and reloads the document ONCE when the link
     comes back — a failed range request leaves its chunk permanently
     "in flight" inside pdf.js, so a later request for it hangs rather than
     retrying (docs/READER-PRODUCTION-AUDIT-2.md §F2). */
  const reloadForRecoveryRef = useRef(false);
  const connectivity = useConnectivity({
    enabled: !offline && !!pdfUrl && !fromCache,
    probeUrl: pdfUrl,
    onReload: () => {
      reloadForRecoveryRef.current = true;
      setLoadErrorKind(null);
      setDocKey((k) => k + 1);
    },
    onTransition: () => reportReaderEvent("offline_transition"),
    onRecovery: (reloaded) => reportReaderEvent("network_recovery", { reloaded }),
    isStuck: () => hasUnsettledPagesRef.current(),
  });
  /* The viewer needs the connectivity machine before the mount planner (the
     planner's `online` input comes from it) and the machine needs the
     planner's stuck-page test. One ref breaks the cycle. */
  const hasUnsettledPagesRef = useRef<() => boolean>(() => false);

  /* ── Geometry ───────────────────────────────────────────────── */
  const geom = useMemo(
    () =>
      computeGeometry({
        containerWidth,
        containerHeight,
        aspectRatio,
        nativeWidth,
        rotation,
        fitMode,
        viewMode,
        zoomScale,
      }),
    [containerWidth, containerHeight, aspectRatio, nativeWidth, rotation, fitMode, viewMode, zoomScale],
  );
  const { pageWidth, estHeight, rowHeight, effAspect, effectiveScale, fitWidthScale } = geom;
  const zoomPercent = Math.round(effectiveScale * 100);
  const pageRotate = pageRotateProp(inherentRotate, rotation);
  const geomRef = useLatest({ rowHeight, effectiveScale, fitWidthScale, viewMode, fitMode });

  /* ── Theme ──────────────────────────────────────────────────── */
  const themeColors = READER_THEMES[theme];
  const pageColors = useMemo<PageColors | undefined>(
    () =>
      theme === "dark"
        ? { background: READER_THEMES.dark.pageBackground, foreground: READER_THEMES.dark.pageForeground }
        : undefined,
    [theme],
  );
  const frameClass = cx("reader-page-frame", theme === "dark" ? "reader-page-frame--dark" : "reader-page-frame--light");
  const placeholderClass = theme === "dark" ? "reader-placeholder--dark" : "reader-placeholder--light";

  /* ── Virtualisation + prefetch ─────────────────────────────────
     The visible window is mounted unconditionally. Everything beyond it is
     PREFETCH: budgeted (pages, bytes and canvas memory — lib/reader/budgets),
     ordered nearest-first in the reading direction, admitted a couple at a
     time and only once the visible pages have painted, and never admitted
     while the link is down (lib/reader/prefetch). */
  const visibleRange = useMemo(
    () =>
      computeVirtualRange({
        scrollTop,
        viewportHeight: containerHeight ?? 0,
        rowHeight,
        numPages,
        insetTop: HUD_INSET_TOP,
        overscan: 0,
      }),
    [scrollTop, containerHeight, rowHeight, numPages],
  );
  const visibleWindow = useMemo(
    () => ({ start: visibleRange.visibleStart, end: visibleRange.visibleEnd }),
    [visibleRange.visibleStart, visibleRange.visibleEnd],
  );

  const [direction, setDirection] = useState<ReadingDirection>(0);
  const deviceClass = useMemo(
    () =>
      classifyDevice({
        coarsePointer: typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches,
        viewportWidth: containerWidth ?? 0,
      }),
    [containerWidth],
  );
  /** File size ÷ pages, so a scanned book prefetches fewer pages than a text
      one on the same link. `null` until the document reports its length. */
  const [docBytes, setDocBytes] = useState<number | null>(null);
  const overscan = useMemo(
    () =>
      prefetchWindowSize({
        tier: preload.tier,
        visibleCount: Math.max(1, visibleWindow.end - visibleWindow.start + 1),
        bytesPerPage: docBytes && numPages ? docBytes / numPages : undefined,
        perPageCanvasBytes: canvasBytes(pageWidth ?? 0, estHeight, renderPixelRatio),
        device: deviceBudgetClass(deviceClass),
      }),
    [preload.tier, visibleWindow, docBytes, numPages, pageWidth, estHeight, renderPixelRatio, deviceClass],
  );

  const geometryKey = `${pageWidth ?? 0}|${pageRotate ?? "auto"}|${renderPixelRatio}`;
  const documentKey = `${docKey}|${resolvedFile ?? ""}`;
  const {
    mountedPages,
    onPageSettled,
    notePageVisited,
    hasUnsettledPages,
    stats: mountStats,
  } = useMountPlan({
    active: viewMode === "scroll" && numPages > 0,
    visible: visibleWindow,
    numPages,
    overscan: firstPagePainted ? overscan : 0,
    direction,
    online: connectivity.mayFetch,
    maxConcurrent: READER_BUDGETS.MAX_CONCURRENT_PREFETCH,
    geometryKey,
    documentKey,
  });
  useEffect(() => {
    hasUnsettledPagesRef.current = hasUnsettledPages;
  }, [hasUnsettledPages]);
  /** Spacer heights, including any gap inside the mounted set — the plan is a
      SET of pages, not a span, so two runs can be separated. */
  const spacerBefore = mountedPages.length ? (mountedPages[0] - 1) * rowHeight : 0;
  const spacerAfter = mountedPages.length ? (numPages - mountedPages[mountedPages.length - 1]) * rowHeight : 0;

  /* Release pdf.js's worker-side caches (decoded images, fonts, xref) once
     rendering has been idle. Keyed on the mounted set + geometry, so the timer
     restarts on any render activity and never fires mid-render. */
  useIdleDocumentCleanup({
    pdf: pdfDoc,
    activityKey: `${documentKey}|${geometryKey}|${mountedPages.join(",")}`,
    enabled: !!pdfDoc,
  });

  /* ── Announcements ──────────────────────────────────────────── */
  const announce = useCallback((msg: string) => {
    window.clearTimeout(statusTimerRef.current);
    // small debounce so rapid wheel/pinch steps announce once, not per step
    statusTimerRef.current = window.setTimeout(() => setStatusMessage(msg), 250);
  }, []);
  useEffect(() => () => window.clearTimeout(statusTimerRef.current), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (numPages > 0) setPageAnnouncement(t("pageIndicator", { current: fmt(currentPage), total: fmt(numPages) }));
  }, [currentPage, numPages, t, fmt]);

  /* ── Navigation ─────────────────────────────────────────────── */
  const beginProgrammaticScroll = useCallback((target: number, safetyMs = 1500) => {
    programmaticScroll.current = true;
    programmaticTargetRef.current = target;
    window.clearTimeout(progScrollTimer.current);
    // Safety net only: a scroll interrupted by the reader never "arrives".
    progScrollTimer.current = window.setTimeout(() => {
      programmaticScroll.current = false;
      programmaticTargetRef.current = null;
    }, safetyMs);
  }, []);
  const navigateToPage = useCallback((val: number) => {
    const target = clamp(1, numPagesRef.current || 1, val);
    setDirection(readingDirection(currentPageRef.current, target));
    currentPageRef.current = target;
    setCurrentPage(target);
    setResumePrompt(null);
    if (geomRef.current.viewMode === "scroll") {
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const top = rowTop(target, geomRef.current.rowHeight, HUD_INSET_TOP);
      beginProgrammaticScroll(top);
      requestAnimationFrame(() => {
        const el = containerRef.current;
        if (!el) return;
        el.scrollTo({ top, behavior: prefersReduced ? "auto" : "smooth" });
        setScrollTop(top);
      });
    }
  }, [geomRef, beginProgrammaticScroll]);

  const handleViewportScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const nextTop = el.scrollTop;
      setScrollTop(nextTop);
      if (programmaticScroll.current) {
        const target = programmaticTargetRef.current;
        const maxTop = el.scrollHeight - el.clientHeight;
        // Arrived (or the target lies beyond the end and we are at the end).
        if (target !== null && (Math.abs(nextTop - target) <= 1 || (target > maxTop && nextTop >= maxTop - 1))) {
          programmaticScroll.current = false;
          programmaticTargetRef.current = null;
          window.clearTimeout(progScrollTimer.current);
        }
        return;
      }
      if (geomRef.current.viewMode !== "scroll" || !numPagesRef.current) return;
      // At the very end of the document the last row cannot reach the 35%
      // line (it is shorter than the viewport), so the end IS the last page.
      const atEnd = nextTop >= el.scrollHeight - el.clientHeight - 1;
      const next = atEnd
        ? numPagesRef.current
        : pageAtScroll(nextTop, el.clientHeight, geomRef.current.rowHeight, numPagesRef.current, HUD_INSET_TOP);
      if (next !== currentPageRef.current) {
        setDirection(readingDirection(currentPageRef.current, next));
        currentPageRef.current = next;
        setCurrentPage(next);
      }
    });
  }, [geomRef]);

  useEffect(
    () => () => {
      if (scrollRafRef.current !== null) window.cancelAnimationFrame(scrollRafRef.current);
      window.clearTimeout(progScrollTimer.current);
    },
    [],
  );

  /* ── Progress, search, outline, annotations, selection ──────── */
  const progress = useReaderProgress({
    bookId,
    isLoggedIn,
    ready: pdfDoc !== null,
    numPages,
    currentPage,
    initialProgressPct,
    initialMaxProgressPct,
  });
  const search = useReaderSearch({ pdfRef, docKey, navigate: navigateToPage, currentPageRef });
  const { entries: outline, resolvePage: resolveOutlinePage } = useReaderOutline(pdfDoc);
  const outlineIndex = useMemo(() => currentSectionIndex(outline, currentPage), [outline, currentPage]);
  const sectionFor = useCallback((page: number) => sectionTitleForPage(outline, page), [outline]);
  const notes = useReaderAnnotations({ bookId, isLoggedIn });
  const { popup: selectionPopup, dismiss: dismissSelection } = useSelectionPopup({
    docAreaRef,
    enabled: isLoggedIn,
    currentPageRef,
  });
  useTextLayerA11y(docAreaRef);

  /* ── Exact-page resume (decided on document load) ─────────────
     The device's position is SNAPSHOTTED at mount and applied on load, when
     the real page count is known. Nothing writes the key before load (see
     useReaderProgress), but reading it once, first, is the second guard. */
  useEffect(() => {
    localPositionRef.current = parseLocalPosition(lsGet(READER_KEYS.position(bookId)));
  }, [bookId]);
  const resumeInputs = useLatest({ initialProgressPct, initialProgressAt, isLoggedIn });

  /* ── Measure the viewport (ResizeObserver also catches focus mode
        + panel open/close, not just window resize) ──────────────── */
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
    const update = () => setRenderPixelRatio(clampDpr(window.devicePixelRatio));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
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

  /* ── Zoom (focal point preserved) ───────────────────────────── */
  const zoomFocalRef = useRef<{ x: number; y: number } | null>(null);
  const applyCustomZoom = useCallback(
    (scale: number, focal?: { x: number; y: number }) => {
      const next = clampScale(scale);
      zoomFocalRef.current = focal ?? null;
      setFitMode("custom");
      setZoomScale(next);
      announce(t("zoomAnnounce", { percent: fmt(Math.round(next * 100)) }));
    },
    [announce, fmt, t],
  );
  const applyFitMode = useCallback(
    (mode: "width" | "page") => {
      zoomFocalRef.current = null;
      setFitMode(mode);
      announce(mode === "width" ? t("fitWidth") : t("fitPage"));
    },
    [announce, t],
  );
  const zoomIn = useCallback(() => applyCustomZoom(stepZoom(geomRef.current.effectiveScale, 1)), [applyCustomZoom, geomRef]);
  const zoomOut = useCallback(() => applyCustomZoom(stepZoom(geomRef.current.effectiveScale, -1)), [applyCustomZoom, geomRef]);
  const resetZoom = useCallback(() => applyCustomZoom(1), [applyCustomZoom]);

  // When the committed page width changes, adjust the scroll offsets so the
  // recorded focal point (button = viewport centre, wheel = pointer, pinch =
  // finger midpoint, double-tap = tap) stays put, and drop any live pinch
  // preview now that the real size has landed.
  const prevPageWidthRef = useRef<number | undefined>(undefined);
  const prevRowHeightRef = useRef(rowHeight);
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
    const focal = zoomFocalRef.current ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    zoomFocalRef.current = null;
    el.scrollLeft = (el.scrollLeft + focal.x) * ratio - focal.x;
    el.scrollTop = Math.max(0, (el.scrollTop + focal.y - HUD_INSET_TOP) * ratio + HUD_INSET_TOP - focal.y);
    setScrollTop(el.scrollTop);
    // The row-height effect below must not ALSO re-anchor for this change.
    prevRowHeightRef.current = rowHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageWidth]);

  // When the ROW height changes without the page width moving — page 1's real
  // aspect replacing the A4 placeholder, or a rotation — every row above the
  // reader shifts. Re-anchor the viewport on the page being read, at the same
  // fraction through it, so the position survives (the zoom effect above
  // handles the width-driven case, where content scales around a focal point).
  useEffect(() => {
    const prev = prevRowHeightRef.current;
    prevRowHeightRef.current = rowHeight;
    const el = containerRef.current;
    if (!el || prev === rowHeight || viewMode !== "scroll" || !numPagesRef.current) return;
    const page = currentPageRef.current;
    const within = clamp(0, 1, (el.scrollTop - rowTop(page, prev, HUD_INSET_TOP)) / prev);
    const top = rowTop(page, rowHeight, HUD_INSET_TOP) + within * rowHeight;
    beginProgrammaticScroll(top, 700);
    el.scrollTop = top;
    setScrollTop(top);
  }, [rowHeight, viewMode, beginProgrammaticScroll]);

  /* ── Rotation ───────────────────────────────────────────────── */
  const rotateClockwise = useCallback(() => setRotation((r) => (r + 90) % 360), []);
  const rotationAnnouncedRef = useRef(rotation);
  useEffect(() => {
    if (rotationAnnouncedRef.current === rotation) return;
    rotationAnnouncedRef.current = rotation;
    announce(t("rotationAnnounce", { degrees: fmt(rotation) }));
  }, [rotation, announce, fmt, t]);

  /* ── Theme / view mode / bookmarks ──────────────────────────── */
  const changeTheme = useCallback(
    (next: ReaderTheme) => {
      setTheme(next);
      announce(t(next === "dark" ? "themeDarkEnabled" : "themeLightEnabled"));
    },
    [announce, t],
  );
  const changeViewMode = useCallback(
    (next: ReaderViewMode) => {
      setViewMode((prev) => {
        if (prev === next) return prev;
        if (next === "scroll") {
          const p = currentPageRef.current;
          requestAnimationFrame(() => {
            const el = containerRef.current;
            if (!el) return;
            const top = rowTop(p, geomRef.current.rowHeight, HUD_INSET_TOP);
            el.scrollTo({ top, behavior: "auto" });
            setScrollTop(top);
          });
        }
        return next;
      });
    },
    [geomRef],
  );
  const isBookmarked = bookmarks.includes(currentPage);
  const toggleBookmark = useCallback(() => {
    const p = currentPageRef.current;
    setBookmarks((bm) => (bm.includes(p) ? bm.filter((x) => x !== p) : [...bm, p].sort((a, b) => a - b)));
    announce(t(bookmarks.includes(p) ? "bookmarkRemoved" : "bookmarkAdded"));
  }, [announce, t, bookmarks]);

  /* ── Panel ──────────────────────────────────────────────────── */
  const openPanel = useCallback((tab: PanelTabId) => {
    setPanelTab(tab);
    setPanelOpen(true);
  }, []);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const togglePanel = useCallback(() => setPanelOpen((v) => !v), []);
  const toggleSearch = useCallback(() => {
    if (panelOpen && panelTab === "search") setPanelOpen(false);
    else openPanel("search");
  }, [panelOpen, panelTab, openPanel]);
  useEffect(() => {
    if (!panelOpen || panelTab !== "search") return;
    // After the sheet's own focus management (a macrotask) has settled.
    const id = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(id);
  }, [panelOpen, panelTab]);
  /** On phones the sheet covers the page, so a pick closes it. */
  const afterPick = useCallback(() => {
    if (!isDesktop) setPanelOpen(false);
  }, [isDesktop]);

  /* ── Document callbacks ─────────────────────────────────────── */
  const onDocumentLoadProgress = useCallback(({ total }: { total?: number }) => {
    // `total` is the file route's Content-Length. It is what makes the byte
    // budget per page real rather than a guess.
    if (typeof total === "number" && total > 0) setDocBytes(total);
  }, []);
  const onDocumentLoadSuccess = (pdf: PdfDocumentProxy) => {
    pdfRef.current = pdf;
    setPdfDoc(pdf);
    setLoadErrorKind(null);
    setNumPages(pdf.numPages);
    numPagesRef.current = pdf.numPages; // fresh for navigateToPage below
    // A reload to recover from an outage must land the reader back where they
    // were, not re-run resume and not apologise with "Welcome back".
    if (reloadForRecoveryRef.current) {
      reloadForRecoveryRef.current = false;
      const keep = clamp(1, pdf.numPages, currentPageRef.current);
      initialScrollDoneRef.current = true;
      requestAnimationFrame(() => {
        const el = containerRef.current;
        if (!el || geomRef.current.viewMode !== "scroll") return;
        const top = rowTop(keep, geomRef.current.rowHeight, HUD_INSET_TOP);
        beginProgrammaticScroll(top, 700);
        el.scrollTop = top;
        setScrollTop(top);
      });
      return;
    }
    const local = localPositionRef.current ?? parseLocalPosition(lsGet(READER_KEYS.position(bookId)));
    const fromLocal = resolveResumePage({
      local,
      serverPct: resumeInputs.current.initialProgressPct,
      serverAt: serverTimestamp(resumeInputs.current.initialProgressAt),
      isLoggedIn: resumeInputs.current.isLoggedIn,
      numPages: pdf.numPages,
    });
    // The server stores a percentage. Re-derive the page from the REAL page
    // count now that it is known — the `pages` column the placeholder used
    // is metadata and can disagree with the file (a 12-page file recorded as
    // 320 pages resumed at "page 320", clamped to the end of the book).
    const serverPct = resumeInputs.current.initialProgressPct;
    let target = serverPct > 0 ? pageFromPercent(serverPct, pdf.numPages) : 1;
    if (fromLocal) target = fromLocal;
    if (target !== currentPageRef.current) {
      currentPageRef.current = target;
      setCurrentPage(target);
    }
    // Position explicitly (next frame, after the spacers commit) and suppress
    // the layout-ready initial scroll so it cannot fight this. The scroll
    // event this raises must not be read back as a page change.
    initialScrollDoneRef.current = true;
    requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el || geomRef.current.viewMode !== "scroll") return;
      const top = rowTop(target, geomRef.current.rowHeight, HUD_INSET_TOP);
      beginProgrammaticScroll(top, 700);
      el.scrollTop = top;
      setScrollTop(top);
    });
    progress.markMaxProgressForPage(target, pdf.numPages);
    if (shouldOfferContinue(target)) setResumePrompt(target);
    const durationMs = elapsed();
    if (durationMs > 8000) reportReaderEvent("pdf_load_slow", { durationMs });
  };
  const onDocumentLoadError = (error: Error) => {
    const kind = classifyPdfError(error);
    setLoadErrorKind(kind);
    // A transient failure (offline, 429, 5xx) starts the reconnect machine,
    // which retries on its own schedule instead of leaving a dead screen.
    connectivity.reportLoadFailure(kind);
    reportReaderEvent("pdf_load_error", { message: error.message, kind, bytes: docBytes ?? undefined });
  };
  const onPageRenderError = useCallback(
    (page: number, error: Error) => {
      const kind = classifyPdfError(error);
      onPageSettled(page, false);
      // A render can fail because the bytes never arrived, not because the
      // page is bad; those failures belong to the connectivity machine too.
      connectivity.reportLoadFailure(kind);
      reportReaderEvent("pdf_render_error", { page, message: error.message, kind });
    },
    [reportReaderEvent, onPageSettled, connectivity],
  );
  /** A page's BYTES could not be fetched — the failure a network outage
      produces, and the one that used to be invisible: react-pdf showed its
      own English "Failed to load the page." forever, nothing was reported,
      and pdf.js's stream manager was left with a chunk it would never retry. */
  const onPageLoadError = useCallback(
    (page: number, error: Error) => {
      const kind = classifyPdfError(error);
      onPageSettled(page, false);
      connectivity.reportLoadFailure(kind);
      reportReaderEvent("page_load_error", { page, message: error.message, kind });
    },
    [connectivity, reportReaderEvent, onPageSettled],
  );
  const onPageRendered = useCallback(
    (page: number) => {
      onPageSettled(page, true);
      onFirstPagePainted();
    },
    [onPageSettled, onFirstPagePainted],
  );
  /* Single-page mode has one <Page>; its handlers read the page from a ref so
     they are stable, which keeps react-pdf's own render effect from re-running
     on every parent render. */
  const onSinglePageRendered = useCallback(() => {
    setSinglePageReady(true);
    onPageRendered(currentPageRef.current);
  }, [onPageRendered]);
  const onSinglePageRenderError = useCallback(
    (error: Error) => onPageRenderError(currentPageRef.current, error),
    [onPageRenderError],
  );
  const onSinglePageLoadError = useCallback(
    (error: Error) => onPageLoadError(currentPageRef.current, error),
    [onPageLoadError],
  );
  const onFirstPageLoad = (page: { originalWidth?: number; originalHeight?: number; width: number; height: number; rotate?: number }) => {
    const w = page.originalWidth ?? page.width;
    const h = page.originalHeight ?? page.height;
    if (!w || !h) return;
    arMeasuredRef.current = true;
    setAspectRatio(h / w);
    setNativeWidth(w);
    if (typeof page.rotate === "number") setInherentRotate(((page.rotate % 360) + 360) % 360);
    lsSet(READER_KEYS.aspect(bookId), (h / w).toFixed(4));
    lsSet(READER_KEYS.nativeWidth(bookId), String(Math.round(w)));
  };
  useEffect(() => {
    initialScrollDoneRef.current = false;
  }, [docKey, pdfUrl]);
  useEffect(() => {
    if (viewMode !== "scroll" || !numPages || !pageWidth || initialScrollDoneRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const top = rowTop(currentPageRef.current, rowHeight, HUD_INSET_TOP);
    el.scrollTop = top;
    setScrollTop(top);
    initialScrollDoneRef.current = true;
  }, [numPages, pageWidth, rowHeight, viewMode]);
  useEffect(
    () => () => {
      const pdf = pdfRef.current;
      pdfRef.current = null;
      void pdf?.destroy?.();
    },
    [],
  );
  const retry = useCallback(() => {
    setLoadErrorKind(null);
    setDocKey((k) => k + 1);
  }, []);

  /* ── Highlight renderer (search marks + annotations) ────────── */
  const highlight = useCallback(
    (item: { str: string; itemIndex: number }, pageNumber: number) => {
      const nStr = nfc(item.str);
      const decorations: ItemDecoration[] = [];
      // Annotation highlights first (lowest priority — search marks win on overlap).
      const lower = nStr.toLowerCase();
      for (const ann of notes.annotations) {
        if (ann.page_number !== pageNumber) continue;
        const needle = nfc(ann.selected_text).slice(0, 40).toLowerCase();
        if (needle.length < 3) continue;
        let from = 0;
        for (;;) {
          const at = lower.indexOf(needle, from);
          if (at === -1) break;
          decorations.push({ start: at, end: at + needle.length, cls: `ann-${ann.highlight_color}` });
          from = at + needle.length;
        }
      }
      const pageMatches = search.matchesByPage.get(pageNumber);
      if (pageMatches) {
        for (const m of pageMatches) {
          for (const s of m.spans) {
            if (s.itemIndex !== item.itemIndex) continue;
            decorations.push({
              start: s.start,
              end: s.end,
              cls: m.idx === search.currentMatch ? "ebook-mark ebook-mark-current" : "ebook-mark",
            });
          }
        }
      }
      return renderItemHtml(nStr, decorations);
    },
    [notes.annotations, search.matchesByPage, search.currentMatch],
  );
  const textRendererFor = useCallback(
    (p: number) =>
      search.matchesByPage.has(p) || notes.annotatedPages.has(p)
        ? (item: { str: string; itemIndex: number }) => highlight(item, p)
        : undefined,
    [search.matchesByPage, notes.annotatedPages, highlight],
  );

  // Bring the active match into view once its text layer has rendered.
  // Scrolls ONLY the viewer's own viewport (never window).
  useEffect(() => {
    if (search.currentMatch < 0) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const el = containerRef.current;
      const mark = el?.querySelector<HTMLElement>(".ebook-mark-current");
      if (el && mark) {
        const mr = mark.getBoundingClientRect();
        const cr = el.getBoundingClientRect();
        if (mr.top < cr.top + HUD_INSET_TOP + 16 || mr.bottom > cr.bottom - HUD_INSET_BOTTOM - 16) {
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
  }, [search.currentMatch]);

  /* ── Annotation actions ─────────────────────────────────────── */
  const saveHighlight = useCallback(
    async (note: string) => {
      if (!selectionPopup) return;
      const ok = await notes.add(selectionPopup.page, selectionPopup.text, note, annotationColor);
      if (ok) {
        window.getSelection()?.removeAllRanges();
        dismissSelection();
      } else {
        openPanel("annotations"); // the panel shows the error
      }
    },
    [selectionPopup, notes, annotationColor, dismissSelection, openPanel],
  );

  /* ── Download (presentation gate; the server re-decides) ────── */
  const handleDownload = useCallback(async () => {
    if (downloading || !pdfUrl || !allowDownload) return;
    // Offline the file is already on the device and was already paid for with a
    // signed-in download — bouncing to a login page we cannot load is nonsense.
    if (!isLoggedIn && !offline) {
      window.location.href = `/auth/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    setDownloading(true);
    try {
      if (!offline) startTransition(() => { incrementDownloadCount(bookId); });
      const a = document.createElement("a");
      const localHref = (fromCache && resolvedFile) || (pdfUrl.startsWith("blob:") ? pdfUrl : null);
      a.href = localHref ?? pdfUrl;
      a.download = `${title}.pdf`;
      if (!localHref) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      window.setTimeout(() => setDownloading(false), 2000);
    }
  }, [downloading, pdfUrl, allowDownload, isLoggedIn, offline, bookId, fromCache, resolvedFile, title]);

  /* ── Report a problem ───────────────────────────────────────── */
  const reportHref = useMemo(() => {
    if (!reportEmail) return null;
    const { subject, body } = brokenFileReport({ title, bookId, pdfUrl, page: currentPage });
    return `mailto:${reportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [reportEmail, title, bookId, pdfUrl, currentPage]);
  const onReport = useCallback(() => reportReaderEvent("broken_file_report"), [reportReaderEvent]);

  /* ── Overlays, auto-hide, keyboard, gestures, focus mode ────── */
  const overlayOpen = moreOpen || navigatorOpen || settingsOpen || shortcutsOpen || citationOpen;
  const controlsPaused = overlayOpen || panelOpen || !!selectionPopup || resumePrompt !== null;
  const controlsVisible = useAutoHideControls({ enabled: !!pdfUrl, paused: controlsPaused, rootRef });

  // Topmost first. The welcome-back card is a passive status, so it yields
  // to everything that is actually modal.
  const onEscape = useCallback((): boolean => {
    if (selectionPopup) { dismissSelection(); return true; }
    if (panelOpen) { setPanelOpen(false); return true; }
    if (focusMode) { setFocusMode(false); return true; }
    if (resumePrompt !== null) { setResumePrompt(null); return true; }
    return false;
  }, [selectionPopup, dismissSelection, panelOpen, resumePrompt, focusMode]);
  const onAction = useCallback(
    (action: Exclude<ReaderAction, "escape">) => {
      const p = currentPageRef.current;
      switch (action) {
        case "nextPage": navigateToPage(p + 1); break;
        case "prevPage": navigateToPage(p - 1); break;
        case "firstPage": navigateToPage(1); break;
        case "lastPage": navigateToPage(numPagesRef.current); break;
        case "zoomIn": zoomIn(); break;
        case "zoomOut": zoomOut(); break;
        case "resetZoom": resetZoom(); break;
        case "focusMode": setFocusMode((v) => !v); break;
        case "rotate": rotateClockwise(); break;
        case "search": openPanel("search"); requestAnimationFrame(() => searchInputRef.current?.focus()); break;
        case "bookmark": toggleBookmark(); break;
        case "shortcuts": setShortcutsOpen(true); break;
      }
    },
    [navigateToPage, zoomIn, zoomOut, resetZoom, rotateClockwise, openPanel, toggleBookmark],
  );
  useReaderKeyboard(useLatest({ overlayOpen, onEscape, focusMode, rootRef, onAction }));
  useReaderGestures({
    docAreaRef,
    containerRef,
    gestureLayerRef,
    latest: useLatest({
      effectiveScale,
      fitWidthScale,
      fitMode,
      viewMode,
      currentPage,
      commitZoom: applyCustomZoom,
      fitWidth: () => applyFitMode("width"),
      navigate: navigateToPage,
    }),
  });
  useFocusModeTrap({ active: focusMode, rootRef, viewportRef: containerRef });
  useEffect(() => {
    numPagesRef.current = numPages;
  }, [numPages]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSinglePageReady(false);
  }, [currentPage, pageWidth, pageRotate, renderPixelRatio, docKey]);

  /* One session summary at teardown: how well the prefetcher did and how many
     pages were ever mounted at once. Counts only — see lib/reader/telemetry. */
  useEffect(() => {
    if (offline) return;
    const flush = () => {
      const s = mountStats();
      if (s.hits + s.misses === 0) return;
      reportReaderEvent("reader_session", {
        prefetchHits: s.hits,
        prefetchMisses: s.misses,
        maxMounted: s.maxMounted,
      });
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [offline, mountStats, reportReaderEvent]);

  /* Prefetch hit/miss: was the page the reader moved to already fetched? */
  const visitedRef = useRef(0);
  useEffect(() => {
    if (!numPages || currentPage === visitedRef.current) return;
    visitedRef.current = currentPage;
    notePageVisited(currentPage);
  }, [currentPage, numPages, notePageVisited]);

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

  /* ── Panel tabs + More menu (data, not JSX duplicated per layout) ── */
  const panelTabs: PanelTab[] = [
    { id: "pages", label: t("pagesTab"), icon: <LayoutGrid className="h-4 w-4" aria-hidden /> },
    { id: "outline", label: t("outline"), icon: <List className="h-4 w-4" aria-hidden /> },
    { id: "bookmarks", label: t("bookmarks"), icon: <Bookmark className="h-4 w-4" aria-hidden /> },
    { id: "search", label: t("search"), icon: <SearchIcon className="h-4 w-4" aria-hidden /> },
    ...(isLoggedIn ? [{ id: "annotations" as const, label: t("highlightsTab"), icon: <PenLine className="h-4 w-4" aria-hidden /> }] : []),
  ];
  const moreItems: MoreMenuItem[] = [
    { id: "search", label: t("searchThisBook"), icon: <SearchIcon className="h-4 w-4" />, onSelect: () => openPanel("search") },
    { id: "contents", label: t("outline"), icon: <List className="h-4 w-4" />, onSelect: () => openPanel("outline") },
    "separator",
    { id: "single", label: t("singleMode"), icon: <Square className="h-4 w-4" />, role: "menuitemradio", checked: viewMode === "single", onSelect: () => changeViewMode("single") },
    { id: "scroll", label: t("scrollMode"), icon: <AlignJustify className="h-4 w-4" />, role: "menuitemradio", checked: viewMode === "scroll", onSelect: () => changeViewMode("scroll") },
    { id: "rotate", label: t("rotateCw"), icon: <RotateCw className="h-4 w-4" />, onSelect: rotateClockwise, trailing: rotation ? `${fmt(rotation)}°` : undefined },
    { id: "dark", label: t("themeDark"), icon: <Moon className="h-4 w-4" />, role: "menuitemcheckbox", checked: theme === "dark", onSelect: () => changeTheme(theme === "dark" ? "light" : "dark") },
    "separator",
    ...(isLoggedIn && numPages > 0
      ? [{ id: "save", label: progress.isSaved ? t("saved") : t("save"), icon: <Save className="h-4 w-4" />, disabled: progress.isSaved, onSelect: progress.saveNow } as MoreMenuItem]
      : []),
    ...(citation ? [{ id: "cite", label: t("citeThisBook"), icon: <Quote className="h-4 w-4" />, onSelect: () => setCitationOpen(true) } as MoreMenuItem] : []),
    ...(allowDownload
      ? [{
          id: "download",
          label: !isLoggedIn && !offline ? t("signInToDownload") : downloading ? t("opening") : t("download"),
          icon: !isLoggedIn && !offline ? <LogIn className="h-4 w-4" /> : <Download className="h-4 w-4" />,
          disabled: downloading,
          onSelect: handleDownload,
        } as MoreMenuItem]
      : []),
    ...(fullReaderHref ? [{ id: "full", label: t("readOnline"), icon: <ExternalLink className="h-4 w-4" />, href: fullReaderHref } as MoreMenuItem] : []),
    "separator",
    { id: "focus", label: t("focusMode"), icon: focusMode ? <Eye className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />, role: "menuitemcheckbox", checked: focusMode, onSelect: () => setFocusMode((v) => !v) },
    { id: "settings", label: t("readerSettings"), icon: <Settings2 className="h-4 w-4" />, onSelect: () => setSettingsOpen(true) },
    { id: "shortcuts", label: t("keyboardShortcuts"), icon: <Keyboard className="h-4 w-4" />, onSelect: () => setShortcutsOpen(true) },
    ...(reportHref ? [{ id: "report", label: t("reportProblem"), icon: <Flag className="h-4 w-4" />, href: reportHref, onSelect: onReport } as MoreMenuItem] : []),
  ];

  const badge = connectivity.badge(fromCache) ?? (isOffline ? ("offline" as const) : null);
  const showTransition = viewMode === "single" && pageTransition === "auto";

  const panelBody =
    panelTab === "pages" ? (
      <ThumbnailsPanel
        pdf={pdfDoc}
        numPages={numPages}
        currentPage={currentPage}
        pageAspect={effAspect}
        rotate={pageRotate}
        pageColors={pageColors}
        onSelect={(p) => { navigateToPage(p); afterPick(); }}
        fmtNum={fmt}
        pageLabel={t("page")}
        loadingLabel={t("loading")}
      />
    ) : panelTab === "outline" ? (
      <ReaderOutline
        entries={outline}
        currentIndex={outlineIndex}
        fmt={fmt}
        onSelect={(entry: FlatOutlineEntry) => {
          void resolveOutlinePage(entry).then((p) => {
            if (p) navigateToPage(p);
          });
          afterPick();
        }}
      />
    ) : panelTab === "bookmarks" ? (
      <ReaderBookmarks
        bookmarks={bookmarks}
        currentPage={currentPage}
        sectionFor={sectionFor}
        onSelect={(p) => { navigateToPage(p); afterPick(); }}
        onRemove={(p) => setBookmarks((bm) => bm.filter((x) => x !== p))}
        onAddCurrent={toggleBookmark}
        fmt={fmt}
      />
    ) : panelTab === "search" ? (
      <ReaderSearchPanel
        inputRef={searchInputRef}
        input={search.input}
        onInputChange={search.onInputChange}
        onSubmit={search.submit}
        onClear={search.clear}
        query={search.query}
        hits={search.hits}
        totalMatches={search.matchPages.length}
        currentMatch={search.currentMatch}
        searching={search.searching}
        onPrev={() => search.goToMatch(search.currentMatch - 1)}
        onNext={() => search.goToMatch(search.currentMatch + 1)}
        onSelectHit={(h) => { search.goToMatch(h.firstMatch); afterPick(); }}
        fmt={fmt}
      />
    ) : (
      <ReaderAnnotations
        annotations={notes.annotations}
        loading={notes.loading}
        error={notes.error}
        pendingDelete={notes.pendingDelete}
        onSelect={(p) => { navigateToPage(p); afterPick(); }}
        onRemove={notes.remove}
        fmt={fmt}
      />
    );

  return (
    <>
      {/* Live regions for screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">{pageAnnouncement}</div>
      <div aria-live="polite" aria-atomic="true" className="sr-only">{statusMessage}</div>

      <div
        ref={rootRef}
        data-reader-root
        data-focus-mode={focusMode || undefined}
        className={cx(
          // `relative` only outside focus mode: two position utilities on one
          // element and the stylesheet order decides — `fixed` lost.
          "ptec-reader flex flex-col overflow-hidden",
          theme === "dark" && "reader-dark",
          focusMode
            ? "fixed inset-0 z-[9999]"
            : layout === "fill"
              ? "relative h-full min-h-0 flex-1"
              : "relative rounded-lg border border-divider shadow-sm",
        )}
        style={{
          backgroundColor: themeColors.viewerBackground,
          ["--reader-inset-top" as string]: `${HUD_INSET_TOP}px`,
          ["--reader-inset-bottom" as string]: `${HUD_INSET_BOTTOM}px`,
        }}
        role={focusMode ? "dialog" : undefined}
        aria-modal={focusMode ? true : undefined}
        aria-label={focusMode ? t("readerLabel", { title }) : undefined}
      >
        <div
          ref={docAreaRef}
          className={cx("relative min-h-0 w-full flex-1", layout === "embedded" && !focusMode && "h-[76vh] min-h-[560px] flex-none")}
        >
          <ReaderTopBar
            visible={controlsVisible}
            title={title}
            backHref={backHref}
            onClose={onClose}
            currentPage={currentPage}
            numPages={numPages}
            onOpenNavigator={() => setNavigatorOpen(true)}
            isBookmarked={isBookmarked}
            onToggleBookmark={toggleBookmark}
            theme={theme}
            onToggleTheme={() => changeTheme(theme === "dark" ? "light" : "dark")}
            panelOpen={panelOpen}
            onTogglePanel={togglePanel}
            searchOpen={panelOpen && panelTab === "search"}
            onToggleSearch={toggleSearch}
            badge={badge}
            focusMode={focusMode}
            onExitFocus={() => setFocusMode(false)}
            more={<ReaderMoreMenu items={moreItems} open={moreOpen} onOpenChange={setMoreOpen} />}
            fmt={fmt}
          />

          <div className="flex h-full">
            {isDesktop && (
              <ReaderPanel open={panelOpen} tab={panelTab} tabs={panelTabs} onSelectTab={setPanelTab} onClose={closePanel} isDesktop>
                {panelBody}
              </ReaderPanel>
            )}

            {/* Scroll viewport */}
            <div
              ref={containerRef}
              className="reader-viewport relative h-full min-w-0 flex-1 overflow-auto"
              // pan-x too: zoomed pages overflow horizontally and must stay
              // pannable on touch. Browser pinch-zoom stays disabled, so the
              // custom pinch handler keeps receiving the events.
              style={{ touchAction: "pan-x pan-y" }}
              onScroll={handleViewportScroll}
              // Scrollable region must be keyboard-reachable; arrows/PageUp/
              // PageDown turn pages via the window keydown handler.
              tabIndex={0}
              role="region"
              aria-label={`${title} — ${t("documentArea")}`}
            >
              <div ref={gestureLayerRef}>
                <Document
                  key={docKey}
                  file={resolvedFile ?? undefined}
                  options={PDF_DOCUMENT_OPTIONS}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadProgress={onDocumentLoadProgress}
                  onLoadError={onDocumentLoadError}
                  onSourceError={onDocumentLoadError}
                  loading={
                    <div style={{ paddingTop: HUD_INSET_TOP + 16, paddingBottom: HUD_INSET_BOTTOM + 16 }} className="px-4">
                      <ReaderLoadingState width={pageWidth} height={estHeight} theme={theme} />
                    </div>
                  }
                  error={
                    <div style={{ paddingTop: HUD_INSET_TOP, paddingBottom: HUD_INSET_BOTTOM }}>
                      <ReaderErrorState
                        kind={loadErrorKind ?? "unknown"}
                        offline={isOffline && !fromCache}
                        theme={theme}
                        onRetry={retry}
                        retrying={false}
                        reportHref={reportHref}
                        onReport={onReport}
                        backHref={backHref}
                      />
                    </div>
                  }
                >
                  {viewMode === "scroll" ? (
                    <div className="flex flex-col" style={{ paddingTop: HUD_INSET_TOP, paddingBottom: HUD_INSET_BOTTOM }}>
                      {spacerBefore > 0 && <div style={{ height: spacerBefore }} aria-hidden />}
                      {mountedPages.map((p, i) => {
                        // The plan is a set, not a span: a page evicted from
                        // between two runs leaves a gap that has to keep its
                        // height, or every row below it jumps.
                        const gap = i > 0 ? (p - mountedPages[i - 1] - 1) * rowHeight : 0;
                        return (
                          <Fragment key={p}>
                            {gap > 0 && <div style={{ height: gap }} aria-hidden />}
                            <ReaderPage
                              pageNumber={p}
                              width={pageWidth}
                              estHeight={estHeight}
                              rotate={pageRotate}
                              pageColors={pageColors}
                              frameClass={frameClass}
                              placeholderClass={placeholderClass}
                              devicePixelRatio={renderPixelRatio}
                              onRenderError={onPageRenderError}
                              onLoadError={onPageLoadError}
                              onRendered={onPageRendered}
                              customTextRenderer={textRendererFor(p)}
                            />
                          </Fragment>
                        );
                      })}
                      {spacerAfter > 0 && <div style={{ height: spacerAfter }} aria-hidden />}
                      {/* capture page-1 geometry once */}
                      {!arMeasuredRef.current && (
                        <div aria-hidden className="pointer-events-none h-px overflow-hidden opacity-0">
                          <Page pageNumber={1} width={1} devicePixelRatio={1} onLoadSuccess={onFirstPageLoad} renderTextLayer={false} renderAnnotationLayer={false} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full" style={{ paddingTop: HUD_INSET_TOP + SCROLL_PAGE_Y / 2, paddingBottom: HUD_INSET_BOTTOM + SCROLL_PAGE_Y / 2 }}>
                      <div key={showTransition ? currentPage : "static"} className={cx(frameClass, showTransition && "reader-page-enter")}>
                        <Page
                          pageNumber={currentPage}
                          width={pageWidth}
                          rotate={pageRotate}
                          pageColors={pageColors}
                          devicePixelRatio={renderPixelRatio}
                          onLoadSuccess={arMeasuredRef.current ? undefined : onFirstPageLoad}
                          onLoadError={onSinglePageLoadError}
                          onRenderError={onSinglePageRenderError}
                          onRenderSuccess={onSinglePageRendered}
                          renderTextLayer
                          renderAnnotationLayer
                          customTextRenderer={textRendererFor(currentPage)}
                          loading={<div style={{ height: estHeight, width: pageWidth }} className={cx("animate-pulse rounded motion-reduce:animate-none", placeholderClass)} />}
                        />
                      </div>
                      {/* Neighbours pre-rendered off-screen for instant page turns — how
                          many depends on the link, and none until the page the reader is
                          looking at has painted AND the link is up. */}
                      {preload.neighbours > 0 && connectivity.mayFetch && singlePageReady && (
                        <div aria-hidden className="pointer-events-none absolute opacity-0" style={{ left: -99999, top: 0 }}>
                          {preload.neighbours >= 2 && currentPage > 1 && (
                            <Page pageNumber={currentPage - 1} width={pageWidth} rotate={pageRotate} pageColors={pageColors} devicePixelRatio={renderPixelRatio} renderTextLayer={false} renderAnnotationLayer={false} />
                          )}
                          {currentPage < numPages && (
                            <Page pageNumber={currentPage + 1} width={pageWidth} rotate={pageRotate} pageColors={pageColors} devicePixelRatio={renderPixelRatio} renderTextLayer={false} renderAnnotationLayer={false} />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Document>
              </div>
            </div>
          </div>

          <ReaderBottomBar
            visible={controlsVisible}
            currentPage={currentPage}
            numPages={numPages}
            onPrev={() => navigateToPage(currentPage - 1)}
            onNext={() => navigateToPage(currentPage + 1)}
            onOpenNavigator={() => setNavigatorOpen(true)}
            progressPct={progress.progressPct}
            maxProgressPct={progress.maxProgressPct}
            zoomPercent={zoomPercent}
            fitMode={fitMode}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onFit={applyFitMode}
            onScale={applyCustomZoom}
            isBookmarked={isBookmarked}
            onToggleBookmark={toggleBookmark}
            panelOpen={panelOpen}
            onTogglePanel={togglePanel}
            focusMode={focusMode}
            fmt={fmt}
          />

          {!isDesktop && (
            <ReaderPanel open={panelOpen} tab={panelTab} tabs={panelTabs} onSelectTab={setPanelTab} onClose={closePanel} isDesktop={false}>
              {panelBody}
            </ReaderPanel>
          )}

          {selectionPopup && isLoggedIn && (
            <ReaderSelectionPopup
              popup={selectionPopup}
              hostWidth={docAreaRef.current?.clientWidth ?? containerWidth ?? 360}
              color={annotationColor}
              onColor={setAnnotationColor}
              saving={notes.saving}
              onHighlight={() => void saveHighlight("")}
              onNote={(note) => void saveHighlight(note)}
              onDismiss={dismissSelection}
            />
          )}

          {resumePrompt !== null && (
            <ReaderContinuePrompt
              page={resumePrompt}
              onContinue={() => setResumePrompt(null)}
              onRestart={() => navigateToPage(1)}
              fmt={fmt}
            />
          )}

          <ReaderPageNavigator
            open={navigatorOpen}
            onClose={() => setNavigatorOpen(false)}
            currentPage={currentPage}
            numPages={numPages}
            onGo={navigateToPage}
            fmt={fmt}
          />
          <ReaderSettings
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            theme={theme}
            onTheme={changeTheme}
            viewMode={viewMode}
            onViewMode={changeViewMode}
            fitMode={fitMode}
            onFit={applyFitMode}
            onScale={applyCustomZoom}
            zoomPercent={zoomPercent}
            pageTransition={pageTransition}
            onPageTransition={setPageTransition}
            focusMode={focusMode}
            onFocusMode={setFocusMode}
            fmt={fmt}
          />
          <ReaderShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
          {citation && (
            <ReaderCitation open={citationOpen} onClose={() => setCitationOpen(false)} source={citation} page={currentPage} fmt={fmt} />
          )}
        </div>
      </div>
    </>
  );
}
