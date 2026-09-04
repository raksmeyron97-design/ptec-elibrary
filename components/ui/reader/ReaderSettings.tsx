"use client";

import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import ReaderModal from "./ReaderModal";
import type { ReaderFitMode, ReaderPageTransition, ReaderTheme, ReaderViewMode } from "./reader-config";

/* Reader settings: the SAME persisted preferences the toolbar edits, grouped
   and labelled. No state lives here. */

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="mb-4">
      <p id={id} className="reader-menu-heading px-0">{label}</p>
      <div role="radiogroup" aria-labelledby={id} className="reader-cluster flex w-full">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`reader-btn flex-1 ${value === o.value ? "reader-btn--active" : ""}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReaderSettings({
  open,
  onClose,
  theme,
  onTheme,
  viewMode,
  onViewMode,
  fitMode,
  onFit,
  onScale,
  zoomPercent,
  pageTransition,
  onPageTransition,
  focusMode,
  onFocusMode,
  fmt,
}: {
  open: boolean;
  onClose: () => void;
  theme: ReaderTheme;
  onTheme: (t: ReaderTheme) => void;
  viewMode: ReaderViewMode;
  onViewMode: (m: ReaderViewMode) => void;
  fitMode: ReaderFitMode;
  onFit: (m: "width" | "page") => void;
  onScale: (s: number) => void;
  zoomPercent: number;
  pageTransition: ReaderPageTransition;
  onPageTransition: (v: ReaderPageTransition) => void;
  focusMode: boolean;
  onFocusMode: (v: boolean) => void;
  fmt: (n: number | string) => string;
}) {
  const t = useTranslations("reader");
  return (
    <ReaderModal open={open} onClose={onClose} title={t("readerSettings")} size="md">
      <Segmented
        label={t("appearance")}
        value={theme}
        onChange={onTheme}
        options={[
          { value: "light", label: t("themeLight") },
          { value: "dark", label: t("themeDark") },
        ]}
      />
      <Segmented
        label={t("layout")}
        value={viewMode}
        onChange={onViewMode}
        options={[
          { value: "single", label: t("singleMode") },
          { value: "scroll", label: t("scrollMode") },
        ]}
      />
      <Segmented<ReaderFitMode>
        label={t("pageSizing")}
        value={fitMode}
        onChange={(m) => (m === "custom" ? onScale(1) : onFit(m))}
        options={[
          { value: "width", label: t("fitWidth") },
          { value: "page", label: t("fitPage") },
          { value: "custom", label: `${t("customZoom")} · ${fmt(zoomPercent)}%` },
        ]}
      />
      <Segmented<"on" | "off">
        label={t("readingSection")}
        value={focusMode ? "on" : "off"}
        onChange={(v) => onFocusMode(v === "on")}
        options={[
          { value: "on", label: t("focusMode") },
          { value: "off", label: t("exitFocusMode") },
        ]}
      />
      <Segmented<ReaderPageTransition>
        label={t("pageAnimation")}
        value={pageTransition}
        onChange={onPageTransition}
        options={[
          { value: "auto", label: t("pageAnimationAuto") },
          { value: "off", label: t("pageAnimationOff") },
        ]}
      />
      <p className="reader-menu-heading px-0">{t("accessibilitySection")}</p>
      <p className="reader-muted text-[12.5px] leading-5">{t("reducedMotionNote")}</p>
    </ReaderModal>
  );
}
