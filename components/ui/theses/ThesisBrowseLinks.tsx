import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getThesisProgramGroups, getThesisYearGroups, programName } from "@/lib/theses/browse.server";

/**
 * The /theses hub's links to its year and programme pages (SEO Phase 3.5).
 * Only pages that exist are linked (lib/theses/browse.ts), so this renders
 * nothing until a year or programme holds enough works. A failed read renders
 * nothing too: the list below still reaches every thesis.
 */
export default async function ThesisBrowseLinks({ locale, show = true }: { locale: string; show?: boolean }) {
  if (!show) return null;
  const loaded = await Promise.all([getThesisYearGroups(), getThesisProgramGroups()]).catch(() => null);
  if (!loaded) return null;
  const [years, programs] = loaded;
  if (years.length === 0 && programs.length === 0) return null;
  const [t, names] = await Promise.all([
    getTranslations({ locale, namespace: "theses" }),
    Promise.all(programs.map((p) => programName(p.key, locale))),
  ]);
  const linkClass = "focus-field rounded-sm font-semibold text-brand hover:underline";
  return (
    <nav className="mb-6 grid gap-2 text-[14px] text-text-body" aria-label={t("browseByYear")}>
      {years.length > 0 && (
        <p>
          <span className="text-text-muted">{t("browseByYear")}: </span>
          {years.map((y, i) => (
            <span key={y.key}>
              {i > 0 && " · "}
              <Link href={`/theses/year/${y.key}`} className={linkClass}>
                {y.key}
              </Link>{" "}
              <span className="text-text-muted">({y.count})</span>
            </span>
          ))}
        </p>
      )}
      {programs.length > 0 && (
        <p>
          <span className="text-text-muted">{t("browseByProgram")}: </span>
          {programs.map((p, i) => (
            <span key={p.key}>
              {i > 0 && " · "}
              <Link href={`/theses/program/${p.key}`} className={linkClass}>
                {names[i]}
              </Link>{" "}
              <span className="text-text-muted">({p.count})</span>
            </span>
          ))}
        </p>
      )}
    </nav>
  );
}
