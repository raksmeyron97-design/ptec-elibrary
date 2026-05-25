"use client";

import nextDynamic from "next/dynamic";

// react-pdf touches DOMMatrix at module evaluation — browser-only.
// This wrapper is a Client Component so ssr:false is allowed here.
const PDFViewer = nextDynamic(() => import("@/components/ui/PDFViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-[#007c91]" />
    </div>
  ),
});

export default PDFViewer;