import { getTranslations } from "next-intl/server";
import { ExternalLink, UserRound } from "lucide-react";
import { KOHA_OPAC_ACCOUNT_URL } from "@/lib/opac/links";

/**
 * "Borrowing printed books?" — the Physical Library's way into a reader's own
 * library account, which lives in the public Koha OPAC, not here.
 * Loans, due dates and holds are Koha's; this page is the catalogue a reader
 * searches. A plain link, server-rendered: no request to Koha, so an OPAC that
 * is down costs this page nothing. The Khmer note also says the OPAC's menus
 * are in English, which is where a Khmer reader is going.
 */
export default async function LibraryAccountStrip() {
  const [t, tNav] = await Promise.all([getTranslations("catalogs"), getTranslations("nav")]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-divider bg-paper px-3.5 py-2 text-[13.5px]">
      <div className="min-w-0 flex-1 basis-72 py-1">
        <p className="font-semibold text-text-heading">{t("accountTitle")}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-text-muted">
          {t("accountBody")} {t("accountOpensNote")}
        </p>
      </div>
      <a
        href={KOHA_OPAC_ACCOUNT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 font-semibold text-brand underline-offset-4 transition-colors hover:text-brand-hover hover:underline"
      >
        <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
        {tNav("libraryAccount")}
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only">({tNav("opensNewTab")})</span>
      </a>
    </div>
  );
}
