import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/server";
import AnimatedStat from "./AnimatedStat";
import Reveal from "./Reveal";

// ── Data ─────────────────────────────────────────────────────────────────────
async function getCatalogueCounts() {
  const db = createServiceClient();
  const [booksRes, catsRes] = await Promise.all([
    db.from("books").select("id", { count: "exact", head: true }).eq("is_published", true),
    db.from("categories").select("id", { count: "exact", head: true }),
  ]);
  return { books: booksRes.count ?? 0, categories: catsRes.count ?? 0 };
}

// ── Shared class tokens ───────────────────────────────────────────────────────

const FADE_UP =
  "opacity-0 translate-y-4 transition-all duration-700 ease-out " +
  "[&.is-visible]:opacity-100 [&.is-visible]:translate-y-0 " +
  "motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0";

const TILE =
  "relative flex h-full overflow-hidden rounded-2xl border border-divider/60 " +
  "bg-bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.05)] " +
  "transition-[transform,box-shadow,border-color] duration-300 ease-out " +
  "hover:-translate-y-0.5 hover:border-divider hover:shadow-[0_10px_28px_-14px_rgba(15,23,42,0.18)] " +
  "motion-reduce:transition-none motion-reduce:hover:translate-y-0";

const DIAMOND = "h-[7px] w-[7px] flex-none rotate-45 rounded-[1px] bg-gold-400";
const DOT = "h-[5px] w-[5px] flex-none rounded-full bg-gold-400";

// ── SVG icons for feature tiles ───────────────────────────────────────────────

