import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

/**
 * Shown when a slug does not resolve to a post the viewer may read — the row
 * is missing, or it is still a draft and the viewer is not an admin.
 *
 * This page used to print Khmer and English headings stacked on top of each
 * other with an English-only body, so neither audience got a clean page. It is
 * now rendered in the reader's locale like everything else.
 */
export default async function PostNotFound() {
  const t = await getTranslations("posts");

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-app px-5 pt-[72px]">
      <div className="w-full max-w-md py-20 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1E3A8A"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 19.5V6a2 2 0 012-2h12v16H6.5a2.5 2.5 0 010-5H18" />
            <path d="M9 10h6M9 14h4" />
          </svg>
        </div>

        <h1 className="mb-3 font-khmer-serif text-2xl font-bold text-text-heading">
          {t("notFoundTitle")}
        </h1>

        <p className="mx-auto mb-2 max-w-xs text-sm leading-relaxed text-text-muted">
          {t("notFoundBody")}
        </p>
        <p className="mx-auto mb-8 max-w-xs text-sm leading-relaxed text-text-muted">
          {t("notFoundSearchHint")}
        </p>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/posts"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-brand-contrast no-underline shadow-sm transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
            {t("backToPosts")}
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-divider bg-bg-surface px-6 py-2.5 text-sm font-semibold text-text-body no-underline transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app"
          >
            {t("notFoundHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
