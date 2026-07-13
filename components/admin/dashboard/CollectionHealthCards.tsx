import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Library, PlusCircle, BookOpen, GraduationCap, BookMarked, FileText, ShieldAlert, type LucideIcon } from "lucide-react";
import type { CollectionHealthData } from "@/lib/admin/intelligence";

/**
 * Lifetime inventory + gap counts. Deliberately separated from the period
 * KPI row (these numbers do not change with the date filter); every gap
 * count links to the surface that fixes it. An empty physical catalogue is
 * an onboarding card, not a failed metric.
 */
export default async function CollectionHealthCards({ health }: { health: CollectionHealthData }) {
  const t = await getTranslations("adminDashboard.health");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale === "km" ? "km-KH" : "en-US");

  const totals: { key: string; value: number; href: string; icon: LucideIcon; tint: string }[] = [
    { key: "books", value: health.totals.books, href: "/admin/manage", icon: BookOpen, tint: "dash-ico--views" },
    { key: "theses", value: health.totals.theses, href: "/admin/theses", icon: GraduationCap, tint: "dash-ico--reader" },
    { key: "publications", value: health.totals.publications, href: "/admin/publications", icon: BookMarked, tint: "dash-ico--visitors" },
    { key: "posts", value: health.totals.posts, href: "/admin/posts", icon: FileText, tint: "dash-ico--downloads" },
  ];

  const gaps: { key: string; value: number; href: string }[] = [
    { key: "drafts", value: health.drafts, href: "/admin/review" },
    { key: "oldDrafts", value: health.oldDrafts, href: "/admin/review" },
    { key: "missingCover", value: health.missingCover, href: "/admin/data-quality" },
    { key: "missingDescription", value: health.missingDescription, href: "/admin/data-quality" },
    { key: "missingAuthor", value: health.missingAuthor, href: "/admin/data-quality" },
    { key: "missingDepartment", value: health.missingDepartment, href: "/admin/data-quality" },
    { key: "missingLanguage", value: health.missingLanguage, href: "/admin/data-quality" },
    { key: "missingIdentifier", value: health.missingIdentifier, href: "/admin/data-quality" },
    { key: "missingKeywords", value: health.missingKeywords, href: "/admin/data-quality" },
    { key: "brokenFiles", value: health.brokenFiles, href: "/admin/data-quality" },
    { key: "neverViewed", value: health.neverViewed, href: "/admin?view=content&preset=neverViewed" },
  ];

  return (
    <section aria-labelledby="health-heading" className="dash-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="dash-ico dash-ico--brand dash-ico--md" aria-hidden="true">
            <Library className="h-[18px] w-[18px]" />
          </span>
          <h3 id="health-heading" className="text-[15px] font-bold text-text-heading">
            {t("title")}
          </h3>
        </div>
        <span className="text-[11.5px] text-text-muted">
          {t("lifetimeNote")}
          {health.avgCompleteness !== null && ` · ${t("avgCompleteness", { pct: health.avgCompleteness })}`}
        </span>
      </div>

      {/* Inventory totals */}
      <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {totals.map(({ key, value, href, icon: Icon, tint }) => (
          <li key={key}>
            <Link
              href={href}
              className="dash-card dash-card--interactive flex items-center gap-3 px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span className={`dash-ico ${tint} dash-ico--md`} aria-hidden="true">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold text-text-muted">{t(`totals.${key}`)}</span>
                <span className="block text-[20px] font-bold leading-tight tabular-nums text-text-heading">{nf.format(value)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Physical catalogue: onboarding when empty */}
      {health.totals.catalog === 0 ? (
        <Link
          href="/admin/catalogs"
          className="mt-2.5 flex items-center gap-3 rounded-xl border border-dashed border-divider bg-paper px-3 py-3 transition-colors hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <PlusCircle className="h-4.5 w-4.5 shrink-0 text-brand" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-text-heading">{t("catalogEmptyTitle")}</span>
            <span className="block text-[11.5px] text-text-muted">{t("catalogEmptyHint")}</span>
          </span>
        </Link>
      ) : (
        <Link
          href="/admin/catalogs"
          className="mt-2.5 flex items-center gap-3 rounded-xl border border-divider bg-paper px-3 py-2.5 transition-colors hover:border-brand/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Library className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <span className="text-[13px] text-text-body">
            {t("catalogCount", { count: nf.format(health.totals.catalog) })}
          </span>
        </Link>
      )}

      {/* Gap counts — broken files are surfaced as critical, everything else
          as a recommended fix; resolved gaps stay quiet. */}
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {gaps.map(({ key, value, href }) => {
          const critical = key === "brokenFiles" && value > 0;
          const cls = critical
            ? "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-400"
            : value > 0
              ? "border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-400"
              : "border-divider bg-bg-surface text-text-muted hover:border-brand/30";
          return (
            <li key={key}>
              <Link
                href={href}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${cls}`}
              >
                {critical && <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
                {t(`gaps.${key}`)}
                <span className="tabular-nums">{nf.format(value)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
