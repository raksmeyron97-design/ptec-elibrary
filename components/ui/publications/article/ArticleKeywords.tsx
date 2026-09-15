import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { JOURNALS_PATH } from "@/lib/journals/urls";

function Terms({ terms, param }: { terms: string[]; param: "keyword" | "subject" }) {
  return (
    <ul className="flex flex-wrap items-baseline">
      {terms.map((term, i) => (
        <li key={`${i}-${term}`} className="inline-flex items-baseline">
          <Link
            href={`${JOURNALS_PATH}?${param}=${encodeURIComponent(term)}`}
            className="inline-flex min-h-8 items-center rounded-sm text-brand underline decoration-brand/25 underline-offset-4 transition-colors hover:decoration-brand"
          >
            {term}
          </Link>
          {i < terms.length - 1 && (
            <span aria-hidden="true" className="px-2 text-text-muted">
              ·
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Keywords and subjects, directly after the abstract — the place a reader
 * checks whether the paper is about what they need.
 *
 * Inline links separated by middots, not pills: the old rail rendered eight
 * keywords as eight rows of outlined chips. Each term still filters the
 * journals listing, exactly as the chips did (same `?keyword=` / `?subject=`
 * parameters).
 */
export default async function ArticleKeywords({ keywords, subjects }: { keywords: string[]; subjects: string[] }) {
  const kw = keywords.map((k) => k.trim()).filter(Boolean);
  const subj = subjects.map((s) => s.trim()).filter(Boolean);
  if (kw.length === 0 && subj.length === 0) return null;
  const t = await getTranslations("publicationDetail");

  return (
    <dl className="mt-7 max-w-[70ch] space-y-2 border-t border-divider pt-5 text-[14.5px] leading-7">
      {kw.length > 0 && (
        <div className="flex flex-col gap-x-3 sm:flex-row">
          <dt className="shrink-0 font-semibold text-text-heading sm:w-24">{t("keywordsLabel")}</dt>
          <dd className="min-w-0">
            <Terms terms={kw} param="keyword" />
          </dd>
        </div>
      )}
      {subj.length > 0 && (
        <div className="flex flex-col gap-x-3 sm:flex-row">
          <dt className="shrink-0 font-semibold text-text-heading sm:w-24">{t("subjectsHeading")}</dt>
          <dd className="min-w-0">
            <Terms terms={subj} param="subject" />
          </dd>
        </div>
      )}
    </dl>
  );
}
