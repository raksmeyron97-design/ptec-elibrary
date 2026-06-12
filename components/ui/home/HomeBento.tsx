import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/server";
import AnimatedStat from "./AnimatedStat";

async function getBentoCounts() {
  const db = createServiceClient();
  const [ebooksRes, physicalRes, categoriesRes] = await Promise.all([
    db.from("books").select("id", { count: "exact", head: true }).eq("is_published", true),
    db.from("catalog_books").select("id", { count: "exact", head: true }).eq("is_active", true),
    db.from("categories").select("id", { count: "exact", head: true }),
  ]);
  return {
    ebooks: ebooksRes.count ?? 0,
    physical: physicalRes.count ?? 0,
    categories: categoriesRes.count ?? 0,
  };
}

export default async function HomeBento() {
  const [counts, t, tf, locale] = await Promise.all([
    getBentoCounts(),
    getTranslations("home"),
    getTranslations("footer"),
    getLocale(),
  ]);

  const latinLabel = locale === "en" ? "uppercase tracking-[0.16em]" : "tracking-normal";

  return (
    <section className="border-b border-divider/60 bg-bg-surface">
      <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-12 md:py-12">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6 lg:grid-rows-2">

          {/* ── 1. E-library (big card) ── */}
          <Link
            href="/books"
            className="group relative col-span-2 row-span-2 overflow-hidden rounded-2xl border border-divider bg-bg-surface p-6 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-8px_rgba(34,211,238,0.18)] lg:col-span-3 sm:p-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            {/* Soft cyan blob top-right */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full bg-cyan-400/10 blur-[60px] transition-colors duration-500 group-hover:bg-cyan-400/20"
            />

            <div className="relative flex h-full flex-col">
              {/* Eyebrow */}
              <div className={`mb-3 inline-flex items-center gap-2 text-[11px] font-bold text-cyan-500 dark:text-cyan-300 ${latinLabel}`}>
                {/* Open-book icon */}
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
                {t("bentoEbooksLabel")}
              </div>

              {/* Count */}
              <div className="font-khmer-serif text-5xl font-bold text-text-heading sm:text-6xl">
                <AnimatedStat targetValue={counts.ebooks} />
                <span className="text-gold-500">+</span>
              </div>

              {/* Body */}
              <p className="mt-3 max-w-xs text-[14px] leading-relaxed text-text-muted sm:text-[15px]">
                {t("bentoEbooksBody")}
              </p>

              {/* Link line */}
              <div className="mt-auto pt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-cyan-600 dark:text-cyan-300">
                {t("bentoBrowseEbooks")}
                <svg
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </div>
            </div>
          </Link>

          {/* ── 2. On our shelves ── */}
          <Link
            href="/catalogs"
            className="group relative col-span-2 overflow-hidden rounded-2xl border border-divider bg-bg-surface p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-8px_rgba(221,176,34,0.18)] lg:col-span-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
          >
            {/* Gold blob */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-8 -bottom-8 h-40 w-40 rounded-full bg-gold-500/10 blur-[50px] transition-colors duration-500 group-hover:bg-gold-500/18"
            />

            <div className="relative">
              <div className={`mb-2 inline-flex items-center gap-2 text-[11px] font-bold text-gold-600 dark:text-gold-400 ${latinLabel}`}>
                {/* Shelf / archive icon */}
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="2" y="3" width="20" height="5" rx="1" />
                  <path d="M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8" />
                  <path d="M10 12h4" />
                </svg>
                {t("bentoPhysicalLabel")}
              </div>

              <div className="font-khmer-serif text-4xl font-bold text-text-heading">
                <AnimatedStat targetValue={counts.physical} />
                <span className="text-gold-500">+</span>
              </div>

              <div className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-gold-600 dark:text-gold-400">
                {t("bentoOnShelves")}
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
              <AnimatedStat targetValue={counts.categories} />
            </div>
          </div>

          {/* ── 4. Opening hours ── */}
          <div className="col-span-1 rounded-2xl border border-divider bg-bg-surface p-5 lg:col-span-2">
            <div className="mb-2 inline-flex items-center gap-2 text-gold-600 dark:text-gold-400">
              {/* Clock icon */}
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
