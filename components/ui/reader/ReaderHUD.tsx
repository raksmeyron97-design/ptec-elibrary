"use client";

import { memo, type ReactNode } from "react";
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Moon,
  PanelLeft,
  RefreshCw,
  Search as SearchIcon,
  Sun,
  WifiOff,
  X,
  CheckCircle2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import ZoomControl from "./ZoomControl";
import type { ReaderFitMode, ReaderTheme } from "./reader-config";

/* The reader HUD: a top bar and a bottom bar overlaid on the document.
   Both are `[data-reader-hud]` (the auto-hide hook pauses while the pointer
   or focus is inside one) and go `inert` when hidden, so an invisible control
   can never receive focus. Phones get the compact layout from the design:

     ‹   42 / 245   ⋯            (top)
     🔖   −  100%  +   ☰         (bottom)

   Desktop:

     ← Back   Title …   ✓ offline  ☾  🔖  ⋯        (top)
     ◀ 12 / 245 ▶   ━━━━━━━━ 52%   [− 100% ▾ +]    (bottom) */

type Fmt = (n: number | string) => string;

export type ReaderTopBarProps = {
  visible: boolean;
  title: string;
  backHref?: string;
  onClose?: () => void;
  currentPage: number;
  numPages: number;
  onOpenNavigator: () => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  theme: ReaderTheme;
  onToggleTheme: () => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
  badge: "cached" | "offline" | "reconnecting" | null;
  focusMode: boolean;
  onExitFocus: () => void;
  /** The ⋯ trigger + menu, owned by the parent. */
  more: ReactNode;
  fmt: Fmt;
};

export const ReaderTopBar = memo(function ReaderTopBar(p: ReaderTopBarProps) {
  const t = useTranslations("reader");
  const pageLabel = t("pageIndicator", { current: p.fmt(p.currentPage), total: p.fmt(p.numPages || 0) });
  const leading = p.focusMode ? (
    <button type="button" onClick={p.onExitFocus} className="reader-btn" aria-label={t("exitFocusMode")}>
      <X className="h-5 w-5" aria-hidden />
    </button>
  ) : p.backHref ? (
    <a href={p.backHref} className="reader-btn" aria-label={t("backToBook")}>
      <ArrowLeft className="h-5 w-5" aria-hidden />
      <span className="hidden text-[13px] md:inline">{t("back")}</span>
    </a>
  ) : p.onClose ? (
    <button type="button" onClick={p.onClose} className="reader-btn" aria-label={t("close")}>
      <X className="h-5 w-5" aria-hidden />
    </button>
  ) : null;

  return (
    <div
      data-reader-hud="top"
      role="toolbar"
      aria-label={t("readerLabel", { title: p.title })}
      aria-hidden={!p.visible || undefined}
      inert={!p.visible}
      className={`reader-hud reader-hud--top ${p.visible ? "" : "reader-hud--hidden"}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {leading}
        <h2 title={p.title} className="hidden min-w-0 flex-1 truncate px-1 text-[14px] font-bold md:block">
          {p.title}
        </h2>
        {/* Phones: the page indicator lives up here, centred. */}
        <button
          type="button"
          onClick={p.onOpenNavigator}
          disabled={!p.numPages}
          aria-label={pageLabel}
          className="reader-btn reader-btn--pill mx-auto tabular-nums md:hidden"
        >
          <span className="text-[14px] font-bold">{p.fmt(p.currentPage)}</span>
          <span className="reader-faint text-[12px]">/ {p.fmt(p.numPages || 0)}</span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {p.badge && (
          <span
            // A connection state is a status, not decoration: announced
            // politely so a screen-reader user learns the reader has stopped
            // fetching, and shown on phones too (where the outage is likeliest).
            role={p.badge === "cached" ? undefined : "status"}
            aria-live={p.badge === "cached" ? undefined : "polite"}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              p.badge === "cached" ? "reader-success hidden sm:inline-flex" : "reader-muted"
            }`}
          >
            {p.badge === "cached" ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            ) : p.badge === "reconnecting" ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <WifiOff className="h-3.5 w-3.5" aria-hidden />
            )}
            <span className={p.badge === "cached" ? undefined : "hidden sm:inline"}>
              {p.badge === "cached" ? t("offlineAvailable") : p.badge === "reconnecting" ? t("reconnecting") : t("offlineNow")}
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={p.onToggleSearch}
          aria-pressed={p.searchOpen}
          aria-label={t("searchThisBook")}
          className="reader-btn hidden md:inline-flex"
        >
          <SearchIcon className="h-[18px] w-[18px]" aria-hidden />
        </button>
        <button
          type="button"
          onClick={p.onTogglePanel}
          aria-pressed={p.panelOpen}
          aria-label={t("panelLabel")}
          className="reader-btn hidden md:inline-flex"
        >
          <PanelLeft className="h-[18px] w-[18px]" aria-hidden />
        </button>
        <button
          type="button"
          onClick={p.onToggleTheme}
          aria-label={p.theme === "dark" ? t("themeLight") : t("themeDark")}
          className="reader-btn hidden md:inline-flex"
        >
          {p.theme === "dark" ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={p.onToggleBookmark}
          disabled={!p.numPages}
          aria-pressed={p.isBookmarked}
          aria-label={p.isBookmarked ? t("bookmarkRemove") : t("bookmarkAdd")}
          className="reader-btn hidden md:inline-flex"
        >
          <Bookmark className="h-[18px] w-[18px]" fill={p.isBookmarked ? "currentColor" : "none"} aria-hidden />
        </button>
        {p.more}
      </div>
    </div>
  );
});

