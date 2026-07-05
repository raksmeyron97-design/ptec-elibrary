// components/ui/home/FeaturedPublications.tsx
// Homepage slot 2 — text-first editorial showcase of the newest journal
// articles (1 lead + 3 supporting rows). Publications are judged by
// title/authors/venue, so no covers: metadata is the visual.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations, getLocale } from "next-intl/server";
import type { ArticleType } from "@/lib/publications";

type PubRow = {
  id: string;
  slug: string;
  title: string;
  title_km: string | null;
  article_type: ArticleType;
  journal_name: string | null;
  doi: string | null;
  publication_date: string | null;
  abstract: string | null;
  abstract_km: string | null;
  author_names: string | null;
};

async function getFeaturedPublications(): Promise<PubRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("publications_with_stats")
    .select(
      "id, slug, title, title_km, article_type, journal_name, doi, publication_date, abstract, abstract_km, author_names"
    )
    .eq("is_published", true)
    .order("publication_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(4);

  if (error) {
    // Publications table may not exist yet on older deployments — hide the
    // section rather than break the homepage.
    console.error("[FeaturedPublications]", error.message);
    return [];
  }
  return (data ?? []) as PubRow[];
}

function yearOf(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const y = new Date(dateStr).getFullYear();
  return Number.isFinite(y) ? String(y) : null;
}

const TYPE_KEY: Record<ArticleType, string> = {
  article: "typeArticle",
  review: "typeReview",
  account: "typeAccount",
  editorial: "typeEditorial",
};

export default async function FeaturedPublications() {
  const pubs = await getFeaturedPublications();
  if (pubs.length === 0) return null;

  const [t, tPub, locale] = await Promise.all([
    getTranslations("home"),
    getTranslations("publications"),
    getLocale(),
  ]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";

  const [lead, ...rest] = pubs;
  const leadTitle = locale === "km" && lead.title_km ? lead.title_km : lead.title;
  const leadAbstract =
    locale === "km" && lead.abstract_km ? lead.abstract_km : lead.abstract;

  return (
    <section
      className="border-b border-divider/60 bg-bg-surface"
      aria-labelledby="featured-publications-title"
    >
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        {/* ── Header ── */}
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-accent to-brand" aria-hidden />
              <span className={`text-[11px] font-bold text-accent-text ${latinEyebrow}`}>
                {t("pubsEyebrow")}
              </span>
            </div>
            <h2
              id="featured-publications-title"
              className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
              style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
            >
              {t("pubsTitle")}
            </h2>
          </div>
          <Link
            href="/publications"
            className="hidden shrink-0 items-center gap-1.5 text-[13.5px] font-semibold text-brand transition-colors hover:text-brand-hover sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 rounded-sm"
          >
            {t("pubsViewAll")}
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        {/* ── 1 lead + up to 3 rows (lead spans full width when alone) ── */}
        <div className={`grid gap-5 lg:gap-8 ${rest.length > 0 ? "lg:grid-cols-[1.4fr_1fr]" : ""}`}>
          {/* Lead article */}
          <article className="relative rounded-2xl border border-divider bg-paper p-6 transition-colors hover:border-brand/40 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-[6px] bg-brand/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand">
                {tPub(TYPE_KEY[lead.article_type] ?? "typeArticle")}
              </span>
              {lead.journal_name && (
                <span className="text-[12px] font-medium text-text-muted">
                  {lead.journal_name}
                  {yearOf(lead.publication_date) && <> · {yearOf(lead.publication_date)}</>}
                </span>
              )}
            </div>

            <h3 className="font-khmer-serif mt-4 text-[19px] font-bold leading-snug text-text-heading sm:text-[22px]">
              <Link
                href={`/publications/${lead.slug}`}
                className="after:absolute after:inset-0 hover:text-brand transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 rounded-sm"
              >
                {leadTitle}
              </Link>
            </h3>

            {lead.author_names && (
              <p className="mt-2 text-[13.5px] font-medium text-text-muted">
                {lead.author_names}
              </p>
            )}

            {leadAbstract && (
              <p className="mt-3 text-[14px] leading-relaxed text-text-body line-clamp-3">
                {leadAbstract}
              </p>
            )}

            <p className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-brand">
              {t("pubsReadArticle")}
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </p>
          </article>

          {/* Supporting rows */}
          {rest.length > 0 && (
          <div className="flex flex-col divide-y divide-divider rounded-2xl border border-divider bg-paper px-6">
            {rest.map((pub) => {
              const title = locale === "km" && pub.title_km ? pub.title_km : pub.title;
              return (
                <article key={pub.id} className="relative flex flex-1 flex-col justify-center py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-accent-text">
                      {tPub(TYPE_KEY[pub.article_type] ?? "typeArticle")}
                    </span>
                    {yearOf(pub.publication_date) && (
                      <span className="text-[11.5px] text-text-muted">{yearOf(pub.publication_date)}</span>
                    )}
                  </div>
                  <h3 className="font-khmer-serif mt-1.5 text-[15px] font-bold leading-snug text-text-heading line-clamp-2">
                    <Link
                      href={`/publications/${pub.slug}`}
                      className="after:absolute after:inset-0 hover:text-brand transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 rounded-sm"
                    >
                      {title}
                    </Link>
                  </h3>
                  {pub.author_names && (
                    <p className="mt-1 text-[12.5px] text-text-muted line-clamp-1">{pub.author_names}</p>
                  )}
                </article>
              );
            })}
          </div>
          )}
        </div>

        {/* Mobile view-all */}
        <div className="mt-6 sm:hidden">
          <Link
            href="/publications"
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand"
          >
            {t("pubsViewAll")}
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
