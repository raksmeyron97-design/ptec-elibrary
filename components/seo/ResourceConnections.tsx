import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { resolveAuthorLinks, resolveSubjectLinks } from "@/lib/resources/connections";

/**
 * The "what is this connected to" block on a resource detail page: the subject
 * it belongs to, and the people who wrote it, as links to their entity hubs.
 *
 * ── Why a resource page needs this ───────────────────────────────────────────
 *
 * Before V2 no resource detail page linked to a subject or an author page at
 * all (docs/SEO-V2-AUDIT.md F-4). The library rendered the category as a badge
 * and the byline as plain text, so the topic and entity layers had no inbound
 * links from the resources they describe — the knowledge graph existed in the
 * database and nowhere in the HTML.
 *
 * ── What it will NOT render ──────────────────────────────────────────────────
 *
 * Nothing, when nothing resolves. lib/resources/connections.ts returns a link
 * only for a hub page that actually has resources on it, so an unrecognised
 * byline or an empty subject degrades to this component rendering null rather
 * than to a dead link or an empty heading. It never invents a relationship,
 * and it never repeats information the page has not already stated.
 */
export default async function ResourceConnections({
  locale,
  subjectNames = [],
  authorNames = [],
  className,
}: {
  locale: string;
  /** The record's subject name(s) — one for a book or thesis, several for a
   *  publication. Unmatched names are dropped, not rendered as dead text. */
  subjectNames?: readonly (string | null | undefined)[];
  /** Verified author names — pass [] when the author is unknown. */
  authorNames?: readonly (string | null | undefined)[];
  className?: string;
}) {
  const [subjects, authors, t, tAuthors] = await Promise.all([
    resolveSubjectLinks(subjectNames),
    resolveAuthorLinks(authorNames),
    getTranslations({ locale, namespace: "subjects" }),
    getTranslations({ locale, namespace: "authors" }),
  ]);

  if (subjects.length === 0 && authors.length === 0) return null;

  return (
    <section
      aria-labelledby="resource-connections"
      className={className ?? "mt-10 border-t border-divider pt-6"}
    >
      {/* Neutral heading: this block mixes subjects and people, so it cannot
          borrow the subject page's "Related subjects". */}
      <h2
        id="resource-connections"
        className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted"
      >
        {t("connectionsHeading")}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {subjects.map((subject) => (
          <ConnectionChip
            key={subject.href}
            href={subject.href}
            label={subject.name}
            kind={t("eyebrow")}
          />
        ))}
        {authors.map((author) => (
          <ConnectionChip
            key={author.href}
            href={author.href}
            label={author.name}
            kind={tAuthors("eyebrow")}
          />
        ))}
      </div>
    </section>
  );
}

function ConnectionChip({
  href,
  label,
  kind,
}: {
  href: string;
  label: string;
  kind?: string;
}) {
  return (
    <Link
      href={href}
      className="focus-field inline-flex items-center gap-2 rounded-full border border-divider bg-bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand"
    >
      {kind && (
        <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-text-muted">
          {kind}
        </span>
      )}
      {label}
    </Link>
  );
}
