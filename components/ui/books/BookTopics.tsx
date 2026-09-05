import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getPublicTopics } from "@/lib/semantic/insights";
import { resolveSubjectLinks } from "@/lib/resources/connections";
import { normalizeSearchText } from "@/lib/search/normalize";

/**
 * "Topics covered" — what this document demonstrably discusses, and how much
 * of it each topic occupies.
 *
 * ── What the numbers are, exactly ────────────────────────────────────────────
 *
 * A page count, and nothing more: the number of BODY pages of this PDF on
 * which the topic appears. Front matter, contents pages and bibliographies are
 * excluded before counting (lib/semantic/passages.ts), so a contents listing
 * cannot make a book "cover" everything it names, and running headers cannot
 * make one topic appear on every page.
 *
 * The count is the strongest claim the data supports. It is deliberately NOT
 * presented as printed page NUMBERS: `book_pages.page_no` is the PDF's page
 * index, which for a book with twenty pages of front matter is nineteen off
 * the number printed on the page — a reader told "page 111" would turn to the
 * wrong one. The proving page list is stored (0137) so the claim stays
 * auditable; only the count is published.
 *
 * ── Why the topic names are not generated ────────────────────────────────────
 *
 * They are the librarian's own tags on this record, verbatim. The corpus's job
 * here is to prove and quantify them, never to name them — a generated topic
 * would be fabricated metadata about a real document, and a tag with no
 * support in the text is simply not shown.
 *
 * ── Rendering nothing is the normal case ─────────────────────────────────────
 *
 * Most of this collection has no insights: every Khmer-script book fails the
 * text-health gate (its extraction is structurally broken — see
 * docs/SEO-SEMANTIC-CHUNKS-AUDIT.md §4), and no record has any until the build
 * script has run over it. So this component returns null far more often than
 * it renders, and must stay cheap and silent when it does.
 */
export default async function BookTopics({
  bookId,
  locale,
  className,
}: {
  bookId: string;
  locale: string;
  className?: string;
}) {
  const topics = await getPublicTopics("book", bookId);
  if (topics.length === 0) return null;

  const [t, subjectLinks] = await Promise.all([
    getTranslations({ locale, namespace: "bookDetail" }),
    // A topic that IS one of the library's subjects becomes a link into the
    // subject hub; resolveSubjectLinks returns one only when that hub has
    // resources on it, so this can never produce a dead end. Everything else
    // renders as plain text rather than as a link to a search result page.
    resolveSubjectLinks(topics.map((topic) => topic.label)),
  ]);

  const hrefByKey = new Map(subjectLinks.map((link) => [normalizeSearchText(link.name), link.href]));

  return (
    <section
      aria-labelledby="book-topics-heading"
      className={className ?? "mt-8 sm:mt-12 rounded-[24px] border border-divider bg-bg-surface p-5 sm:p-6"}
    >
      <h2
        id="book-topics-heading"
        className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted"
      >
        {t("topicsHeading")}
      </h2>

      <ul className="mt-4 flex flex-wrap gap-2.5">
        {topics.map((topic) => {
          const href = hrefByKey.get(normalizeSearchText(topic.label));
          const pageCount = topic.pages.length + topic.morePages;
          const label = (
            <>
              <span className="font-semibold text-text-primary">{topic.label}</span>
              <span className="ml-2 text-text-muted">{t("topicsPageCount", { count: pageCount })}</span>
            </>
          );
          return (
            <li key={topic.label}>
              {href ? (
                <Link
                  href={href}
                  className="focus-field inline-flex items-center rounded-full border border-divider bg-paper px-3.5 py-1.5 text-[13.5px] transition-colors hover:border-brand hover:text-brand"
                >
                  {label}
                </Link>
              ) : (
                <span className="inline-flex items-center rounded-full border border-divider bg-paper px-3.5 py-1.5 text-[13.5px]">
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* The provenance line is not decoration. A reader has to be able to tell
          this apart from a blurb, and the honest description of the number is
          also the one that makes it useful. */}
      <p className="mt-4 text-[13px] leading-relaxed text-text-muted">{t("topicsProvenance")}</p>
    </section>
  );
}
