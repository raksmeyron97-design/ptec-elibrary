"use client";

import { ArrowUp } from "lucide-react";

export default function BackToTopButton() {
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-divider bg-bg-surface py-2.5 text-[12.5px] font-semibold text-text-muted transition-all duration-150 hover:border-brand/30 hover:bg-brand/5 hover:text-brand active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
    >
      <ArrowUp className="h-3.5 w-3.5" />
      Back to top
    </button>
  );
}
