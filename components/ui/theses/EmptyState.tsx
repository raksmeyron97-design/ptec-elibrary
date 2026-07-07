import Link from "next/link";
import { RotateCcw } from "lucide-react";

/** Inline illustration — no emoji, matches the brand palette. */
function SearchOffIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden className="text-brand">
      <circle cx="60" cy="60" r="60" className="fill-brand/[0.06]" />
      <circle cx="52" cy="52" r="26" stroke="currentColor" strokeWidth="4" className="opacity-40" />
      <path d="M70 70 L88 88" stroke="currentColor" strokeWidth="5" strokeLinecap="round" className="opacity-40" />
      <path d="M40 52h24" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-accent opacity-80" />
    </svg>
  );
}

export default function EmptyState({
  title = "No theses found",
  message,
  showReset,
  resetHref = "/theses",
  resetLabel = "Reset Filters",
}: {
  title?: string;
  message: string;
  showReset: boolean;
  resetHref?: string;
  resetLabel?: string;
}) {
  return (
    <div className="fade-rise-in flex min-h-[320px] sm:min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface p-6 sm:p-10 text-center">
      <SearchOffIllustration />
      <h2 className="mt-4 text-lg sm:text-xl font-bold text-text-heading">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">{message}</p>
      {showReset && (
        <Link
          href={resetHref}
          className="mt-5 inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full bg-brand px-6 text-sm font-semibold text-brand-contrast transition-all duration-150 hover:bg-brand-hover active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 focus-visible:ring-offset-2"
        >
          <RotateCcw className="h-4 w-4" />
          {resetLabel}
        </Link>
      )}
    </div>
  );
}
