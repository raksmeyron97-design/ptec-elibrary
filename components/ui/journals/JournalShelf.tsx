// The journals in the library, as links to their own pages. Rendered on the
// /journals listing; it is the hub → journal edge that keeps every journal
// page from being an orphan. A journal with no public article is left out —
// its page is an empty, noindex shell, and linking it from the hub would
// advertise nothing.
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import type { JournalSummary } from "@/lib/journals/data";
import { journalTitle } from "@/lib/journals/types";
import { journalPath } from "@/lib/journals/urls";

export default async function JournalShelf({
  journals,
  locale,
}: {
  journals: readonly JournalSummary[];
  locale: string;
}) {
  const shown = journals.filter((j) => j.articleCount > 0);
  if (shown.length === 0) return null;
  const t = await getTranslations("journals");

  return (
    <section aria-labelledby="journal-shelf-heading" className="mt-5">
      <h2
        id="journal-shelf-heading"
        className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted"
      >
        {t("shelfHeading")}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((j) => {
          const title = journalTitle(j, locale);
          const publisher = locale === "km" && j.publisher_name_km ? j.publisher_name_km : j.publisher_name;
          return (
            <li key={j.id}>
              <Link
                href={journalPath(j.slug)}
                className="group flex h-full flex-col rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm transition-colors duration-150 hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 motion-reduce:transition-none"
              >
                <span className="font-khmer-serif text-[16px] font-bold leading-snug text-text-heading group-hover:text-brand">
                  {title}
                </span>
                {publisher && (
                  <span className="mt-1 text-[12.5px] leading-5 text-text-muted">{publisher}</span>
                )}
                <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-[12.5px] font-semibold text-text-muted">
                  <span>
                    {t("articleCount", { count: j.articleCount })}
                    {j.issueCount > 0 && <> · {t("issueCount", { count: j.issueCount })}</>}
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
