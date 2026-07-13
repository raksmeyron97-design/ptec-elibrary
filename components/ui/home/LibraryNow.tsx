"use client";

// components/ui/home/LibraryNow.tsx
// The bridge between the always-on e-library and the physical library on
// campus. Open/closed is computed from PTEC.hours in Cambodia time (never the
// viewer's device timezone) via lib/library-hours. The live status renders
// after mount to stay hydration-safe and correct even when the page HTML was
// cached; the digital side and all links are meaningful without JS.
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Globe, MapPin, Clock, Navigation, Phone, ArrowRight, Dot } from "lucide-react";
import { PTEC } from "@/lib/ptec";
import {
  getLibraryStatus,
  zonedNow,
  parseOpeningHours,
  formatTimeLabel,
  weekdayLabel,
} from "@/lib/library-hours";

export default function LibraryNow() {
  const t = useTranslations("home");
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Defer the first set out of the effect body (avoids a synchronous
    // setState-in-effect) — same pattern as AskLibraryHero. `now` stays null
    // through SSR + first paint, so the live status is client-only and never
    // hydration-mismatches a cached HTML shell.
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const status = now ? getLibraryStatus(now) : null;
  const sched = parseOpeningHours(PTEC.hours.openingHoursSpec);
  const zoned = now ? zonedNow(now) : null;
  const todayRanges = zoned ? sched[zoned.weekday] : [];
  const todayLabel =
    todayRanges.length > 0
      ? todayRanges
          .map((r) => `${formatTimeLabel(r.open, locale)} – ${formatTimeLabel(r.close, locale)}`)
          .join(", ")
      : t("libraryNowClosed");

  let statusLine: string | null = null;
  if (status?.isOpen && status.closesAtMin != null) {
    statusLine = `${t("libraryNowClosesLabel")} ${formatTimeLabel(status.closesAtMin, locale)}`;
  } else if (status && !status.isOpen && status.nextOpen && now) {
    const { dayOffset, openMin } = status.nextOpen;
    const day = dayOffset === 0 ? "" : `${weekdayLabel(now, dayOffset, locale)} `;
    statusLine = `${t("libraryNowOpensLabel")} ${day}${formatTimeLabel(openMin, locale)}`;
  }

  const isOpen = status?.isOpen ?? false;

  const linkClass =
    "inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-brand transition-colors hover:bg-brand/8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

  return (
    <section className="border-b border-divider/60 bg-paper" aria-labelledby="library-now-title">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        {/* ── Header ── */}
        <div className="mb-8 max-w-2xl">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-brand to-accent" aria-hidden />
            <span
              className={`text-[11px] font-bold text-brand ${locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal"}`}
            >
              {t("libraryNowEyebrow")}
            </span>
          </div>
          <h2
            id="library-now-title"
            className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
            style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
          >
            {t("libraryNowTitle")}
          </h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-text-muted">{t("libraryNowBody")}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* ── Digital ── */}
          <div className="flex flex-col rounded-2xl border border-divider bg-bg-surface p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/8 text-brand" aria-hidden>
                <Globe className="h-[22px] w-[22px]" strokeWidth={1.9} />
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                {t("libraryNowDigitalStatus")}
              </span>
            </div>
            <h3 className="mt-4 font-khmer-serif text-[18px] font-bold text-text-heading">{t("libraryNowDigital")}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-muted">{t("libraryNowDigitalBody")}</p>
            <div className="mt-auto pt-4">
              <Link
                href="/books"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-[13.5px] font-bold text-brand-contrast transition-colors hover:bg-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {t("libraryNowDigitalCta")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>

          {/* ── Physical ── */}
          <div className="flex flex-col rounded-2xl border border-divider bg-bg-surface p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/12 text-accent-text" aria-hidden>
                <MapPin className="h-[22px] w-[22px]" strokeWidth={1.9} />
              </span>
              {/* Live status — icon + text, not colour alone. Placeholder pre-mount. */}
              {status ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${
                    isOpen
                      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                      : "bg-text-muted/12 text-text-muted"
                  }`}
                >
                  <Dot className={`h-4 w-4 ${isOpen ? "text-emerald-500" : "text-text-muted"}`} aria-hidden strokeWidth={6} />
                  {isOpen ? t("libraryNowOpen") : t("libraryNowClosed")}
                </span>
              ) : (
                <span className="h-[26px] w-20 animate-pulse rounded-full bg-divider" aria-hidden />
              )}
            </div>
            <h3 className="mt-4 font-khmer-serif text-[18px] font-bold text-text-heading">{t("libraryNowPhysical")}</h3>

            <dl className="mt-3 space-y-1.5 text-[13.5px]">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                <dt className="sr-only">{t("libraryNowTodayLabel")}</dt>
                <dd className="text-text-body">
                  <span className="font-semibold">{t("libraryNowTodayLabel")}:</span>{" "}
                  {now ? (
                    <>
                      {todayLabel}
                      {statusLine && <span className="text-text-muted"> · {statusLine}</span>}
                    </>
                  ) : (
                    <span className="inline-block h-3 w-32 animate-pulse rounded bg-divider align-middle" aria-hidden />
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-1 text-[12px] text-text-muted">{t("libraryNowHoursNote")}</p>

            <div className="mt-auto flex flex-wrap gap-1 pt-4">
              <Link href="/about/timings" className={linkClass}>
                <Clock className="h-4 w-4" aria-hidden />
                {t("libraryNowHoursLink")}
              </Link>
              <a href={PTEC.links.mapPlace} target="_blank" rel="noopener noreferrer" className={linkClass}>
                <Navigation className="h-4 w-4" aria-hidden />
                {t("libraryNowDirections")}
                <span className="sr-only">({t("partnersOpensNewTab")})</span>
              </a>
              <Link href="/contact" className={linkClass}>
                <Phone className="h-4 w-4" aria-hidden />
                {t("libraryNowContact")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
