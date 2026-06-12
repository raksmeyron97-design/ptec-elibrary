import { createClient } from "@/lib/supabase/server";
import { getTranslations, getLocale } from 'next-intl/server';
import AnimatedStat from "./AnimatedStat";

async function getStats() {
  const supabase = await createClient();
  const [booksRes, downloadsRes, usersRes, viewsRes] = await Promise.all([
    supabase.from("books").select("id", { count: "exact", head: true }).eq("is_published", true),
    supabase.from("books").select("download_count").eq("is_published", true),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("books").select("view_count").eq("is_published", true),
  ]);
  const totalDownloads = (downloadsRes.data ?? []).reduce((s, b) => s + (b.download_count ?? 0), 0);
  const totalViews = (viewsRes.data ?? []).reduce((s, b) => s + (b.view_count ?? 0), 0);
  return { books: booksRes.count ?? 0, downloads: totalDownloads, users: usersRes.count ?? 0, views: totalViews };
}

export default async function HeroStatsStrip() {
  const [stats, t, locale] = await Promise.all([
    getStats(),
    getTranslations('home'),
    getLocale()
  ]);

  const latinCaption = locale === 'en'
    ? 'uppercase tracking-[0.12em] text-[10px] sm:text-[11px]'
    : 'tracking-normal text-[11px] sm:text-[12px]';

  const heroStats = [
    { label: t("statResources"), value: stats.books },
    { label: t("statViews"),     value: stats.views },
    { label: t("statDownloads"), value: stats.downloads },
    { label: t("statEducators"), value: stats.users },
  ];

  return (
    <div className="border-b border-divider/70 bg-bg-surface/50 py-8 sm:py-10">
      <div className="mx-auto max-w-[1000px] px-4 md:px-12 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
        {heroStats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="font-khmer-serif text-3xl sm:text-4xl font-bold text-brand flex items-center justify-center">
              <AnimatedStat targetValue={s.value} /><span className="text-gold-600">+</span>
            </div>
            <div className={`mt-2 font-semibold text-text-muted ${latinCaption}`}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
