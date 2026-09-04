"use client";

import { memo, useCallback, useRef, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { MAX_SCALE, MIN_SCALE, ZOOM_PRESETS, parseZoomInput } from "@/lib/reader/zoom";
import type { ReaderFitMode } from "./reader-config";
import ReaderMenu, { MenuRow, MenuSeparator } from "./ReaderMenu";

type ZoomControlProps = {
  /** Effective zoom as a percentage of the page's actual size (100 = actual). */
  percent: number;
  fitMode: ReaderFitMode;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: (mode: "width" | "page") => void;
  /** Apply an explicit scale factor (1 = 100% / actual size). */
  onScale: (scale: number) => void;
  fmtNum: (n: number | string) => string;
  /** Phones: no editable field, the menu opens upward from the bottom bar. */
  compact?: boolean;
};

/* Zoom cluster: [−] [percent ▾] [+]. Buttons step through ZOOM_LEVELS; the
   percent button opens the preset menu (fit width / fit page / 75–200%) and,
   on desktop, a second click on the number edits it (Khmer numerals accepted). */
const ZoomControl = memo(function ZoomControl({
  percent,
  fitMode,
  onZoomIn,
  onZoomOut,
  onFit,
  onScale,
  fmtNum,
  compact = false,
}: ZoomControlProps) {
  const t = useTranslations("reader");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const submitDraft = () => {
    setEditing(false);
    const scale = parseZoomInput(draft);
    if (scale !== null) onScale(scale);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const modeLabel =
    fitMode === "width" ? t("fitWidth") : fitMode === "page" ? t("fitPage") : t("customZoom");

  return (
    <div className="reader-cluster relative">
      <button
        type="button"
        onClick={onZoomOut}
        disabled={percent <= MIN_SCALE * 100}
        aria-label={t("zoomOut")}
        className="reader-btn"
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>

      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={draft}
          aria-label={t("customZoom")}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitDraft();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setEditing(false);
              requestAnimationFrame(() => triggerRef.current?.focus());
            }
          }}
          className="reader-input w-16 text-center text-[13px] font-semibold"
        />
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          onDoubleClick={
            compact
              ? undefined
              : () => {
                  setMenuOpen(false);
                  setDraft(String(percent));
                  setEditing(true);
                  requestAnimationFrame(() => {
                    inputRef.current?.focus();
                    inputRef.current?.select();
                  });
                }
          }
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`${t("zoom")} — ${modeLabel}`}
          className="reader-btn reader-btn--pill min-w-[4.25rem] gap-1"
        >
          <span>{fmtNum(percent)}%</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
        </button>
      )}

      <button
        type="button"
        onClick={onZoomIn}
        disabled={percent >= MAX_SCALE * 100}
        aria-label={t("zoomIn")}
        className="reader-btn"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>

      <ReaderMenu
        open={menuOpen}
        onClose={closeMenu}
        label={t("zoom")}
        triggerRef={triggerRef}
        align="right"
        direction={compact ? "up" : "down"}
        className="min-w-[11rem]"
      >
        <MenuRow role="menuitemradio" checked={fitMode === "width"} onSelect={() => { onFit("width"); closeMenu(true); }}>
          {t("fitWidth")}
        </MenuRow>
        <MenuRow role="menuitemradio" checked={fitMode === "page"} onSelect={() => { onFit("page"); closeMenu(true); }}>
          {t("fitPage")}
        </MenuRow>
        <MenuSeparator />
        {ZOOM_PRESETS.map((level) => {
          const p = Math.round(level * 100);
          return (
            <MenuRow
              key={level}
              role="menuitemradio"
              checked={fitMode === "custom" && percent === p}
              onSelect={() => { onScale(level); closeMenu(true); }}
              trailing={p === 100 ? t("actualSize") : undefined}
            >
              {fmtNum(p)}%
            </MenuRow>
          );
        })}
        <MenuSeparator />
        <MenuRow onSelect={() => { onScale(1); closeMenu(true); }} trailing={<kbd className="reader-kbd">⌘0</kbd>}>
          {t("resetZoom")}
        </MenuRow>
      </ReaderMenu>
    </div>
  );
});

export default ZoomControl;
