import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getIndexableSubjects } from "@/lib/subjects/index";
import { subjectLabel } from "@/lib/subjects/display";
import { HomeSection, SectionHeader, SectionMobileLink } from "./HomeSection";

/**
 * Text links from the homepage to the subject hubs and the learning paths
 * (SEO audit 2026-10, WI-4 / P2-5).
 *
 * The "Browse by subject" grid above links `/books?dept=…` — a filtered
 * listing, which is noindex — so the homepage linked NO subject hub at all,
 * and every hub sat at least two clicks deep. This band links the indexable
 * hubs directly, largest first, and every published learning path.
 *
 * The list is the sitemap's own predicate (`getIndexableSubjects`), never a
 * hand-made one, so a hub that is too thin to index is never linked as if it
 * were a destination, and a hub that graduates appears without an edit. Labels
 * follow the hub-title rule (`subjectLabel`): the approved English name on an
 * English page, otherwise the Khmer name — nothing is translated here.
 *
 * A failed subject read renders the paths alone (or nothing): the homepage
 * must not fail because one band could not be filled.
 */

const MAX_HUBS = 12;

type PathLink = { slug: string; title: string; title_km?: string | null };

export default async function SubjectHubLinks({ locale, paths }: { locale: string; paths: readonly PathLink[] }) {
  const t = await getTranslations("home");
  let hubs: Awaited<ReturnType<typeof getIndexableSubjects>> = [];
  try {
    hubs = [...(await getIndexableSubjects())]
      .sort((a, b) => b.counts.total - a.counts.total || a.slug.localeCompare(b.slug))
      .slice(0, MAX_HUBS);
  } catch {
    hubs = [];
  }
  if (hubs.length === 0 && paths.length === 0) return null;

  const link =
    "focus-field inline-flex items-baseline gap-1.5 rounded-md py-1 text-[15px] font-semibold text-text-heading underline-offset-4 hover:text-brand hover:underline";

  return (
    <HomeSection surface="paper" labelledBy="subject-hubs-title">
      <SectionHeader
        id="subject-hubs-title"
        eyebrow={t("hubLinksEyebrow")}
        title={t("hubLinksTitle")}
        action={{ href: "/subjects", label: t("hubLinksAll") }}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {hubs.length > 0 && (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {hubs.map((hub) => (
              <li key={hub.slug}>
                <Link href={`/subjects/${hub.slug}`} className={`${link} font-khmer-serif`}>
                  {subjectLabel(hub, locale)}
                  <span className="text-[12.5px] font-medium text-text-muted">
                    {t("categoriesItemCount", { count: hub.counts.total })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {paths.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-text-muted">{t("hubLinksPaths")}</h3>
            <ul className="space-y-1">
              {paths.map((path) => (
                <li key={path.slug}>
                  <Link href={`/paths/${path.slug}`} className={link}>
                    {locale === "km" && path.title_km?.trim() ? path.title_km : path.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <SectionMobileLink href="/subjects" label={t("hubLinksAll")} />
    </HomeSection>
  );
}
