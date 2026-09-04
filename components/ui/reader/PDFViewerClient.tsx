"use client";

import nextDynamic from "next/dynamic";
import { useTranslations } from "next-intl";

// react-pdf touches DOMMatrix at module evaluation — browser-only.
// This wrapper is a Client Component so ssr:false is allowed here.

function ReaderChunkLoading() {
  const t = useTranslations("reader");
  return (
    <div
      className="flex min-h-[400px] flex-col items-center justify-center gap-3 rounded-lg border border-divider bg-paper"
      role="status"
      aria-live="polite"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-divider border-t-brand motion-reduce:animate-none" aria-hidden />
      <span className="text-sm font-medium text-text-muted">{t("loading")}</span>
    </div>
  );
}

const PDFViewer = nextDynamic(() => import("@/components/ui/reader/PDFViewer"), {
  ssr: false,
  loading: () => <ReaderChunkLoading />,
});

export default PDFViewer;
