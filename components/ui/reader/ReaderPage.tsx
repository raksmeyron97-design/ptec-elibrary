"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { Page } from "react-pdf";
import { SCROLL_PAGE_Y } from "@/lib/reader/geometry";

export type PageColors = { background: string; foreground: string };

/** The slice of pdf.js's PDFPageProxy this component needs. */
type CleanablePage = { cleanup?: (resetStats?: boolean) => boolean };

/* One page inside continuous-scroll mode. The parent's prefetch planner mounts
   only a small moving window, so every mounted page is intentionally rendered.
   Dark mode arrives via pdf.js's own pageColors recolour API (through
   react-pdf), NOT a CSS invert filter — images keep a usable appearance and
   highlights/links/text selection are untouched.

   CALLBACKS TAKE THE PAGE NUMBER, and the parent's are stable. Passing
   `onRenderSuccess={() => f(p)}` from the parent creates a new function per
   page on every parent render, which defeats this `memo()` — every mounted
   page re-renders whenever anything in the viewer changes — and, because
   react-pdf keys its render effect on the callback identity, can re-fire the
   render callback in a loop.

   MEMORY. Unmounting a page frees its canvas (react-pdf zeroes it) but not
   pdf.js's own retention: `PDFDocumentProxy.getPage()` caches a page proxy for
   the document's life, and each proxy holds its operator list plus every image
   it decoded, in `objs`. On a scanned book that is a full-resolution bitmap per
   page ever visited — bounded by how far the reader scrolled, not by the mount
   window. `page.cleanup()` releases both; pdf.js defers it (returning false)
   while a render task is still winding down, so calling it on unmount is safe
   and the next visit simply re-renders from the bytes already in the stream. */
const ReaderPage = memo(function ReaderPage({
  pageNumber,
  width,
  estHeight,
  rotate,
  pageColors,
  frameClass,
  placeholderClass,
  devicePixelRatio,
  customTextRenderer,
  onRenderError,
  onRendered,
  onLoadError,
}: {
  pageNumber: number;
  width?: number;
  estHeight: number;
  rotate?: number;
  pageColors?: PageColors;
  frameClass: string;
  placeholderClass: string;
  devicePixelRatio: number;
  customTextRenderer?: (item: { str: string; itemIndex: number }) => string;
  onRenderError?: (page: number, error: Error) => void;
  /** Fired when this page's canvas is actually painted. */
  onRendered?: (page: number) => void;
  /** The page's BYTES could not be fetched (a range request failed) — a
      different event from a render failure, and the one a network outage
      produces. react-pdf reports it here and nowhere else. */
  onLoadError?: (page: number, error: Error) => void;
}) {
  const proxyRef = useRef<CleanablePage | null>(null);
  const onLoadSuccess = useCallback((page: unknown) => {
    proxyRef.current = page as CleanablePage;
  }, []);
  const handleRendered = useCallback(() => onRendered?.(pageNumber), [onRendered, pageNumber]);
  const handleRenderError = useCallback((e: Error) => onRenderError?.(pageNumber, e), [onRenderError, pageNumber]);
  const handleLoadError = useCallback((e: Error) => onLoadError?.(pageNumber, e), [onLoadError, pageNumber]);

  useEffect(
    () => () => {
      const proxy = proxyRef.current;
      proxyRef.current = null;
      try {
        proxy?.cleanup?.();
      } catch {
        /* a page mid-render refuses; the idle sweep collects it later */
      }
    },
    [],
  );

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
      <div className={frameClass}>
        <Page
          pageNumber={pageNumber}
          width={width}
          rotate={rotate}
          pageColors={pageColors}
          devicePixelRatio={devicePixelRatio}
          renderTextLayer
          renderAnnotationLayer
          customTextRenderer={customTextRenderer}
          onLoadSuccess={onLoadSuccess}
          onLoadError={handleLoadError}
          onRenderError={handleRenderError}
          onRenderSuccess={handleRendered}
          loading={
            <div
              style={{ height: estHeight, width: width ?? "min(100%, 720px)" }}
              className={`animate-pulse rounded motion-reduce:animate-none ${placeholderClass}`}
            />
          }
        />
      </div>
    </div>
  );
});

export default ReaderPage;
