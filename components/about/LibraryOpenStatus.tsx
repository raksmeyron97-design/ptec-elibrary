"use client";

// components/about/LibraryOpenStatus.tsx
//
// The "Open now / Closed now" card on /about/timings.
//
// ── Why this is a client component, and how it avoids a hydration mismatch ──
//
// The page is prerendered and served from the CDN, so the HTML's idea of "now"
// is whenever the page was last revalidated — not when the reader opened it.
// A visitor arriving at 8pm from a cache generated at 10am would be told the
// library is open.
//
// The fix is NOT to make the page dynamic (that costs every visitor a
// server round trip for one badge). Instead:
//
//   1. The server computes the status and passes it in as `initialStatus`.
//      First paint renders exactly that — identical markup on both sides, so
//      React never reports a mismatch.
//   2. On mount, and every 60s after, the client recomputes from the SAME
//      pure function over the same inputs and swaps in the live answer.
//
// Recomputing client-side is safe because resolveLibraryStatus() is pure and
// evaluates everything in Asia/Phnom_Penh — the reader's device timezone is
// never consulted, so a reader in Paris sees Phnom Penh's opening hours, which
// is the only correct answer about a physical building.
//
// The status change is announced politely (not assertively): it is useful
// information, not an emergency, and an assertive live region would interrupt
// a screen-reader user mid-sentence.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleHelp, Clock, DoorOpen, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatTimeLabel } from "@/lib/library-hours";
import { dayName } from "@/lib/system-settings/hours";
import type { HoursClosure } from "@/lib/system-settings/types";
import {
  resolveLibraryStatus,
  statusKey,
  statusTone,
  type AboutLibraryStatus,
} from "@/lib/about/status";
import type { AboutLocale } from "@/lib/about/format";
import { localized } from "@/lib/about/format";

// Status token families, no `dark:` variants — the tokens resolve per theme.
//
// Colour assignment is deliberate and narrow:
//   open    green, the ONLY green on the page (an available state)
//   closed  NEUTRAL, never red. A library that is shut at 8pm on a Tuesday is
//           operating normally; painting that red makes a correct schedule
//           look like an error and desensitises the reader to real warnings.
//   notice  amber, for a holiday or unscheduled closure — an exception worth
//           noticing, still not a fault.
//   unknown neutral, for "we could not load the schedule".
const TONE_STYLES: Record<
  ReturnType<typeof statusTone>,
  { wrapper: string; dot: string; icon: LucideIcon; text: string }
> = {
  open: {
    wrapper: "border-success-line bg-success-soft",
    dot: "bg-success",
    icon: DoorOpen,
    text: "text-success-text",
  },
  closed: {
    wrapper: "border-divider bg-paper",
    dot: "bg-text-muted",
    icon: Clock,
    text: "text-text-heading",
  },
  notice: {
    wrapper: "border-warning-line bg-warning-soft",
    dot: "bg-warning",
    icon: Info,
    text: "text-warning-text",
  },
  unknown: {
    wrapper: "border-divider bg-paper",
    dot: "bg-text-muted",
    icon: CircleHelp,
    text: "text-text-heading",
  },
};

export default function LibraryOpenStatus({
  initialStatus,
  spec,
  closures,
  locale,
}: {
  initialStatus: AboutLibraryStatus;
  spec: string[];
  closures: HoursClosure[];
  locale: AboutLocale;
}) {
  const t = useTranslations("about.timings.status");
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
  const style = TONE_STYLES[tone];
  const Icon = style.icon;

  let headline: string;
  let detail: string | null = null;
  let closureReason: { text: string; lang: AboutLocale } | null = null;

  switch (status.kind) {
    case "open": {
      headline = t("open");
      detail = t("closesToday", { time: formatTimeLabel(status.closesAtMin, locale) });
      break;
    }
    case "closed": {
      headline = t("closed");
      detail = status.nextOpen ? nextOpenLabel(status.nextOpen, locale, t) : null;
      break;
    }
    case "closed-exception": {
      headline = t("closedException");
      closureReason = localized(status.closure.reason, locale);
      detail = status.nextOpen ? nextOpenLabel(status.nextOpen, locale, t) : null;
      break;
    }
    case "unavailable": {
      headline = t("unavailable");
      detail = t("unavailableBody");
      break;
    }
  }

  return (
    <div className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${style.wrapper}`}>
      {/* The live region wraps only the sentence that changes. Wrapping the
          whole card would make a screen reader re-announce the heading and
          the timezone note every time the minute rolls over. */}
      <div role="status" aria-live="polite" aria-label={t("liveLabel")}>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-2">
            {/* Colour is never alone: a dot, an icon AND the word. */}
            <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} aria-hidden="true" />
            <Icon className={`h-5 w-5 ${style.text}`} aria-hidden="true" />
            <span className={`text-xl font-semibold tracking-tight ${style.text}`}>
              {headline}
            </span>
          </span>
        </p>
        {closureReason && (
          <p
            lang={closureReason.lang}
            className="about-copy about-wrap mt-1.5 text-sm font-medium text-text-heading"
          >
            {closureReason.text}
          </p>
        )}
        {detail && <p className="about-copy mt-1.5 text-sm text-text-body">{detail}</p>}
      </div>

      <p className="mt-4 border-t border-current/10 pt-3 text-xs text-text-muted">
        {t("timezoneNote")}
      </p>
    </div>
  );
}

/** "Opens today at 7:00 AM" / "Opens Monday at 7:00 AM". */
function nextOpenLabel(
  nextOpen: { dayOffset: number; weekday: number; openMin: number },
  locale: AboutLocale,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const time = formatTimeLabel(nextOpen.openMin, locale);
  if (nextOpen.dayOffset === 0) return t("opensToday", { time });
  return t("opensOn", { day: dayName(locale, nextOpen.weekday), time });
}
