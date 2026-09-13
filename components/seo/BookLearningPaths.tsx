import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { learningPathsForBook } from "@/lib/learning-paths/membership-index";
import { pathTitle } from "@/lib/learning-paths/membership";

/**
 * "Part of these learning paths" — the curriculum a book is taught in.
 *
 * ── Why this is a section and not another ResourceConnections chip ───────────
 *
 * ResourceConnections answers "what is this record filed under" — its subject,
 * its authors. Those are attributes of the book. Curriculum membership is a
 * different claim: somebody built a course and chose this book as a step in it.
 * Folding the two into one chip row would state both with the same weight and
 * let a reader read "Pedagogy" and "Early Grade Mathematics: Grade 2" as the
 * same kind of fact.
 *
 * ── What it will NOT render ──────────────────────────────────────────────────
 *
 * Nothing at all, for the 90% of books that are in no path, and nothing when
 * the membership read fails. It never renders an empty heading — a section
 * announcing a relationship and then listing none is worse than silence.
 */
export default async function BookLearningPaths({
  bookId,
  locale,
  className,
}: {
  /** The book's DATABASE id (`dbId`), not its slug — steps reference the id.
   *  Nullable because a record served from a non-Supabase source has none, and
   *  a page must not have to assert an id it may not hold. */
  bookId: string | null | undefined;
  locale: string;
  className?: string;
}) {
  const [paths, t] = await Promise.all([
    learningPathsForBook(bookId),
    getTranslations({ locale, namespace: "paths" }),
  ]);

  if (paths.length === 0) return null;

  return (
    <section
      aria-labelledby="book-learning-paths"
      className={className ?? "mt-10 border-t border-divider pt-6"}
    >
      <h2
        id="book-learning-paths"
        className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted"
      >
        {t("partOfHeading")}
      </h2>
      <p className="mt-1 text-[13px] text-text-muted">{t("partOfIntro")}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {paths.map((p) => (
          <li key={p.id}>
            <Link
              href={`/paths/${p.slug}`}
              className="focus-field inline-flex items-center gap-2 rounded-full border border-divider bg-bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand"
            >
              <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-text-muted">
                {t("eyebrow")}
              </span>
              {pathTitle(p, locale)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
