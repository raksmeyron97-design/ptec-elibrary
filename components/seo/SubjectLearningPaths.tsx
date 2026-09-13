import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSubjectLearningPaths } from "@/lib/learning-paths/subject-links";

/**
 * "Structured Curricula & Learning Paths" — the learning paths teaching resources
 * under this subject.
 *
 * ── Invariant: Paths do NOT count toward the §5 depth gate ───────────────────
 *
 * Learning paths are curated wrappers around books already counted. Letting
 * wrappers count as primary resources would re-inflate thin hubs (e.g. ភាសា,
 * which holds 4 books and must remain noindex, follow). The UI rail renders
 * on the subject hub, but the depth gate measures primary resources only.
 *
 * ── What it will NOT render ──────────────────────────────────────────────────
 *
 * Returns null when the subject has no published learning paths (e.g. 23 of
 * 25 subjects), leaving zero empty sections or empty headings.
 */
export default async function SubjectLearningPaths({
  subjectName,
  locale,
  className,
}: {
  subjectName: string;
  locale: string;
  className?: string;
}) {
  const [paths, t] = await Promise.all([
    getSubjectLearningPaths(subjectName),
    getTranslations({ locale, namespace: "subjects" }),
  ]);

  if (paths.length === 0) return null;

  return (
    <section
      aria-labelledby="subject-learning-paths"
      className={
        className ??
        "mb-10 rounded-2xl border border-divider bg-bg-surface p-5 sm:p-6"
      }
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2
            id="subject-learning-paths"
            className="text-[18px] font-bold text-text-heading"
          >
            {t("curriculumHeading")}{" "}
            <span className="text-[14px] font-semibold text-text-muted">
              ({paths.length})
            </span>
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">
            {t("curriculumIntro")}
          </p>
        </div>
        <Link
          href="/paths"
          className="focus-field rounded-sm text-[13px] font-semibold text-brand transition-colors hover:underline"
        >
          {t("browseAllPaths")} →
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {paths.map((p) => {
          const title = locale === "km" && p.titleKm ? p.titleKm : p.title;
          const desc = locale === "km" && p.descriptionKm ? p.descriptionKm : p.description;
          return (
            <li key={p.id}>
              <Link
                href={`/paths/${p.slug}`}
                className="focus-field group flex h-full flex-col justify-between rounded-xl border border-divider bg-paper p-4 transition-all hover:border-brand/40 hover:shadow-sm"
              >
                <div>
                  <span className="inline-block text-[10.5px] font-bold uppercase tracking-[0.1em] text-brand">
                    {t("pathEyebrow")}
                  </span>
                  <h3 className="mt-1 font-semibold text-text-heading transition-colors group-hover:text-brand">
                    {title}
                  </h3>
                  {desc && (
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-text-muted">
                      {desc}
                    </p>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-brand">
                  <span>{t("viewCurriculum")}</span>
                  <span aria-hidden="true">→</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
