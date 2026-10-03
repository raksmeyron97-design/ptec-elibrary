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
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Globe, MapPin, Navigation, Dot, Library } from "lucide-react";
import {
  getLibraryStatus,
  zonedNow,
  parseOpeningHours,
  formatTimeLabel,
  weekdayLabel,
} from "@/lib/library-hours";
import { activeClosure } from "@/lib/system-settings/hours";
import type { HoursClosure } from "@/lib/system-settings/types";
import type { PublicHomepagePhoto } from "@/lib/types/homepage-photo";
import { HomeSection, SectionHeader } from "./HomeSection";

/** Monday first: the week as a Cambodian timetable prints it. JS weekdays. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export default function LibraryNow({
  openingHoursSpec,
  closures = [],
  mapPlaceUrl,
  photo = null,
}: {
  /** schema.org opening-hours spec from the published settings. */
  openingHoursSpec: string[];
  closures?: HoursClosure[];
  mapPlaceUrl: string;
  /** The first admin-managed homepage photo; null falls back to the building. */
  photo?: PublicHomepagePhoto | null;
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

  const rangesLabel = (ranges: { open: number; close: number }[]) =>
    ranges.length > 0
      ? ranges.map((r) => `${formatTimeLabel(r.open, locale)} – ${formatTimeLabel(r.close, locale)}`).join(", ")
      : t("libraryNowClosed");

  // The whole week, Monday first. Today's row is marked (aria-current="date")
  // and, on a closure day, says why instead of the regular hours.
  const week = WEEK_ORDER.map((weekday) => {
    const offset = (weekday - zoned.weekday + 7) % 7;
    const isToday = offset === 0;
    return {
      weekday,
      isToday,
      day: weekdayLabel(scheduleNow, offset, locale),
      hours: isToday ? todayLabel : rangesLabel(sched[weekday] ?? []),
    };
  });

  const panel = "rounded-xl border border-border bg-paper p-5";
  const pill = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold";

  return (
    <HomeSection surface="surface" labelledBy="library-now-title">
      <div className="grid gap-10 lg:grid-cols-[5fr_7fr] lg:gap-12">
        <div className="min-w-0">
          <SectionHeader
            id="library-now-title"
            eyebrow={t("libraryNowEyebrow")}
            title={t("libraryNowTitle")}
            lede={t("libraryNowBody")}
          />

          <div className="space-y-3">
            {/* ── E-Library ── */}
            <div className={panel}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/8 text-brand" aria-hidden>
                  <Globe className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <h3 className="min-w-0 flex-1 font-record text-[17px] font-bold text-text-heading">{t("libraryNowDigital")}</h3>
                {/* Status surface tokens, not a hand-written green triplet — see
                    lib/status-tokens.test.ts. A word and a dot, never colour alone. */}
                <span className={`${pill} bg-success-soft text-success-text`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                  {t("libraryNowDigitalStatus")}
                </span>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-text-muted">{t("libraryNowDigitalBody")}</p>
            </div>

            {/* ── Physical library ── */}
            <div className={panel}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent-text" aria-hidden>
                  <MapPin className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <h3 className="min-w-0 flex-1 font-record text-[17px] font-bold text-text-heading">{t("libraryNowPhysical")}</h3>
                {/* Live status — a word and a dot. Placeholder pre-mount. */}
                {statusKnown ? (
                  <span className={`${pill} ${isOpen ? "bg-success-soft text-success-text" : "bg-text-muted/12 text-text-body"}`}>
                    <Dot className={`h-4 w-4 ${isOpen ? "text-success" : "text-text-muted"}`} aria-hidden strokeWidth={6} />
                    {isOpen ? t("libraryNowOpen") : t("libraryNowClosed")}
                  </span>
                ) : (
                  <span className="h-[26px] w-20 animate-pulse rounded-full bg-divider" aria-hidden />
                )}
              </div>
              {statusLine && <p className="mt-2 text-[13px] text-text-muted">{statusLine}</p>}

              {/* The week's hours. The schedule text is available from first
                  render (see scheduleNow above); only the live status waits
                  for mount. */}
              <table className="mt-3 w-full text-[13.5px]">
                <caption className="sr-only">{t("libraryNowWeekLabel")}</caption>
                <tbody>
                  {week.map(({ weekday, isToday, day, hours }) => (
                    <tr
                      key={weekday}
                      aria-current={isToday ? "date" : undefined}
                      className={isToday ? "bg-bg-surface font-semibold text-text-heading" : "text-text-body"}
                    >
                      <th scope="row" className="w-24 rounded-l-md py-1 pl-2 text-left font-medium">
                        {day}
                        {isToday && <span className="sr-only"> ({t("libraryNowTodayLabel")})</span>}
                      </th>
                      <td className="rounded-r-md py-1 pr-2 text-right tabular-nums">{hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[12px] text-text-muted">{t("libraryNowHoursNote")}</p>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href={mapPlaceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-brand px-5 text-[14px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
            >
              <Navigation className="h-4 w-4" aria-hidden />
              {t("libraryNowDirections")}
              <span className="sr-only">({t("partnersOpensNewTab")})</span>
            </a>
            <Link
              href="/catalogs"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-[14px] font-semibold text-brand transition-colors hover:text-brand-hover hover:underline"
            >
              <Library className="h-4 w-4" aria-hidden />
              {t("libraryNowCatalogCta")}
            </Link>
          </div>
        </div>

        {/* ── One photograph of the place ──
            The first admin-managed homepage photo, or the building when the
            gallery is empty. Lazy: it is far below the fold, and the hero no
            longer fetches any image. The caption sits on glass, which is a
            control surface here (it carries a button), never behind a cover. */}
        <figure className="relative m-0 min-h-[360px] overflow-hidden rounded-2xl bg-paper shadow-md">
          {photo ? (
            <Image
              src={photo.url}
              alt={photo.alt}
              fill
              // Pixel widths only (no bare vw — see pdf-cover-sizes.test.ts):
              // the column is ~760 px at lg, the full phone width below.
              sizes="(min-width: 1024px) 760px, 420px"
              className="object-cover"
              {...(photo.blurDataUrl ? { placeholder: "blur" as const, blurDataURL: photo.blurDataUrl } : {})}
            />
          ) : (
            <picture>
              <source type="image/avif" srcSet="/hero/ptec-library-640.avif 640w, /hero/ptec-library-960.avif 960w, /hero/ptec-library-1440.avif 1440w" sizes="(min-width: 1024px) 760px, 100vw" />
              <source type="image/webp" srcSet="/hero/ptec-library-640.webp 640w, /hero/ptec-library-960.webp 960w, /hero/ptec-library-1440.webp 1440w" sizes="(min-width: 1024px) 760px, 100vw" />
              <img
                src="/hero/ptec-library-960.jpg"
                alt={t("photosEyebrow")}
                width={1440}
                height={959}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </picture>
          )}
          <figcaption className="glass-surface glass-surface--sheet absolute inset-x-3 bottom-3 rounded-xl p-4 sm:inset-x-4 sm:bottom-4 sm:p-5">
            <p className="text-[11.5px] font-bold text-accent-text">{t("photosEyebrow")}</p>
            <p className="mt-1 font-record text-[17px] font-bold leading-snug text-text-heading sm:text-[19px]">
              {photo?.caption || t("photosTitle")}
            </p>
            <Link
              href="/books"
              className="mt-3 inline-flex min-h-[40px] items-center rounded-lg border border-border-strong px-4 text-[13.5px] font-semibold text-text-heading transition-colors hover:bg-paper"
            >
              {t("browseSectionTitle")}
            </Link>
          </figcaption>
        </figure>
      </div>
    </HomeSection>
  );
}
