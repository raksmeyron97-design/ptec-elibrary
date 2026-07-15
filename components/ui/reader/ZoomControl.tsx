"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { MAX_SCALE, MIN_SCALE, ZOOM_LEVELS, parseZoomInput } from "@/lib/reader/zoom";
import type { ReaderFitMode } from "./reader-config";

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
};

/* Unified zoom cluster: [−] [editable %] [mode menu ▾] [+].
   Buttons step through ZOOM_LEVELS presets; the input accepts a typed
   percentage (50–300, clamped, Khmer numerals accepted); the menu offers
   fit modes, presets and reset. */
const ZoomControl = memo(function ZoomControl({
  percent,
  fitMode,
  onZoomIn,
  onZoomOut,
  onFit,
  onScale,
  fmtNum,
}: ZoomControlProps) {
  const t = useTranslations("reader");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const percentButtonRef = useRef<HTMLButtonElement>(null);

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  /* Tap-outside + Escape dismissal, basic arrow-key roving focus. */
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = menuRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        closeMenu();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMenu(true);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [],
      );
      if (!items.length) return;
      e.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "ArrowDown"
          ? items[(at + 1) % items.length]
          : items[(at - 1 + items.length) % items.length];
      next.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menuOpen, closeMenu]);

  useEffect(() => {
    if (!menuOpen) return;
    const id = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [menuOpen]);

  const submitDraft = (restoreFocus = false) => {
    setEditing(false);
    const scale = parseZoomInput(draft);
    if (scale !== null) onScale(scale);
    // invalid input: simply fall back to the live percent display
    if (restoreFocus) {
      requestAnimationFrame(() => percentButtonRef.current?.focus());
    }
  };

  const modeLabel =
    fitMode === "width" ? t("fitWidth") : fitMode === "page" ? t("fitPage") : t("customZoom");

  const row =
    "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-xs text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:bg-white/10";

  return (
    <div className="relative flex items-center gap-0.5 rounded-md bg-bg-surface/10 px-1 py-1">
      <button
        type="button"
        onClick={onZoomOut}
        disabled={percent <= MIN_SCALE * 100}
        aria-label={t("zoomOut")}
        title={t("zoomOut")}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
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
          onBlur={() => submitDraft()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitDraft(true);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setEditing(false);
              requestAnimationFrame(() => percentButtonRef.current?.focus());
            }
          }}
          className="w-12 rounded bg-slate-800 text-center text-[11px] font-semibold text-white outline-none ring-2 ring-cyan-400/60"
        />
      ) : (
        <button
          ref={percentButtonRef}
          type="button"
          onClick={() => {
            setDraft(String(percent));
            setEditing(true);
            requestAnimationFrame(() => {
              inputRef.current?.focus();
              inputRef.current?.select();
            });
          }}
          aria-label={t("customZoom")}
          title={t("customZoom")}
          className="w-12 rounded text-center text-[11px] font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        >
          {fmtNum(percent)}%
        </button>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`${t("zoom")} — ${modeLabel}`}
        title={modeLabel}
        className="inline-flex h-7 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>

      <button
        type="button"
        onClick={onZoomIn}
        disabled={percent >= MAX_SCALE * 100}
        aria-label={t("zoomIn")}
        title={t("zoomIn")}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("zoom")}
          className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-lg border border-white/10 bg-slate-900 p-1.5 shadow-2xl"
        >
          {(["width", "page"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="menuitemradio"
              aria-checked={fitMode === mode}
              onClick={() => {
                onFit(mode);
                closeMenu(true);
              }}
              className={row}
            >
              {mode === "width" ? t("fitWidth") : t("fitPage")}
              {fitMode === mode && <Check className="h-3.5 w-3.5 text-cyan-300" aria-hidden />}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onScale(1);
              closeMenu(true);
            }}
            className={row}
          >
            {t("actualSize")}
            <span className="text-[10px] text-slate-500">{fmtNum(100)}%</span>
          </button>
          <div className="my-1 h-px bg-white/10" aria-hidden />
          {ZOOM_LEVELS.map((level) => {
            const p = Math.round(level * 100);
            const active = fitMode === "custom" && percent === p;
            return (
              <button
                key={level}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onScale(level);
                  closeMenu(true);
                }}
                className={row}
              >
                {fmtNum(p)}%
                {active && <Check className="h-3.5 w-3.5 text-cyan-300" aria-hidden />}
              </button>
            );
          })}
          <div className="my-1 h-px bg-white/10" aria-hidden />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onScale(1);
              closeMenu(true);
            }}
            className={row}
          >
            {t("resetZoom")}
            <kbd className="rounded bg-white/10 px-1 text-[9px] text-slate-400">⌘0</kbd>
          </button>
        </div>
      )}
    </div>
  );
});

export default ZoomControl;