export type ReaderBottomBarProps = {
  visible: boolean;
  currentPage: number;
  numPages: number;
  onPrev: () => void;
  onNext: () => void;
  onOpenNavigator: () => void;
  progressPct: number;
  maxProgressPct: number;
  zoomPercent: number;
  fitMode: ReaderFitMode;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: (mode: "width" | "page") => void;
  onScale: (scale: number) => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  focusMode: boolean;
  fmt: Fmt;
};

export const ReaderBottomBar = memo(function ReaderBottomBar(p: ReaderBottomBarProps) {
  const t = useTranslations("reader");
  const pageLabel = t("pageIndicator", { current: p.fmt(p.currentPage), total: p.fmt(p.numPages || 0) });
  const pagesLeft = p.numPages ? Math.max(0, p.numPages - Math.round((p.maxProgressPct / 100) * p.numPages)) : 0;
  return (
    <div
      data-reader-hud="bottom"
      role="toolbar"
      aria-label={t("pageNav")}
      aria-hidden={!p.visible || undefined}
      inert={!p.visible}
      className={`reader-hud reader-hud--bottom ${p.visible ? "" : "reader-hud--hidden"}`}
      style={p.focusMode ? { paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" } : undefined}
    >
      {/* Desktop: prev · page · next */}
      <div className="hidden shrink-0 items-center gap-0.5 md:flex">
        <button type="button" onClick={p.onPrev} disabled={p.currentPage <= 1} aria-label={t("prev")} className="reader-btn">
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={p.onOpenNavigator}
          disabled={!p.numPages}
          aria-label={pageLabel}
          className="reader-btn reader-btn--pill tabular-nums"
        >
          <span className="text-[14px] font-bold">{p.fmt(p.currentPage)}</span>
          <span className="reader-faint text-[12px]">/ {p.fmt(p.numPages || 0)}</span>
        </button>
        <button type="button" onClick={p.onNext} disabled={!p.numPages || p.currentPage >= p.numPages} aria-label={t("next")} className="reader-btn">
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* Desktop: progress */}
      {p.numPages > 0 && (
        <div className="mx-3 hidden min-w-0 flex-1 items-center gap-3 md:flex">
          <div
            role="progressbar"
            aria-label={t("readingProgress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={p.progressPct}
            aria-valuetext={t("percentRead", { percent: p.fmt(p.progressPct) })}
            className="reader-progress min-w-0 flex-1"
          >
            <div className="reader-progress__max" style={{ width: `${p.maxProgressPct}%` }} />
            <div className="reader-progress__now" style={{ width: `${p.progressPct}%` }} />
          </div>
          <span className="reader-muted shrink-0 text-[12px] font-semibold tabular-nums">
            {p.fmt(p.progressPct)}%
            <span className="reader-faint hidden font-normal xl:inline"> · {t("pagesLeft", { count: p.fmt(pagesLeft) })}</span>
          </span>
        </div>
      )}

      {/* Phones: bookmark · zoom · panel */}
      <button
        type="button"
        onClick={p.onToggleBookmark}
        disabled={!p.numPages}
        aria-pressed={p.isBookmarked}
        aria-label={p.isBookmarked ? t("bookmarkRemove") : t("bookmarkAdd")}
        className="reader-btn md:hidden"
      >
        <Bookmark className="h-5 w-5" fill={p.isBookmarked ? "currentColor" : "none"} aria-hidden />
      </button>
      <div className="mx-auto md:hidden">
        <ZoomControl
          percent={p.zoomPercent}
          fitMode={p.fitMode}
          onZoomIn={p.onZoomIn}
          onZoomOut={p.onZoomOut}
          onFit={p.onFit}
          onScale={p.onScale}
          fmtNum={p.fmt}
          compact
        />
      </div>
      <button
        type="button"
        onClick={p.onTogglePanel}
        aria-pressed={p.panelOpen}
        aria-label={t("panelLabel")}
        className="reader-btn md:hidden"
      >
        <PanelLeft className="h-5 w-5" aria-hidden />
      </button>

      {/* Desktop: zoom */}
      <div className="hidden shrink-0 md:block">
        <ZoomControl
          percent={p.zoomPercent}
          fitMode={p.fitMode}
          onZoomIn={p.onZoomIn}
          onZoomOut={p.onZoomOut}
          onFit={p.onFit}
          onScale={p.onScale}
          fmtNum={p.fmt}
        />
      </div>
    </div>
  );
});
