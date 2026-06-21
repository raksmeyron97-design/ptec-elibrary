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

// ── Shared class tokens (literal strings so Tailwind JIT keeps them) ──────────

// Scroll-entrance: opacity + lift. Applied to the GRID ITEM (outer wrapper) so
// the slow 700ms timing never bleeds into the faster tile hover (inner element).
const FADE_UP =
  "opacity-0 translate-y-4 transition-all duration-700 ease-out " +
  "[&.is-visible]:opacity-100 [&.is-visible]:translate-y-0 " +
  "motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0";

// Light tile surface. Soft radius + gentle shadow; the border is deliberately
// low-contrast (divider/60) to avoid the "visual vibration" that hard card
// outlines cause for readers with astigmatism / sensory sensitivity (WCAG 2.2).
// flex-direction is intentionally NOT set here — each tile adds col/row itself,
// so flex-col and flex-row never collide in the generated CSS.
const TILE =
  "relative flex h-full overflow-hidden rounded-2xl border border-divider/60 " +
  "bg-bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.05)] " +
  "transition-[transform,box-shadow,border-color] duration-300 ease-out " +
  "hover:-translate-y-0.5 hover:border-divider hover:shadow-[0_10px_28px_-14px_rgba(15,23,42,0.22)] " +
  "motion-reduce:transition-none motion-reduce:hover:translate-y-0";

// Gold brand markers carried through the section (diamond = headers, dot = items).
const DIAMOND = "h-[7px] w-[7px] flex-none rotate-45 rounded-[1px] bg-gold-400";
const DOT = "h-[5px] w-[5px] flex-none rounded-full bg-gold-400";

