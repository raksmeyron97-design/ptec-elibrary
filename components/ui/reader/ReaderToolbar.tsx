"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

type ReaderToolbarProps = {
  textSize: number;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onReset: () => void;
  mode: "inline" | "dialog";
  onOpen?: () => void;
  onClose?: () => void;
  announce?: boolean;
  actionButtonRef?: Ref<HTMLButtonElement>;
  /**
   * How much of the control is on show. "full" (the default) is the three-part
   * A− / % / A+ strip; "compact" folds those behind one "Aa" disclosure and is
   * honoured only for `mode="inline"` — a dialog IS the reading surface, so its
   * controls stay out where a reader can reach them in one press.
   *
   * Opt-in on purpose: the thesis abstract reader renders this same inline
   * toolbar and is outside the journal-article redesign.
   */
  variant?: "full" | "compact";
};

type ToolbarButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  compact?: boolean;
  tooltipAlign?: "left" | "center" | "right";
  buttonRef?: Ref<HTMLButtonElement>;
  tooltip?: string;
};

const CONTROL_CLASS =
  "flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-2 text-[14px] font-bold text-text-body transition-[color,background-color,box-shadow] duration-150 hover:bg-brand/8 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg-surface active:bg-brand/12 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-body";

function ToolbarButton({
  label,
  children,
  className = "",
  compact = true,
  tooltipAlign = "center",
  buttonRef,
  tooltip,
  ...props
}: ToolbarButtonProps) {
  const tooltipId = useId();
  const locale = useLocale();
  const tooltipText = tooltip ?? label;
  const tooltipPosition =
    tooltipAlign === "left"
      ? "left-0"
      : tooltipAlign === "right"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  return (
    <span className="group relative inline-flex shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-describedby={tooltipText === label ? undefined : tooltipId}
        title={tooltipText}
        className={`${CONTROL_CLASS} ${compact ? "w-11" : ""} ${className}`}
        {...props}
      >
        {children}
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        lang={locale === "km" ? "km" : undefined}
        className={`pointer-events-none absolute top-[calc(100%+0.45rem)] z-[1100] hidden w-max max-w-52 rounded-md bg-blue-950 px-2 py-1 text-center font-medium text-white shadow-md group-hover:block group-focus-within:block motion-reduce:transition-none ${locale === "km" ? "font-khmer-serif text-[12px] leading-[1.65] tracking-normal" : "text-[11px] leading-snug"} ${tooltipPosition}`}
      >
        {tooltipText}
      </span>
    </span>
  );
}

/**
 * Shared reading controls (text zoom + reset + open/close fullscreen), reused by
 * publication and thesis abstract readers. Strings come from the `abstractReader`
 * namespace so both content types stay in sync in English and Khmer.
 */
