"use client";

// components/layout/useLibraryOpenStatus.ts
// The live "Open now · closes 5:00 PM" sentence, for any surface that shows
// it. Extracted from <FooterOpenStatus> when the phone Library sheet needed
// the same line: two copies of this switch would be two answers to "is the
// library open?" the first time either one changed.
//
// Same contract as before: the caller supplies a status to render first (the
// footer passes the one its server render computed, so hydration never
// mismatches), and after mount the hook recomputes from the same inputs every
// 60 s, in Asia/Phnom_Penh — a reader's device timezone is never consulted.

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

export type LibraryOpenStatus = {
  tone: ReturnType<typeof statusTone>;
  text: string;
  /** Accessible name for a live region announcing the status. */
  liveLabel: string;
};

export function useLibraryOpenStatus({
  initialStatus,
  spec,
  closures,
  locale,
}: {
  initialStatus: AboutLibraryStatus;
  spec: string[];
  closures: HoursClosure[];
  locale: "en" | "km";
}): LibraryOpenStatus {
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

  return { tone: statusTone(status), text, liveLabel: t("liveLabel") };
}