// ── Section ──────────────────────────────────────────────────────────────────
export default async function HomeBento() {
  const [{ books, categories }, t, tf, locale] = await Promise.all([
    getCatalogueCounts(),
    getTranslations("home"),
    getTranslations("footer"),
    getLocale(),
  ]);

  const isKm = locale === "km";
  // Uppercase + tracking reads as a "label" in Latin; Khmer keeps natural spacing.
  const label = locale === "en" ? "uppercase tracking-[0.16em]" : "tracking-normal";

  // Four parallel trust signals — equal weight, so no decorative numbering.
  const features = [
    { title: t("aboutFeatCuratedTitle"), body: t("aboutFeatCuratedBody") },
    { title: t("aboutFeatOpenTitle"), body: t("aboutFeatOpenBody") },
    { title: t("aboutFeatBilingualTitle"), body: t("aboutFeatBilingualBody") },
    { title: t("aboutFeatCampusTitle"), body: t("aboutFeatCampusBody") },
  ];

  return (
    <section className="border-b border-divider/60 bg-paper" aria-labelledby="about-title">
      <div className="mx-auto max-w-[1400px] px-4 py-14 sm:py-16 md:px-12 md:py-20">

        {/* Bento: 1 col (mobile) → 2 col (tablet) → 12 col (desktop).
            Uniform gutters; hierarchy comes from tile size + colour, not borders. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-12">

          {/* ── A · Lede (the dominant tile: brand ink, echoes the hero above) ── */}
          <Reveal className={`sm:col-span-2 lg:col-span-7 lg:row-span-2 ${FADE_UP}`}>
            <div
              className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 p-6 text-white shadow-[0_24px_60px_-30px_rgba(6,11,26,0.7)] sm:p-8 lg:p-10"
              style={{ backgroundImage: "linear-gradient(135deg,#0A1430 0%,#0D1B3E 55%,#0B1733 100%)" }}
            >
              {/* texture echoes the hero: dot grid + warm gold corner glow */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                  backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
                  backgroundSize: "22px 22px",
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ backgroundImage: "radial-gradient(circle at 85% 12%, rgba(245,158,11,0.16), transparent 55%)" }}
              />

              <div className="relative flex h-full flex-col">
                <span className={`inline-flex items-center gap-2 text-[11px] font-bold text-gold-400 ${label}`}>
                  <span aria-hidden className={DIAMOND} />
                  {t("aboutSectionLabel")}
                </span>

                <h2
                  id="about-title"
                  className={`mt-5 max-w-[32rem] font-khmer-serif font-medium ${
                    isKm ? "leading-[1.4]" : "leading-[1.14] tracking-tight"
                  }`}
                  style={{ fontSize: "clamp(25px, 2.7vw, 40px)" }}
                >
                  {t("aboutLede")}
                </h2>

                <p className="mt-4 max-w-md text-[15px] leading-[1.7] text-blue-100/85">
                  {t("aboutSupport")}
                </p>

                <div className="mt-auto pt-8">
                  <Link
                    href="/about"
                    className="group inline-flex items-center gap-2 rounded-sm text-[14px] font-semibold text-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
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
                </div>
              </div>
            </div>
          </Reveal>

          {/* ── B · Catalogue (data tile — the collection's real scale) ── */}
          <Reveal delay={80} className={`lg:col-span-5 ${FADE_UP}`}>
            <div className={`${TILE} flex-col p-5 sm:p-6`}>
              <span className={`inline-flex items-center gap-2 text-[10px] font-bold text-text-muted ${label}`}>
                <span aria-hidden className={DOT} />
                {t("aboutCatalogueLabel")}
              </span>

              <div className="mt-auto grid grid-cols-2 pt-6">
                <div className="pr-5">
                  <div className="font-khmer-serif text-4xl font-semibold leading-none text-text-heading sm:text-[2.75rem]">
                    <AnimatedStat targetValue={books} />
                    <span className="text-gold-600">+</span>
                  </div>
                  <div className={`mt-2 text-[11px] font-semibold text-text-muted ${label}`}>
                    {t("aboutResourcesWord")}
                  </div>
                </div>
                <div className="border-l border-divider/60 pl-5">
                  <div className="font-khmer-serif text-4xl font-semibold leading-none text-text-heading sm:text-[2.75rem]">
                    <AnimatedStat targetValue={categories} />
                  </div>
                  <div className={`mt-2 text-[11px] font-semibold text-text-muted ${label}`}>
                    {t("aboutCategoriesWord")}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* ── C · Visit (access model + opening hours — one practical tile) ── */}
          <Reveal delay={140} className={`lg:col-span-5 ${FADE_UP}`}>
            <div className={`${TILE} flex-col p-5 sm:p-6`}>
              <div>
                <div className={`flex items-center gap-2 text-[10px] font-bold text-text-muted ${label}`}>
                  <span aria-hidden className={DOT} />
                  {t("aboutAccessLabel")}
                </div>
                <div className="mt-1.5 text-[15px] font-semibold text-text-heading">{t("aboutAccessValue")}</div>
              </div>

              <div className="mt-4 border-t border-divider/60 pt-4">
                <div className={`flex items-center gap-2 text-[10px] font-bold text-text-muted ${label}`}>
                  <span aria-hidden className={DOT} />
                  {t("aboutOnCampusLabel")}
                </div>
                <div className="mt-1.5 text-[15px] font-semibold text-text-heading">{tf("hoursValue")}</div>
                <div className="mt-0.5 text-[12px] text-text-muted">{tf("hoursClosed")}</div>
              </div>
            </div>
          </Reveal>

          {/* ── D–G · Four parallel trust signals (a quiet, equal-weight band) ── */}
          {features.map((f, i) => (
            <Reveal key={f.title} delay={200 + i * 60} className={`sm:col-span-1 lg:col-span-3 ${FADE_UP}`}>
              <div className={`${TILE} flex-col p-5`}>
                <h3 className={`flex items-center gap-2 text-[11px] font-bold text-text-heading ${label}`}>
                  <span aria-hidden className={DOT} />
                  {f.title}
                </h3>
                <p className="mt-2 text-[13px] leading-[1.6] text-text-muted">{f.body}</p>
              </div>
            </Reveal>
          ))}

          {/* ── H · Colophon (who runs it / since when — institutional footing) ── */}
          <Reveal delay={200 + features.length * 60} className={`sm:col-span-2 lg:col-span-12 ${FADE_UP}`}>
            <div className={`${TILE} flex-row flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 sm:px-6`}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className={`text-[10px] font-bold text-text-muted ${label}`}>{t("aboutInitiativeLabel")}</span>
                <span className="text-[14px] font-semibold text-text-heading">{t("aboutInitiativeName")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span aria-hidden className={DOT} />
                <span className={`text-[11px] font-semibold text-text-muted ${label}`}>{t("aboutEstablished")}</span>
              </div>
            </div>
          </Reveal>

        </div>
      </div>
    </section>
  );
}