export default function ReaderToolbar({
  textSize,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
  onReset,
  mode,
  onOpen,
  onClose,
  announce = true,
  actionButtonRef,
  variant = "full",
}: ReaderToolbarProps) {
  const t = useTranslations("abstractReader");
  const currentSizeLabel = t("currentTextSize", { size: textSize });
  const resetLabel = t("resetTextSize");
  const panelId = `reader-text-size-${useId().replace(/:/g, "")}`;
  const [sizeOpen, setSizeOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const compact = variant === "compact" && mode === "inline";

  // Light dismiss, the two ways a disclosure is expected to close: Escape
  // (focus goes back to the control that opened it, so a keyboard reader is
  // never dropped at the top of the document) and a press outside it.
  useEffect(() => {
    if (!sizeOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setSizeOpen(false);
      triggerRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setSizeOpen(false);
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [sizeOpen]);

  const sizeControls = (
    <>
      <ToolbarButton
        label={t("decreaseTextSize")}
        onClick={onDecrease}
        disabled={!canDecrease}
        tooltipAlign="left"
      >
        <span aria-hidden="true" className="font-sans text-[15px] tracking-[-0.04em]">
          A−
        </span>
      </ToolbarButton>

      <ToolbarButton
        label={`${currentSizeLabel}. ${resetLabel}`}
        onClick={onReset}
        compact={false}
        tooltip={resetLabel}
        className="min-w-[3.75rem] gap-1 px-2 tabular-nums sm:min-w-[5.25rem]"
      >
        <span aria-hidden="true">{textSize}%</span>
        <RotateCcw aria-hidden="true" className="hidden h-3.5 w-3.5 sm:block" />
      </ToolbarButton>

      <ToolbarButton
        label={t("increaseTextSize")}
        onClick={onIncrease}
        disabled={!canIncrease}
      >
        <span aria-hidden="true" className="font-sans text-[15px] tracking-[-0.04em]">
          A+
        </span>
      </ToolbarButton>
    </>
  );

  if (compact) {
    return (
      <div className="relative shrink-0 print:hidden">
        <div
          role="group"
          aria-label={t("toolbarLabel")}
          className="inline-flex max-w-full items-center gap-0.5 rounded-xl border border-[var(--ptec-reader-control-border)] bg-bg-surface p-0.5 shadow-sm"
        >
          {/* Trigger and its panel share a positioning context so the panel
              follows the trigger in the tab order rather than after the
              whole group. */}
          <span className="relative inline-flex">
            <ToolbarButton
              label={t("textSize")}
              onClick={() => setSizeOpen((open) => !open)}
              aria-expanded={sizeOpen}
              aria-controls={panelId}
              buttonRef={triggerRef}
              tooltipAlign="left"
            >
              <span aria-hidden="true" className="font-sans text-[15px] font-bold tracking-[-0.02em]">
                Aa
              </span>
            </ToolbarButton>

            {sizeOpen && (
              <div
                id={panelId}
                ref={popoverRef}
                // Anchored to the trigger's RIGHT edge so it opens inward.
                // Left-anchored it ran off a 390 px screen — the toolbar sits
                // at the right of the text column, so "A+" was past the edge
                // and unreachable on exactly the devices most readers use.
                className="absolute right-0 top-[calc(100%+0.4rem)] z-[1100] w-max rounded-xl border border-[var(--ptec-reader-control-border)] bg-bg-surface p-2 shadow-lg"
              >
                <p className="mb-1 px-1 text-[11.5px] font-bold uppercase tracking-[0.1em] text-text-muted [&:lang(km)]:font-khmer-serif [&:lang(km)]:normal-case [&:lang(km)]:tracking-normal">
                  {t("textSize")}
                </p>
                <div className="flex items-center gap-0.5">{sizeControls}</div>
              </div>
            )}
          </span>

          <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-[var(--ptec-reader-control-border)]" />

          <ToolbarButton
            label={t("open")}
            onClick={onOpen}
            tooltipAlign="right"
            buttonRef={actionButtonRef}
          >
            <Maximize2 aria-hidden="true" className="h-[18px] w-[18px]" />
          </ToolbarButton>
        </div>

        {announce && (
          <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {t("textSizeAnnouncement", { size: textSize })}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative shrink-0 print:hidden">
      <div
        role="group"
        aria-label={t("toolbarLabel")}
        className="inline-flex max-w-full items-center gap-0.5 rounded-xl border border-[var(--ptec-reader-control-border)] bg-bg-surface p-0.5 shadow-sm"
      >
        {sizeControls}

        <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-[var(--ptec-reader-control-border)]" />

        {mode === "inline" ? (
          <ToolbarButton
            label={t("open")}
            onClick={onOpen}
            tooltipAlign="right"
            buttonRef={actionButtonRef}
          >
            <Maximize2 aria-hidden="true" className="h-[18px] w-[18px]" />
          </ToolbarButton>
        ) : (
          <ToolbarButton label={t("close")} onClick={onClose} tooltipAlign="right">
            <Minimize2 aria-hidden="true" className="h-[18px] w-[18px]" />
          </ToolbarButton>
        )}
      </div>

      {announce && (
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {t("textSizeAnnouncement", { size: textSize })}
        </span>
      )}
    </div>
  );
}
