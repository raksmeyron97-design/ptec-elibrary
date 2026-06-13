import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/server";
import AnimatedStat from "./AnimatedStat";

async function getCategoryCount() {
  const db = createServiceClient();
  const { count } = await db
    .from("categories")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

export default async function HomeBento() {
  const [categories, t, tf, locale] = await Promise.all([
    getCategoryCount(),
    getTranslations("home"),
    getTranslations("footer"),
    getLocale(),
  ]);

  const latinLabel = locale === "en" ? "uppercase tracking-[0.16em]" : "tracking-normal";

  return (
    <section className="border-b border-divider/60 bg-bg-surface">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-16 md:px-12 md:py-20">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6 lg:grid-rows-2">

          {/* ── 1. About the library (big card, gold/heritage) ── */}
          <Link
            href="/about"
            className="group relative col-span-2 row-span-2 overflow-hidden rounded-2xl border border-divider bg-bg-surface p-6 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-8px_rgba(221,176,34,0.2)] lg:col-span-3 sm:p-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
          >
            {/* Soft gold blob top-right */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-gold-500/10 blur-[60px] transition-colors duration-500 group-hover:bg-gold-500/20"
            />

            <div className="relative flex h-full flex-col">
              {/* Eyebrow */}
              <div className={`mb-3 inline-flex items-center gap-2 text-[11px] font-bold text-gold-700 dark:text-gold-400 ${latinLabel}`}>
                {/* Landmark / building icon */}
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                {t("aboutLibraryLabel")}
              </div>

              {/* Heading */}
              <h3 className="font-khmer-serif text-2xl font-bold text-text-heading sm:text-3xl">
                {t("aboutLibraryTitle")}
              </h3>

              {/* Body */}
              <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-text-muted sm:text-[15px]">
                {t("aboutLibraryBody")}
              </p>

              {/* Link line */}
              <div className="mt-auto pt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-gold-700 dark:text-gold-400">
                {t("aboutLibraryLink")}
                <svg
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </div>
            </div>
          </Link>

          {/* ── 2. Research & publications (cyan/digital) ── */}
          <Link
            href="/research"
            className="group relative col-span-2 overflow-hidden rounded-2xl border border-divider bg-bg-surface p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-8px_rgba(34,211,238,0.18)] lg:col-span-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            {/* Cyan blob */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-8 -top-8 h-44 w-44 rounded-full bg-cyan-400/10 blur-[50px] transition-colors duration-500 group-hover:bg-cyan-400/20"
            />

            <div className="relative">
              <div className={`mb-2 inline-flex items-center gap-2 text-[11px] font-bold text-cyan-700 dark:text-cyan-300 ${latinLabel}`}>
                {/* Document / research icon */}
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                {t("researchLabel")}
              </div>

              <p className="max-w-sm text-[14px] leading-relaxed text-text-muted">
                {t("researchBody")}
              </p>

              <div className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-cyan-700 dark:text-cyan-300">
                {t("researchLink")}
                <svg
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </div>
            </div>
          </Link>

          {/* ── 3. Categories ── */}
          <div className="col-span-1 rounded-2xl border border-divider bg-bg-surface p-5 lg:col-span-1">
            <p className={`mb-1.5 text-[11px] font-bold text-text-muted ${latinLabel}`}>
              {t("bentoCategoriesLabel")}
            </p>
            <div className="font-khmer-serif text-3xl font-bold text-text-heading">
              <AnimatedStat targetValue={categories} />
            </div>
          </div>

          {/* ── 4. Opening hours ── */}
          <div className="col-span-1 rounded-2xl border border-divider bg-bg-surface p-5 lg:col-span-2">
            <div className="mb-2 inline-flex items-center gap-2 text-gold-700 dark:text-gold-400">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className={`text-[11px] font-bold ${latinLabel}`}>{tf("hoursLabel")}</span>
            </div>
            <p className="text-[13px] font-semibold text-text-heading">{tf("hoursValue")}</p>
            <p className="mt-0.5 text-[12px] text-text-muted">{tf("hoursClosed")}</p>
          </div>

        </div>
      </div>
    </section>
  );
}
