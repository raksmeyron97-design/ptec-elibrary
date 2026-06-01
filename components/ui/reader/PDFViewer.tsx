"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import Icon from "@/components/ui/core/Icon";
import { saveReadingProgress } from "@/app/actions/reading-progress";
import { incrementDownloadCount } from "@/app/actions/download";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type PDFViewerProps = {
  title: string;
  pdfUrl?: string | null;
  bookId: string;
  totalPages?: number;
  initialProgressPct?: number;
};

type FitMode = "width" | "page";

export default function PDFViewer({
  title,
  pdfUrl,
  bookId,
  totalPages = 0,
  initialProgressPct = 0,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(totalPages);
  const [currentPage, setCurrentPage] = useState(
    totalPages > 0 ? Math.max(1, Math.round((initialProgressPct / 100) * totalPages)) : 1
  );
  const [scale, setScale] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [saved, setSaved] = useState(initialProgressPct > 0);
  const [downloading, setDownloading] = useState(false);
  const [, startTransition] = useTransition();
  const [containerWidth, setContainerWidth] = useState<number>();
  const [containerHeight, setContainerHeight] = useState<number>();
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Features
  const [fitMode, setFitMode] = useState<FitMode>("width");
  const [pageInputValue, setPageInputValue] = useState(String(currentPage));
  const [isPageInputFocused, setIsPageInputFocused] = useState(false);

  // Swipe state
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // ── Measure container ──────────────────────────────────────────
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [isFullscreen]);

  // ── Sync page input when currentPage changes (and input not focused) ──
  useEffect(() => {
    if (!isPageInputFocused) setPageInputValue(String(currentPage));
  }, [currentPage, isPageInputFocused]);

  // ── No PDF fallback ────────────────────────────────────────────
  if (!pdfUrl) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-divider bg-paper p-8 text-center">
        <Icon name="pdf" className="mb-3 text-5xl text-brand" />
        <h2 className="text-xl font-bold text-text-heading">{title}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-text-body">
          មិនទាន់មានឯកសារ PDF នៅឡើយទេ។
        </p>
      </div>
    );
  }

  const progressPct = numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0;

  // ── Auto-save at 100% ──────────────────────────────────────────
  useEffect(() => {
    if (progressPct === 100 && bookId && numPages > 0 && !saved) {
      setSaved(true);
      startTransition(() => { saveReadingProgress(bookId, 100); });
    }
  }, [progressPct, bookId, numPages, saved]);

  function handleSave() {
    if (!bookId || numPages === 0) return;
    setSaved(true);
    startTransition(() => { saveReadingProgress(bookId, progressPct); });
  }

  function handlePageChange(val: number) {
    const clamped = Math.max(1, Math.min(numPages || 1, val));
    setCurrentPage(clamped);
    setSaved(false);
  }

  function onDocumentLoadSuccess({ numPages: n }: { numPages: number }) {
    setNumPages(n);
    if (currentPage > n) setCurrentPage(n);
  }

  function handleZoomIn() { setScale((p) => Math.min(p + 0.25, 3)); }
  function handleZoomOut() { setScale((p) => Math.max(p - 0.25, 0.5)); }

  function handleFitToggle() {
    setFitMode((m) => (m === "width" ? "page" : "width"));
    setScale(1); // Reset custom scale when toggling fit mode
  }

  // ── Compute page width based on fit mode ───────────────────────
  function getPageWidth(): number | undefined {
    if (!containerWidth) return undefined;
    if (fitMode === "width") {
      // Use full container width minus padding
      return containerWidth - 32;
    }
    // "page" mode: fit to a max width of 900 or container
    return Math.min(containerWidth - 32, 900);
  }

  // ── Keyboard navigation ────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't hijack input fields
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        handlePageChange(currentPage + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        handlePageChange(currentPage - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        handlePageChange(1);
      } else if (e.key === "End") {
        e.preventDefault();
        handlePageChange(numPages);
      }

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setIsFullscreen((v) => !v);
      }
    },
    [currentPage, numPages, isFullscreen]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── Swipe support (single-page mode) ───────────────────────────
  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // Must be horizontal swipe: fast enough, far enough, and mostly horizontal
    if (dt > 500 || Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.7) return;

    if (dx < 0) {
      // Swipe left → next page
      handlePageChange(currentPage + 1);
    } else {
      // Swipe right → prev page
      handlePageChange(currentPage - 1);
    }
  }

  // ── Page input handling ────────────────────────────────────────
  function handlePageInputSubmit() {
    const val = parseInt(pageInputValue, 10);
    if (!isNaN(val)) handlePageChange(val);
    setIsPageInputFocused(false);
  }

  // ── Download handler ───────────────────────────────────────────
  async function handleDownload() {
    if (downloading || !pdfUrl) return;
    setDownloading(true);
    try {
      startTransition(() => { incrementDownloadCount(bookId); });
      const a = document.createElement("a");
      a.href = pdfUrl;
      a.download = `${title}.pdf`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setTimeout(() => setDownloading(false), 2000);
    }
  }

  /* ─────────────────────────────────────────────────────────────────
     TOOLBAR
  ───────────────────────────────────────────────────────────────── */
  const Toolbar = ({ inModal = false }: { inModal?: boolean }) => (
    <div className="flex shrink-0 flex-col gap-2.5 border-white/10 bg-slate-950 px-3 py-2.5 text-white sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:border-b sm:px-4 sm:py-3">
      {/* Title row */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-surface/10 sm:h-10 sm:w-10">
          <Icon name="pdf" className="text-xl text-cyan-100" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold sm:text-base">{title}</h2>
          <p className="text-[11px] text-text-muted sm:text-xs">Read online</p>
        </div>

        {/* Mobile: fullscreen + view-mode toggles */}
        <div className="flex items-center gap-1.5 sm:hidden">
          {/* Open PDF in browser's native viewer */}
          <a
            href={pdfUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/20 text-white transition hover:bg-bg-surface/10"
            title="Open PDF in new tab"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>

          {/* Fullscreen toggle */}
          {!inModal ? (
            <button
              onClick={() => setIsFullscreen(true)}
              aria-label="Fullscreen"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/20 text-white transition hover:bg-bg-surface/10"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => setIsFullscreen(false)}
              aria-label="Exit fullscreen"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/20 text-white transition hover:bg-bg-surface/10"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Control row */}
      <div className="flex items-center justify-between gap-2 sm:flex-wrap sm:justify-end">
        {/* Open PDF in browser — desktop */}
        <div className="hidden items-center gap-1 border-r border-white/20 pr-2 mr-1 sm:flex sm:pr-3 sm:mr-2">
          <a
            href={pdfUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md p-1.5 text-text-muted transition hover:bg-bg-surface/10 hover:text-white"
            title="Open PDF in new tab (native scroll & search)"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span className="text-xs font-semibold">Open PDF</span>
          </a>
        </div>

        {/* Zoom Controls */}
        <div className="hidden items-center gap-1 border-r border-white/20 pr-2 mr-1 sm:flex sm:pr-3 sm:mr-2">
          <button
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className="rounded-md p-1.5 text-text-muted hover:bg-bg-surface/10 hover:text-white disabled:opacity-30"
            title="Zoom out (−)"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          </button>
          <span className="w-10 text-center text-xs font-semibold text-text-muted">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={scale >= 3}
            className="rounded-md p-1.5 text-text-muted hover:bg-bg-surface/10 hover:text-white disabled:opacity-30"
            title="Zoom in (+)"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Fit mode toggle */}
          <button
            onClick={handleFitToggle}
            className={`ml-1 rounded-md p-1.5 transition ${
              fitMode === "width"
                ? "bg-cyan-500/20 text-cyan-300"
                : "text-text-muted hover:bg-bg-surface/10 hover:text-white"
            }`}
            title={fitMode === "width" ? "Fit to width (click for fit to page)" : "Fit to page (click for fit to width)"}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              {fitMode === "width" ? (
                <path d="M21 12H3m6-4L3 12l6 4m6-8l6 4-6 4" />
              ) : (
                <>
                  <rect x="6" y="3" width="12" height="18" rx="1" />
                  <path d="M9 12h6" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Mobile zoom controls */}
        <div className="flex items-center gap-1 sm:hidden">
          <button
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg-surface/10 disabled:opacity-30"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          </button>
          <span className="w-8 text-center text-[11px] font-semibold text-text-muted">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={scale >= 3}
            className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg-surface/10 disabled:opacity-30"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Pagination Controls */}
        {numPages > 0 && (
          <div className="flex items-center gap-1 rounded-md bg-bg-surface/10 px-1.5 py-1 sm:gap-1.5 sm:px-2 sm:py-1.5">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg-surface/10 hover:text-white disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-[11px] text-text-muted hidden sm:inline">Page</span>
            <input
              type="number"
              min={1}
              max={numPages}
              value={isPageInputFocused ? pageInputValue : currentPage}
              onFocus={() => {
                setIsPageInputFocused(true);
                setPageInputValue(String(currentPage));
              }}
              onBlur={() => handlePageInputSubmit()}
              onChange={(e) => setPageInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handlePageInputSubmit();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-10 bg-transparent text-center text-sm font-semibold text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-[11px] text-text-muted sm:text-xs">/ {numPages}</span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= numPages}
              className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg-surface/10 hover:text-white disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* Progress bar — desktop */}
        {numPages > 0 && (
          <div className="hidden items-center gap-2 lg:flex">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-bg-surface/20">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-cyan-300">{progressPct}%</span>
          </div>
        )}

        {/* Download button */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-800 px-2.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60 sm:px-3"
          title="Download PDF"
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
          <span className="hidden md:inline">{downloading ? "Opening…" : "Download"}</span>
        </button>

        {/* Save progress button */}
        {numPages > 0 && (
          <button
            onClick={handleSave}
            disabled={saved}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition sm:px-3 ${
              saved
                ? "bg-emerald-500/20 text-emerald-400 cursor-default"
                : "bg-cyan-500 text-white hover:bg-cyan-400"
            }`}
          >
            {saved ? (
              <>
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Saved
              </>
            ) : (
              <>
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <path d="M17 21v-8H7v8M7 3v5h8" />
                </svg>
                Save
              </>
            )}
          </button>
        )}

        {/* Fullscreen toggle — desktop */}
        {!inModal ? (
          <button
            onClick={() => setIsFullscreen(true)}
            className="hidden h-8 items-center gap-1.5 rounded-md border border-white/20 px-3 text-xs font-semibold text-white transition hover:bg-bg-surface/10 sm:inline-flex"
            title="Fullscreen (F)"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
            <span className="hidden sm:inline">Fullscreen</span>
          </button>
        ) : (
          <button
            onClick={() => setIsFullscreen(false)}
            className="hidden h-8 items-center gap-1.5 rounded-md border border-white/20 px-3 text-xs font-semibold text-white transition hover:bg-bg-surface/10 sm:inline-flex"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            </svg>
            Exit
          </button>
        )}
      </div>

      {/* Mobile progress bar */}
      {numPages > 0 && (
        <div className="flex items-center gap-2 sm:hidden">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-surface/20">
            <div
              className="h-full rounded-full bg-cyan-400 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[11px] font-semibold text-cyan-300">{progressPct}%</span>
        </div>
      )}
    </div>
  );

  const TOOLBAR_H = 56;

  /* ─────────────────────────────────────────────────────────────────
     DOCUMENT AREA
  ───────────────────────────────────────────────────────────────── */
  const DocumentArea = ({ fullscreen = false }: { fullscreen?: boolean }) => (
    <div
      ref={wrapperRef}
      className="group relative w-full overflow-hidden bg-paper"
      style={
        fullscreen
          ? { height: `calc(100vh - ${TOOLBAR_H}px)` }
          : { height: "76vh", minHeight: 560 }
      }
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Side navigation arrows */}
      {numPages > 0 && currentPage > 1 && (
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-slate-900/60 p-2 text-white opacity-0 shadow-lg backdrop-blur transition-all group-hover:opacity-75 hover:!bg-slate-900/90 hover:!opacity-100 active:scale-95 sm:left-4 sm:p-3"
        >
          <svg className="h-6 w-6 sm:h-8 sm:w-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      {numPages > 0 && currentPage < numPages && (
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-slate-900/60 p-2 text-white opacity-0 shadow-lg backdrop-blur transition-all group-hover:opacity-75 hover:!bg-slate-900/90 hover:!opacity-100 active:scale-95 sm:right-4 sm:p-3"
        >
          <svg className="h-6 w-6 sm:h-8 sm:w-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      <div
        ref={containerRef}
        className="h-full w-full overflow-auto flex justify-center py-4 relative"
      >
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex flex-col items-center justify-center gap-3 p-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-divider border-t-brand" />
              <p className="text-sm text-text-muted">កំពុងទាញយកសៀវភៅ...</p>
            </div>
          }
          error={
            <div className="p-10 text-center text-red-500">
              មិនអាចបង្ហាញឯកសារ PDF នេះបានទេ។ សូមពិនិត្យមើល URL ម្តងទៀត។
            </div>
          }
        >
          <div className="shadow-lg transition-transform duration-200">
            <Page
              pageNumber={currentPage}
              scale={scale}
              width={getPageWidth()}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </div>
        </Document>
      </div>

      {/* Keyboard shortcut hint */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-slate-900/70 px-3 py-1.5 text-[10px] text-text-muted opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 sm:text-xs">
        ← → Arrow keys · +/− Zoom · F Fullscreen
      </div>
    </div>
  );

  /* ─────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────── */
  return (
    <>
      <div className="flex flex-col overflow-hidden rounded-lg border border-divider bg-bg-surface shadow-sm">
        <div className="order-2 sm:order-1">
          <Toolbar />
        </div>
        <div className="order-1 sm:order-2">
          <DocumentArea />
        </div>
      </div>

      {isFullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
          <Toolbar inModal />
          <DocumentArea fullscreen />
        </div>
      )}
    </>
  );
}