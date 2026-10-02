// An issue's table of contents — the main content of a journal's own homepage
// (ThaiJO, CJBAR and Springer all lead with it) and the whole of an issue
// page. One component for both, so the two pages cannot list the same issue
// differently.
//
// Each entry carries what a reader triages on: title, authors, the printed
// position (pages or article number), the DOI as a full https://doi.org link
// (Crossref's display guidelines), and the access badge — the same rights
// claim AccessBadge makes everywhere else.
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import AccessBadge from "@/components/ui/publications/AccessBadge";
import type { Publication } from "@/lib/publications";
import { articlePath } from "@/lib/journals/urls";
import { authorList } from "@/lib/citations";
import { doiUrl, normalizeDoi } from "@/lib/seo/identifiers";

const TYPE_KEY = {
  review: "typeReview",
  account: "typeAccount",
  editorial: "typeEditorial",
} as const;

export default async function IssueToc({
  articles,
  locale,
  limit,
}: {
  articles: readonly Publication[];
  locale: string;
  /** Show at most this many; the caller links to the full issue. */
  limit?: number;
}) {
  const [t, tPub, tDetail] = await Promise.all([
    getTranslations({ locale, namespace: "journals" }),
    getTranslations({ locale, namespace: "publications" }),
    getTranslations({ locale, namespace: "publicationDetail" }),
  ]);
  const labels = {
    openAccess: tDetail("openAccess"),
    licensed: tDetail("accessLicensed"),
    rightsUnstated: tDetail("accessRightsUnstated"),
  };
  const shown = limit ? articles.slice(0, limit) : articles;

  return (
    <ol className="divide-y divide-divider overflow-hidden rounded-2xl border border-divider bg-bg-surface">
      {shown.map((a) => {
        const authors = authorList(a);
        const pages = a.page_start
          ? t("pages", { range: a.page_end ? `${a.page_start}–${a.page_end}` : a.page_start })
          : a.article_no
            ? t("articleNumber", { n: a.article_no })
            : null;
        const doi = normalizeDoi(a.doi);
        const href = doi ? doiUrl(doi) : null;
        const articleTitle = locale === "km" && a.title_km ? a.title_km : a.title;
        const type = a.article_type in TYPE_KEY ? tPub(TYPE_KEY[a.article_type as keyof typeof TYPE_KEY]) : null;
        return (
          <li key={a.id} className="px-5 py-4">
            {type && (
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-accent-text">{type}</p>
            )}
            <h3 className="font-khmer-serif text-[16px] font-semibold leading-snug text-text-heading">
              <Link href={articlePath(a.slug)} className="hover:text-brand hover:underline">
                {articleTitle}
              </Link>
            </h3>
            {authors.length > 0 && <p className="mt-1 text-[13.5px] text-text-body">{authors.join(", ")}</p>}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-text-muted">
              {pages && <span>{pages}</span>}
              {href && (
                <a
                  href={href}
                  className="inline-flex min-h-6 items-center break-all font-mono hover:text-brand hover:underline"
                  rel="noopener noreferrer"
                >
                  {href}
                </a>
              )}
              <AccessBadge license={a.license} labels={labels} />
            </p>
          </li>
        );
      })}
    </ol>
  );
}
