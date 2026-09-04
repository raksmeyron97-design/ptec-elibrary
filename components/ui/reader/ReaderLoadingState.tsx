"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReaderTheme } from "./reader-config";

/* The loading shell: a page-shaped placeholder at the size page 1 will take
   (from the persisted aspect ratio when the book has been opened before), so
   the first painted page lands without a shift. Never a full-screen spinner. */
export default function ReaderLoadingState({
  width,
  height,
  theme,
}: {
  width?: number;
  height: number;
  theme: ReaderTheme;
}) {
  const t = useTranslations("reader");
  return (
    <div className="flex flex-col items-center" role="status" aria-live="polite">
      <div
        className={`reader-page-frame animate-pulse rounded-sm motion-reduce:animate-none ${
          theme === "dark" ? "reader-placeholder--dark" : "reader-placeholder--light"
        }`}
        style={{ width: width ?? "min(100%, 720px)", height }}
      />
      <p className={`mt-4 flex items-center gap-2 text-[13px] font-medium ${theme === "dark" ? "text-white/70" : "text-text-muted"}`}>
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        {t("loadingPage1")}
      </p>
    </div>
  );
}
