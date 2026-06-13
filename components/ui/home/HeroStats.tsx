// Server component — receives pre-fetched stats from page.tsx, renders the
// inline stat row at the bottom of the hero's left column.
import { getTranslations, getLocale } from "next-intl/server";
import AnimatedStat from "./AnimatedStat";
import type { HomeStats } from "@/lib/home-stats";

export default async function HeroStats({ stats }: { stats: HomeStats }) {
  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const latinLabel = locale === "en" ? "uppercase tracking-[0.14em]" : "tracking-normal";

  const items = [
    {
      key: "resources",
      value: stats.resources,
      label: t("statResources"),
      icon: (
        <svg className="h-3.5 w-3.5 text-gold-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
    },
    {
      key: "views",
      value: stats.views,
      label: t("statViews"),
      icon: (
        <svg className="h-3.5 w-3.5 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
    },
    {
      key: "downloads",
      value: stats.downloads,
      label: t("statDownloads"),
      icon: (
        <svg className="h-3.5 w-3.5 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      ),
    },
    {
      key: "members",
      value: stats.members,
      label: t("statMembers"),
      icon: (
        <svg className="h-3.5 w-3.5 text-gold-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
  ];

  return (
    // Mobile: 2×2 grid with gap. sm+: flex row with hairline dividers.
    <div className="mt-8 sm:mt-10 grid grid-cols-2 gap-y-4 gap-x-0 sm:flex sm:items-center sm:gap-0 sm:divide-x sm:divide-white/10">
      {items.map((item) => (
        <div key={item.key} className="sm:px-5 sm:first:pl-0">
          {/* Number — count-up via AnimatedStat (client component) */}
          <div className="font-khmer-serif text-2xl sm:text-[28px] font-bold leading-none text-white">
            <AnimatedStat targetValue={item.value} />
          </div>
          {/* Icon + label */}
          <div className="mt-1.5 flex items-center gap-1.5">
            {item.icon}
            <span className={`text-[11px] text-blue-200/80 ${latinLabel}`}>{item.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
