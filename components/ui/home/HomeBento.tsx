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

// Shared entrance classes (literal strings so Tailwind JIT can see them)
const FADE_UP =
  "opacity-0 translate-y-3 transition-all duration-700 ease-out " +
  "[&.is-visible]:opacity-100 [&.is-visible]:translate-y-0 " +
  "motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0";

const RULE =
  "h-px origin-left scale-x-0 bg-divider transition-transform duration-700 ease-out " +
  "[&.is-visible]:scale-x-100 motion-reduce:transition-none motion-reduce:scale-x-100";

// ── Section ──────────────────────────────────────────────────────────────────
export default async function HomeBento() {
  const [{ books, categories }, t, tf, locale] = await Promise.all([
    getCatalogueCounts(),
    getTranslations("home"),
    getTranslations("footer"),
    getLocale(),
  ]);

  const isLatin = locale === "en";
  const latinLabel = isLatin ? "uppercase tracking-[0.18em]" : "tracking-normal";
  const latinTiny = isLatin ? "uppercase tracking-[0.16em]" : "tracking-normal";

  // Trust signals — parallel, so no decorative numbering; the label carries it.
  // `cls` builds the hairline grid: vertical rules between columns (desktop),
  // 2×2 with horizontal rules between rows (mobile).
  const features = [
    {
      title: t("aboutFeatCuratedTitle"),
      body: t("aboutFeatCuratedBody"),
      cls: "pl-0 pr-4 sm:pr-5 lg:px-6 lg:pl-0 lg:border-l-0",
    },
    {
      title: t("aboutFeatOpenTitle"),
      body: t("aboutFeatOpenBody"),
      cls: "pl-4 sm:pl-5 pr-0 lg:px-6 border-l border-divider/70",
    },
    {
      title: t("aboutFeatBilingualTitle"),
      body: t("aboutFeatBilingualBody"),
      cls:
        "pl-0 pr-4 sm:pr-5 lg:px-6 border-t border-divider/70 pt-7 " +
        "lg:border-t-0 lg:pt-0 lg:border-l lg:border-divider/70",
    },
    {
      title: t("aboutFeatCampusTitle"),
      body: t("aboutFeatCampusBody"),
      cls:
        "pl-4 sm:pl-5 pr-0 lg:px-6 lg:pr-0 border-l border-t border-divider/70 pt-7 " +
        "lg:border-t-0 lg:pt-0",
    },
  ];

  return (
    <section className="border-b border-divider/60 bg-paper" aria-labelledby="about-title">
      <div className="mx-auto max-w-[1400px] px-4 py-14 sm:py-16 md:px-12 md:py-20">

        {/* ── Label row ── */}
        <Reveal className={`flex items-baseline justify-between gap-4 pb-4 ${FADE_UP}`}>
          <span
            className={`inline-flex items-center gap-2 text-[11px] font-bold text-gold-600 dark:text-gold-400 ${latinLabel}`}
          >
            <span aria-hidden className="h-[7px] w-[7px] rotate-45 rounded-[1px] bg-gold-400" />
            {t("aboutSectionLabel")}
          </span>
          <span className={`text-[11px] font-semibold text-text-muted ${latinTiny}`}>
            {t("aboutEstablished")}
          </span>
        </Reveal>

        <Reveal className={RULE} />

        {/* ── Lede + colophon ── */}
        <div className="grid gap-6 py-7 sm:py-9 lg:grid-cols-[1.55fr_0.9fr] lg:gap-12">
          <Reveal delay={80} className={FADE_UP}>
            <h2
              id="about-title"
              className={`max-w-[34rem] font-khmer-serif font-medium text-text-heading ${
                locale === "km" ? "leading-[1.4]" : "leading-[1.16] tracking-tight"
              }`}
              style={{ fontSize: "clamp(26px, 3.4vw, 42px)" }}
            >
              {t("aboutLede")}
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-[1.7] text-text-muted">
              {t("aboutSupport")}
            </p>
          </Reveal>

          <Reveal
            delay={160}
            className={`self-start border-divider/70 lg:border-l lg:pl-8 ${FADE_UP}`}
          >
            <dl className="grid gap-4">
              <div>
                <dt className={`text-[10px] font-bold text-text-muted ${latinTiny}`}>
                  {t("aboutInitiativeLabel")}
                </dt>
                <dd className="mt-0.5 text-[14px] font-semibold text-text-heading">
                  {t("aboutInitiativeName")}
                </dd>
              </div>

              <div>
                <dt className={`text-[10px] font-bold text-text-muted ${latinTiny}`}>
                  {t("aboutCatalogueLabel")}
                </dt>
                <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[14px] text-text-heading">
                  <span className="font-khmer-serif text-2xl font-semibold leading-none">
                    <AnimatedStat targetValue={books} />
                    <span className="text-gold-600">+</span>
                  </span>
                  <span className="text-text-muted">{t("aboutResourcesWord")}</span>
                  <span aria-hidden className="text-divider">·</span>
                  <span className="font-khmer-serif text-2xl font-semibold leading-none">
                    <AnimatedStat targetValue={categories} />
                  </span>
                  <span className="text-text-muted">{t("aboutCategoriesWord")}</span>
                </dd>
              </div>

              <div>
                <dt className={`text-[10px] font-bold text-text-muted ${latinTiny}`}>
                  {t("aboutAccessLabel")}
                </dt>
                <dd className="mt-0.5 text-[14px] font-medium text-text-heading">
                  {t("aboutAccessValue")}
                </dd>
              </div>

              <div>
                <dt className={`text-[10px] font-bold text-text-muted ${latinTiny}`}>
                  {t("aboutOnCampusLabel")}
                </dt>
                <dd className="mt-0.5 text-[14px] font-medium text-text-heading">
                  {tf("hoursValue")}
                </dd>
                <dd className="mt-0.5 text-[12px] text-text-muted">{tf("hoursClosed")}</dd>
              </div>
            </dl>
          </Reveal>
        </div>

        <Reveal className={RULE} />

        {/* ── Trust signals ── */}
        <div className="grid grid-cols-2 gap-y-7 py-8 sm:py-9 lg:grid-cols-4 lg:gap-y-0">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 70} className={`relative ${f.cls} ${FADE_UP}`}>
              <h3
                className={`mb-2 flex items-center gap-2 text-[11px] font-bold text-text-heading ${latinTiny}`}
              >
                <span aria-hidden className="h-[5px] w-[5px] flex-none rounded-full bg-gold-400" />
                {f.title}
              </h3>
              <p className="text-[13px] leading-[1.6] text-text-muted">{f.body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className={RULE} />

        {/* ── Link ── */}
        <Reveal delay={60} className={`pt-5 ${FADE_UP}`}>
          <Link
            href="/about"
            className="group inline-flex items-center gap-2 rounded-sm text-[14px] font-semibold text-gold-600 dark:text-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
          >
            {t("aboutMoreLink")}
            <svg
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </Reveal>

      </div>
    </section>
  );
}