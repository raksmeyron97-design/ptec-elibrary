"use client";

// components/layout/FooterOpenStatus.tsx
// The one-line "Open now · closes 5:00 PM" in the footer's Visit column.
//
// Same contract as components/about/LibraryOpenStatus.tsx, and the same pure
// resolver (lib/about/status.ts → resolveLibraryStatus, which is the
// homepage's getLibraryStatus + activeClosure composition): the server passes
// the status it computed, first paint renders exactly that so hydration never
// mismatches, and after mount the client recomputes from the same inputs every
// 60 s so a cached page never claims the library is open at 8 pm. Everything is
// evaluated in Asia/Phnom_Penh — a reader's device timezone is never consulted.
// The ticking and the sentence live in useLibraryOpenStatus, shared with the
// phone tab bar's Library sheet.

import type { HoursClosure } from "@/lib/system-settings/types";
import type { AboutLibraryStatus } from "@/lib/about/status";
import { useLibraryOpenStatus, type LibraryOpenStatus } from "./useLibraryOpenStatus";

// Dot colour follows the About page's rule: green only while open, neutral when
// closed on schedule (a closed library at night is not an error), amber for a
// published closure. The sentence always carries the state in words too.
const DOT: Record<LibraryOpenStatus["tone"], string> = {
  open: "bg-[var(--ptec-success)]",
  closed: "bg-blue-200/60",
  notice: "bg-[var(--ptec-warning)]",
  unknown: "bg-blue-200/60",
};

export default function FooterOpenStatus({
  initialStatus,
  spec,
  closures,
  locale,
}: {
  initialStatus: AboutLibraryStatus;
  spec: string[];
  closures: HoursClosure[];
  locale: "en" | "km";
}) {
  const { tone, text, liveLabel } = useLibraryOpenStatus({ initialStatus, spec, closures, locale });

  return (
    <p
      role="status"
      aria-live="polite"
      aria-label={liveLabel}
      className="flex items-center gap-2.5 text-[14px] leading-6 text-blue-50"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
        {tone === "open" && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden ${DOT.open}`}
          />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${DOT[tone]}`} />
      </span>
      <span>{text}</span>
    </p>
  );
}
