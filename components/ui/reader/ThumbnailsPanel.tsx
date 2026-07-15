"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { Document, Page } from "react-pdf";

type PdfDocumentProxy = Parameters<
  NonNullable<ComponentProps<typeof Document>["onLoadSuccess"]>
>[0];

const THUMB_WIDTH = 118;
const THUMB_OVERSCAN = 3;
const LABEL_H = 26;
const ROW_GAP = 10;

type ThumbnailsPanelProps = {
  pdf: PdfDocumentProxy | null;
  numPages: number;
  currentPage: number;
  /** height / width of a page at the current rotation. */
  pageAspect: number;
  rotate?: number;
  pageColors?: { background: string; foreground: string };
  onSelect: (page: number) => void;
  fmtNum: (n: number | string) => string;
  pageLabel: string;
  loadingLabel: string;
};

/* "Pages" sidebar tab: a windowed thumbnail list. Only rows near the panel's
   own viewport are mounted (± THUMB_OVERSCAN), thumbnails render at DPR 1
   with no text/annotation layers, so memory stays flat on 500-page books. */
const ThumbnailsPanel = memo(function ThumbnailsPanel({
  pdf,
  numPages,
  currentPage,
  pageAspect,
  rotate,
  pageColors,
  onSelect,
  fmtNum,
  pageLabel,
  loadingLabel,
}: ThumbnailsPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const rafRef = useRef<number | null>(null);

  const rowHeight = Math.round(THUMB_WIDTH * pageAspect) + LABEL_H + ROW_GAP;

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Open the panel centred on the current page (once per mount). */
  const didInitialScroll = useRef(false);
  useEffect(() => {
    const el = listRef.current;
    if (!el || didInitialScroll.current || !viewportH) return;
    didInitialScroll.current = true;
    const target = Math.max(0, (currentPage - 1) * rowHeight - viewportH / 3);
    el.scrollTop = target;
    setScrollTop(target);
  }, [currentPage, rowHeight, viewportH]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const range = useMemo(() => {
    if (!numPages || !rowHeight) return { start: 1, end: 0 };
    const first = Math.floor(scrollTop / rowHeight) + 1;
    const visible = Math.max(1, Math.ceil((viewportH || 400) / rowHeight));
    return {
      start: Math.max(1, first - THUMB_OVERSCAN),
      end: Math.min(numPages, first + visible + THUMB_OVERSCAN),
    };
  }, [numPages, rowHeight, scrollTop, viewportH]);

  if (!pdf || !numPages) {
    return <p className="p-3 text-xs text-slate-400">{loadingLabel}</p>;
  }

  const rows = [];
  for (let p = range.start; p <= range.end; p++) {
    const active = p === currentPage;
    rows.push(
      <button
        key={p}
        type="button"
        onClick={() => onSelect(p)}
        aria-label={`${pageLabel} ${fmtNum(p)}`}
        aria-current={active ? "page" : undefined}
        className="group/thumb absolute left-1/2 flex -translate-x-1/2 flex-col items-center focus-visible:outline-none"
        style={{ top: (p - 1) * rowHeight, height: rowHeight - ROW_GAP }}
      >
        <span
          className={`overflow-hidden rounded transition ${
            active
              ? "ring-2 ring-cyan-400"
              : "ring-1 ring-white/15 group-hover/thumb:ring-white/40 group-focus-visible/thumb:ring-cyan-400"
          }`}
          style={{ width: THUMB_WIDTH, height: Math.round(THUMB_WIDTH * pageAspect) }}
        >
          <Page
            pdf={pdf}
            pageNumber={p}
            width={THUMB_WIDTH}
            rotate={rotate}
            devicePixelRatio={1}
            pageColors={pageColors}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={<span className="block h-full w-full animate-pulse bg-white/10" />}
            error={<span className="block h-full w-full bg-white/5" />}
          />
        </span>
        <span
          className={`mt-1 text-[11px] font-semibold ${
            active ? "text-cyan-300" : "text-slate-400"
          }`}
        >
          {fmtNum(p)}
        </span>
      </button>,
    );
  }

  return (
    <div
      ref={listRef}
      className="h-full overflow-y-auto"
      onScroll={(e) => {
        const el = e.currentTarget;
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setScrollTop(el.scrollTop);
        });
      }}
    >
      <div className="relative" style={{ height: numPages * rowHeight }}>
        {rows}
      </div>
    </div>
  );
});

export default ThumbnailsPanel;
