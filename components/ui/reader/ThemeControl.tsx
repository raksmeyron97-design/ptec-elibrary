"use client";

import { memo } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReaderTheme } from "./reader-config";

/* Explicit two-state Light | Dark segmented control (replaces the old
   three-theme cycling button). Each half is a toggle with aria-pressed so
   screen readers hear both the option and its state. */
const ThemeControl = memo(function ThemeControl({
  theme,
  onChange,
}: {
  theme: ReaderTheme;
  onChange: (theme: ReaderTheme) => void;
}) {
  const t = useTranslations("reader");
  const base =
    "inline-flex h-7 items-center justify-center gap-1 rounded px-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60";
  return (
    <div
      role="group"
      aria-label={t("appearance")}
      className="flex items-center gap-0.5 rounded-md bg-bg-surface/10 p-1"
    >
      <button
        type="button"
        aria-pressed={theme === "light"}
        title={t("themeLight")}
        onClick={() => onChange("light")}
        className={`${base} ${
          theme === "light"
            ? "bg-cyan-500/20 text-cyan-300"
            : "text-slate-400 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Sun className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden lg:inline">{t("themeLight")}</span>
        <span className="sr-only lg:hidden">{t("themeLight")}</span>
      </button>
      <button
        type="button"
        aria-pressed={theme === "dark"}
        title={t("themeDark")}
        onClick={() => onChange("dark")}
        className={`${base} ${
          theme === "dark"
            ? "bg-cyan-500/20 text-cyan-300"
            : "text-slate-400 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Moon className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden lg:inline">{t("themeDark")}</span>
        <span className="sr-only lg:hidden">{t("themeDark")}</span>
      </button>
    </div>
  );
});

export default ThemeControl;
