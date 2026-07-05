import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import type { PublicationAuthor } from "@/lib/publications";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Shows the primary author's other published articles in this repository,
 * matched relationally via publication_authorships (unlike theses' AuthorCard,
 * which matches on a literal author_names string — publications has a proper
 * FK-based author model). Skipped entirely when there is no other work.
 */
export default async function MoreFromAuthor({
  currentId,
  author,
}: {
  currentId: string;
  author: PublicationAuthor;
}) {
  const supabase = createServiceClient();

  const [{ data: rows }, { count }] = await Promise.all([
    supabase
      .from("publication_authorships")
      .select("publication_id, publications!inner(id, slug, title, title_km, cover_url, is_published, publication_date, journal_name)")
      .eq("author_id", author.id)
      .eq("publications.is_published", true)
      .neq("publication_id", currentId)
      .limit(12),
    supabase
      .from("publication_authorships")
      .select("publication_id", { count: "exact", head: true })
      .eq("author_id", author.id),
  ]);

  type Row = { publications: { id: string; slug: string; title: string; title_km: string | null; cover_url: string | null; publication_date: string | null; journal_name: string | null } };
  const otherWorks = ((rows ?? []) as unknown as Row[])
    .map((r) => r.publications)
    .filter(Boolean)
    .sort((a, b) => (b.publication_date ?? "").localeCompare(a.publication_date ?? ""))
    .slice(0, 6);

  if (otherWorks.length === 0) return null;

  const pubCount = count ?? otherWorks.length + 1;
  const scholarSearchUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(author.full_name)}`;
  const t = await getTranslations("publicationDetail");

  return (
    <section className="mt-16">
      <div className="mb-6 flex items-center gap-2">
        <span className="h-[3px] w-8 rounded-full bg-gradient-to-r from-brand to-accent" />
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">
          {t("moreFromAuthor")}
        </span>
      </div>

      <div className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[18px] font-bold text-brand">
            {initials(author.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-bold text-text-heading">{author.full_name}</h3>
            <p className="mt-0.5 text-[13px] text-text-muted">
              {t("publicationsInRepo", { count: pubCount })}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
              {author.orcid && (
                <a
                  href={`https://orcid.org/${author.orcid.replace(/^https?:\/\/orcid\.org\//, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-text-muted transition-colors hover:text-brand"
                >
                  ORCID <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <a
                href={scholarSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-text-muted transition-colors hover:text-brand"
              >
                {t("searchGoogleScholar")} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        <ul className="mt-5 grid gap-2 border-t border-divider pt-4 sm:grid-cols-2">
          {otherWorks.map((w) => (
            <li key={w.id}>
              <Link
                href={`/publications/${w.slug}`}
                className="group flex items-start gap-2.5 rounded-xl p-2 transition-colors duration-150 hover:bg-bg-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <span className="min-w-0 line-clamp-2 text-[13.5px] font-medium text-text-body transition-colors group-hover:text-brand">
                  {w.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
