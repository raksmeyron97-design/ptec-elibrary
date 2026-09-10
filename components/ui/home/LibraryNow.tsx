"use client";

// components/ui/home/LibraryNow.tsx
// The bridge between the always-on e-library and the physical library on
// campus. The schedule + closures arrive as props from the server-rendered
// home page (published system settings); open/closed is computed in Cambodia
// time (never the viewer's device timezone) via lib/library-hours. The live
// status renders after mount to stay hydration-safe and correct even when the
// page HTML was cached; the digital side and all links are meaningful
// without JS.
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Globe, MapPin, Clock, Navigation, Phone, ArrowRight, Dot, Library } from "lucide-react";
import {
  getLibraryStatus,
  zonedNow,
  parseOpeningHours,
  formatTimeLabel,
  weekdayLabel,
} from "@/lib/library-hours";
import { activeClosure } from "@/lib/system-settings/hours";
import type { HoursClosure } from "@/lib/system-settings/types";
import { HomeSection, SectionHeader } from "./HomeSection";

export default function LibraryNow({
  openingHoursSpec,
  closures = [],
  mapPlaceUrl,
}: {
  /** schema.org opening-hours spec from the published settings. */
  openingHoursSpec: string[];
  closures?: HoursClosure[];
  mapPlaceUrl: string;
}) {
  const t = useTranslations("home");
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);
  // Eagerly-computed "render moment" — runs on the server render AND on the
  // client's first render (unlike `now` above, which stays null until after
  // mount). Used ONLY to resolve which weekday's schedule to show; the
  // schedule text for a given weekday is constant all day (it only changes
  // if an admin edits the published hours, which busts this page's cache via
  // revalidateSiteConfig()), so it's safe to render immediately instead of a
  // permanent loading skeleton — unlike the live isOpen/closesAt status below,
  // which genuinely can go stale under ISR caching and must wait for mount.
  const [scheduleNow] = useState(() => new Date());

  useEffect(() => {
    // Defer the first set out of the effect body (avoids a synchronous
    // setState-in-effect) — same pattern as AskLibraryHero. `now` stays null
    // through SSR + first paint, so the LIVE status is client-only and never
    // hydration-mismatches a cached HTML shell.
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // A special closure (public holiday, temporary closure) overrides the
  // weekly schedule for the whole Cambodia-local day. Resolved from
  // `scheduleNow` (always available) so a published closure shows up
  // immediately rather than behind a loading skeleton — closures are
  // pre-scheduled by an admin for a whole calendar day, so they carry none of
  // the intraday staleness risk the live open/closed dot has.
  const closure = activeClosure(scheduleNow, closures);
  const status = now && !closure ? getLibraryStatus(now, openingHoursSpec) : null;
  const sched = parseOpeningHours(openingHoursSpec);
  const zoned = zonedNow(scheduleNow);
  const todayRanges = !closure ? sched[zoned.weekday] : [];
  const closureReason = closure
    ? (locale === "km" ? closure.reason.km : closure.reason.en) || t("libraryNowClosed")
    : null;
  const todayLabel = closure
    ? closureReason!
    : todayRanges.length > 0
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
  const statusKnown = status !== null || closure !== null;

  const linkClass =
    "inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-brand transition-colors hover:bg-brand/8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

  return (
    <HomeSection surface="surface" labelledBy="library-now-title">
      <SectionHeader
        id="library-now-title"
        eyebrow={t("libraryNowEyebrow")}
        title={t("libraryNowTitle")}
        lede={t("libraryNowBody")}
      />

        <div className="grid gap-4 md:grid-cols-2">
          {/* ── Digital ── */}
          <div className="flex flex-col rounded-2xl border border-divider bg-paper p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/8 text-brand" aria-hidden>
                <Globe className="h-[22px] w-[22px]" strokeWidth={1.9} />
              </span>
              {/* Status surface tokens, not a hand-written green triplet: the old
                  pair measured 4.37:1 in light mode, under the 4.5:1 floor for 12 px
                  bold. The tokens resolve per theme, which is also why there is no
                  `dark:` variant here — see lib/status-tokens.test.ts. */}
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-bold text-success-text">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
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
          <div className="flex flex-col rounded-2xl border border-divider bg-paper p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/12 text-accent-text" aria-hidden>
                <MapPin className="h-[22px] w-[22px]" strokeWidth={1.9} />
              </span>
              {/* Live status — icon + text, not colour alone. Placeholder pre-mount. */}
              {statusKnown ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${
                    isOpen
                      ? "bg-success-soft text-success-text"
                      : "bg-text-muted/12 text-text-muted"
                  }`}
                >
                  <Dot className={`h-4 w-4 ${isOpen ? "text-success" : "text-text-muted"}`} aria-hidden strokeWidth={6} />
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
                  {/* Schedule text (todayLabel) is available from first render —
                      see scheduleNow above. Only the live "closes at"/"opens at"
                      addendum waits for client mount, and simply isn't appended
                      until then (no skeleton needed: todayLabel alone is a
                      complete, correct sentence). */}
                  {todayLabel}
                  {statusLine && <span className="text-text-muted"> · {statusLine}</span>}
                </dd>
              </div>
            </dl>
            <p className="mt-1 text-[12px] text-text-muted">{t("libraryNowHoursNote")}</p>

            {/* Primary action, mirroring the digital card's CTA so the bridge
                works in BOTH directions — the physical side previously offered
                hours, directions and a phone number but no way to see what is
                actually on the shelves. Accent-outlined rather than solid: a
                visit is a bigger ask than opening a PDF, so it stays visually
                subordinate to the digital CTA. */}
            <div className="mt-auto pt-4">
              <Link
                href="/catalogs"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-accent/40 px-5 text-[13.5px] font-bold text-accent-text transition-colors hover:border-accent hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Library className="h-4 w-4" aria-hidden />
                {t("libraryNowCatalogCta")}
              </Link>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              <Link href="/about/timings" className={linkClass}>
                <Clock className="h-4 w-4" aria-hidden />
                {t("libraryNowHoursLink")}
              </Link>
              <a href={mapPlaceUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
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
    </HomeSection>
  );
}
