// components/ui/home/StatsBand.tsx
// Mid-page ink band with the four collection counters — the page's second
// (and final) dark moment. Stats moved here from the hero so they no longer
// compete with search. Real values from getHomeStats(); AnimatedStat renders
// the final number server-side and counts up as progressive enhancement.
import { getTranslations, getLocale } from "next-intl/server";
import AnimatedStat from "./AnimatedStat";

type HomeStats = { books: number; views: number; downloads: number; users: number };

export default async function StatsBand({ stats }: { stats: HomeStats }) {
  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const cap = locale === "en" ? "uppercase tracking-[0.14em]" : "tracking-normal";

  const items = [
    { label: t("statResources"), value: stats.books },
    { label: t("statViews"), value: stats.views },
    { label: t("statDownloads"), value: stats.downloads },
    { label: t("statMembers"), value: stats.users },
  ];

  return (
    <section className="hero-ink relative" aria-labelledby="stats-band-title">
      <h2 id="stats-band-title" className="sr-only">
        {t("statsHeading")}
      </h2>

      {/* Gold hairlines top & bottom */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-400/50 to-transparent" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-400/50 to-transparent" aria-hidden />

      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12">
        <dl className="grid grid-cols-2 gap-y-10 md:grid-cols-4">
          {items.map((s, i) => (
            <div
              key={s.label}
              className={`relative px-4 text-center md:px-6 ${
                i > 0 ? "md:border-l md:border-white/10" : ""
              }`}
            >
              <dd
                className="font-khmer-serif font-semibold text-white tabular-nums"
                style={{ fontSize: "clamp(28px, 3.2vw, 42px)", lineHeight: 1 }}
              >
                <AnimatedStat targetValue={s.value} />
                <span className="ml-0.5 text-gold-400">+</span>
              </dd>
              <div className="mx-auto mt-3 h-[2px] w-7 rounded-full bg-gradient-to-r from-gold-400 to-gold-500/70" aria-hidden />
              <dt className={`mt-3 text-[11px] font-bold text-blue-200/70 ${cap}`}>
                {s.label}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
