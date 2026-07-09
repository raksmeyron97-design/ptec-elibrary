"use client";

import nextDynamic from "next/dynamic";

// react-pdf touches DOMMatrix at module evaluation — browser-only.
// This wrapper is a Client Component so ssr:false is allowed here.
const PDFViewer = nextDynamic(() => import("@/components/ui/reader/PDFViewer"), {
  ssr: false,
  loading: () => (
    <div
      className="flex min-h-[400px] flex-col items-center justify-center gap-3 rounded-lg border border-divider bg-paper"
      role="status"
      aria-live="polite"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-divider border-t-brand" aria-hidden />
      <span className="text-sm font-medium text-text-muted">Loading document...</span>
    </div>
  ),
});

export default PDFViewer;
