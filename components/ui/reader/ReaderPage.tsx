"use client";

import { memo } from "react";
import { Page } from "react-pdf";
import { SCROLL_PAGE_Y } from "@/lib/reader/geometry";

export type PageColors = { background: string; foreground: string };

/* One page inside continuous-scroll mode. The parent virtualiser mounts only
   a small moving window, so every mounted page is intentionally rendered.
   Dark mode arrives via pdf.js's own pageColors recolour API (through
   react-pdf), NOT a CSS invert filter — images keep a usable appearance and
   highlights/links/text selection are untouched. */
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
  onRenderSuccess,
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
  onRenderError?: (error: Error) => void;
  /** Fired when this page's canvas is actually painted. */
  onRenderSuccess?: () => void;
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
          onRenderError={onRenderError}
          onRenderSuccess={onRenderSuccess}
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
