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

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatTimeLabel } from "@/lib/library-hours";
import { dayName } from "@/lib/system-settings/hours";
import type { HoursClosure } from "@/lib/system-settings/types";
import {
  resolveLibraryStatus,
  statusKey,
  statusTone,
  type AboutLibraryStatus,
} from "@/lib/about/status";

// Dot colour follows the About page's rule: green only while open, neutral when
// closed on schedule (a closed library at night is not an error), amber for a
// published closure. The sentence always carries the state in words too.
const DOT: Record<ReturnType<typeof statusTone>, string> = {
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
  const t = useTranslations("footer.status");
  const [status, setStatus] = useState<AboutLibraryStatus>(initialStatus);
  const lastKey = useRef(statusKey(initialStatus));

  useEffect(() => {
    const tick = () => {
      const next = resolveLibraryStatus(new Date(), spec, closures);
      const key = statusKey(next);
      if (key === lastKey.current) return;
      lastKey.current = key;
      setStatus(next);
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [spec, closures]);

  const tone = statusTone(status);
  const next = (
    nextOpen: { dayOffset: number; weekday: number; openMin: number } | null,
    today: string,
    on: string,
    none: string,
  ) => {
    if (!nextOpen) return t(none);
    const time = formatTimeLabel(nextOpen.openMin, locale);
    if (nextOpen.dayOffset === 0) return t(today, { time });
    return t(on, { day: dayName(locale, nextOpen.weekday), time });
  };

  let text: string;
  switch (status.kind) {
    case "open":
      text = t("open", { time: formatTimeLabel(status.closesAtMin, locale) });
      break;
    case "closed":
      text = next(status.nextOpen, "closedOpensToday", "closedOpensOn", "closed");
      break;
    case "closed-exception":
      text = next(status.nextOpen, "closedException", "closedException", "closedExceptionNoNext");
      break;
    case "unavailable":
      text = t("unavailable");
      break;
  }

  return (
    <p
      role="status"
      aria-live="polite"
      aria-label={t("liveLabel")}
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