const IconBook = (
  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const IconGlobe = (
  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const IconFolder = (
  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconGrid = (
  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
);

// ── Section ──────────────────────────────────────────────────────────────────
export default async function HomeBento() {
  const [{ books, categories }, t, locale] = await Promise.all([
    getCatalogueCounts(),
    getTranslations("home"),
    getLocale(),
  ]);

  const isKm = locale === "km";
  const label = locale === "en" ? "uppercase tracking-[0.16em]" : "tracking-normal";

  const features = [
    { title: t("aboutFeatCuratedTitle"), body: t("aboutFeatCuratedBody"), icon: IconBook },
    { title: t("aboutFeatOpenTitle"),    body: t("aboutFeatOpenBody"),    icon: IconGlobe },
    { title: t("aboutFeatBilingualTitle"), body: t("aboutFeatBilingualBody"), icon: IconFolder },
    { title: t("aboutFeatCampusTitle"),  body: t("aboutFeatCampusBody"),  icon: IconGrid },
  ];

  const schedule = [
    { day: t("aboutHoursWeekday"), time: t("aboutHoursWeekdayTime"), variant: "normal" as const },
    { day: t("aboutHoursSat"),     time: t("aboutHoursSatTime"),     variant: "normal" as const },
    { day: t("aboutHoursSun"),     time: t("aboutHoursSunTime"),     variant: "muted"  as const },
    { day: t("aboutHoursExam"),    time: t("aboutHoursExamTime"),    variant: "exam"   as const },
    { day: t("aboutHoursOnline"),  time: t("aboutHoursOnlineTime"),  variant: "online" as const },
  ];

  return (
    <section className="border-b border-divider/60 bg-paper" aria-labelledby="about-title">
      <div className="mx-auto max-w-[1400px] px-4 py-14 sm:py-16 md:px-12 md:py-20">

        {/* Bento: 1 col (mobile) → 2 col (tablet) → 12 col (desktop) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-12">

          {/* ── A · Hero (dominant tile) ─────────────────────────────────── */}
          <Reveal className={`sm:col-span-2 lg:col-span-7 lg:row-span-2 ${FADE_UP}`}>
            <div
              className="relative flex h-full min-h-[320px] flex-col overflow-hidden rounded-2xl border border-white/10 p-6 text-white shadow-[0_24px_60px_-30px_rgba(6,11,26,0.7)] sm:p-8 lg:p-10"
              style={{ backgroundImage: "linear-gradient(135deg,#080F28 0%,#0D1B3E 50%,#0A1530 100%)" }}
            >
              {/* dot-grid texture */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-35"
                style={{
                  backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />
              {/* gold top-right glow */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ backgroundImage: "radial-gradient(circle at 88% 10%, rgba(245,158,11,0.18), transparent 52%)" }}
              />
              {/* warm bottom tint */}
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-0 left-0 right-0 h-40"
                style={{ backgroundImage: "linear-gradient(to top, rgba(245,158,11,0.05), transparent)" }}
              />

              <div className="relative flex h-full flex-col">
                {/* Section label */}
                <span className={`inline-flex items-center gap-2 text-[11px] font-bold text-gold-400 ${label}`}>
                  <span aria-hidden className={DIAMOND} />
                  {t("aboutSectionLabel")}
                </span>

                {/* Main heading — the slogan */}
                <h2
                  id="about-title"
                  className={`mt-5 max-w-[30rem] font-khmer-serif font-medium text-white ${
                    isKm ? "leading-[1.45]" : "leading-[1.16] tracking-tight"
                  }`}
                  style={{ fontSize: "clamp(20px, 2.3vw, 34px)" }}
                >
                  {t("aboutLede")}
                </h2>

                {/* Body */}
                <p className="mt-4 max-w-[26rem] text-[14.5px] leading-[1.75] text-blue-100/80">
                  {t("aboutSupport")}
                </p>

                {/* PTEC Library Press badge */}
                <div className="mt-5 self-start">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3.5 py-1.5 backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 flex-none rounded-full bg-gold-400" aria-hidden />
                    <span className="text-[11px] font-semibold tracking-wide text-white/75">
                      {t("aboutPressTagline")}
                    </span>
                  </div>
                </div>

                {/* CTA pushed to bottom */}
                <div className="mt-auto pt-8">
                  <Link
                    href="/about"
                    className="group inline-flex items-center gap-2 rounded-sm text-[14px] font-semibold text-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
                  >
                    {t("aboutMoreLink")}
                    <svg
                      className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>

          {/* ── B · Collection stats (3 columns) ─────────────────────────── */}
          <Reveal delay={80} className={`lg:col-span-5 ${FADE_UP}`}>
            <div className={`${TILE} flex-col p-5 sm:p-6`}>
              <span className={`inline-flex items-center gap-2 text-[10px] font-bold text-text-muted ${label}`}>
                <span aria-hidden className={DOT} />
                {t("aboutCatalogueLabel")}
              </span>

              <div className="mt-auto grid grid-cols-3 pt-6">
                {/* Digital titles (live from DB) */}
                <div className="pr-3">
                  <div className="font-khmer-serif text-[2rem] font-semibold leading-none text-text-heading sm:text-[2.4rem]">
                    <AnimatedStat targetValue={books} />
                    <span className="text-gold-600">+</span>
                  </div>
                  <div className={`mt-2 text-[10px] font-semibold text-text-muted ${label}`}>
                    {t("aboutResourcesWord")}
                  </div>
                </div>

                {/* Categories (live from DB) */}
                <div className="border-l border-divider/60 px-3">
                  <div className="font-khmer-serif text-[2rem] font-semibold leading-none text-text-heading sm:text-[2.4rem]">
                    <AnimatedStat targetValue={categories} />
                  </div>
                  <div className={`mt-2 text-[10px] font-semibold text-text-muted ${label}`}>
                    {t("aboutCategoriesWord")}
                  </div>
                </div>

                {/* Physical copies (from library_info_form) */}
                <div className="border-l border-divider/60 pl-3">
                  <div className="font-khmer-serif text-[2rem] font-semibold leading-none text-text-heading sm:text-[2.4rem]">
                    45k<span className="text-gold-600">+</span>
                  </div>
                  <div className={`mt-2 text-[10px] font-semibold text-text-muted ${label}`}>
                    {t("aboutPhysicalWord")}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* ── C · Library hours schedule ───────────────────────────────── */}
          <Reveal delay={140} className={`lg:col-span-5 ${FADE_UP}`}>
            <div className={`${TILE} flex-col p-5 sm:p-6`}>
              <div className={`flex items-center gap-2 text-[10px] font-bold text-text-muted ${label}`}>
                <span aria-hidden className={DOT} />
                {t("aboutHoursLabel")}
              </div>

              <div className="mt-3 flex flex-col gap-[3px]">
                {schedule.map(({ day, time, variant }) => (
                  <div
                    key={day}
                    className={[
                      "flex items-center justify-between rounded-lg px-2.5 py-[7px]",
                      variant === "exam"   && "bg-amber-50 dark:bg-amber-950/20",
                      variant === "online" && "bg-sky-50 dark:bg-sky-950/20",
                    ].filter(Boolean).join(" ")}
                  >
                    <span
                      className={`text-[12.5px] font-medium ${
                        variant === "muted" ? "text-text-muted" : "text-text-heading"
                      }`}
                    >
                      {day}
                    </span>
                    <span
                      className={`text-[12.5px] font-semibold tabular-nums ${
                        variant === "online" ? "text-sky-600 dark:text-sky-400" :
                        variant === "exam"   ? "text-amber-600 dark:text-amber-400" :
                        variant === "muted"  ? "text-text-muted" :
                        "text-text-heading"
                      }`}
                    >
                      {time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* ── D–G · Four feature tiles with icons ──────────────────────── */}
          {features.map((f, i) => (
            <Reveal key={f.title} delay={200 + i * 60} className={`sm:col-span-1 lg:col-span-3 ${FADE_UP}`}>
              <div className={`${TILE} flex-col p-5`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`flex items-center gap-2 text-[11px] font-bold text-text-heading ${label}`}>
                    <span aria-hidden className={DOT} />
                    {f.title}
                  </h3>
                  <span className="flex-none text-gold-400/60">{f.icon}</span>
                </div>
                <p className="mt-2.5 text-[13px] leading-[1.65] text-text-muted">{f.body}</p>
              </div>
            </Reveal>
          ))}

          {/* ── H · Colophon ─────────────────────────────────────────────── */}
          <Reveal delay={200 + features.length * 60} className={`sm:col-span-2 lg:col-span-12 ${FADE_UP}`}>
            <div className={`${TILE} flex-row flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 sm:px-6`}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className={`text-[10px] font-bold text-text-muted ${label}`}>
                  {t("aboutInitiativeLabel")}
                </span>
                <span className="text-[14px] font-semibold text-text-heading">
                  {t("aboutInitiativeName")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span aria-hidden className={DOT} />
                <span className={`text-[11px] font-semibold text-text-muted ${label}`}>
                  {t("aboutEstablished")}
                </span>
              </div>
            </div>
          </Reveal>

        </div>
      </div>
    </section>
  );
}
