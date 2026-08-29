import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EBOOKS_BASE_PATH } from "@/lib/admin/ebooks-url";

/**
 * The trail shared by all three Book Management pages.
 *
 * Plain `next/link`, not `i18n/navigation` — /admin is outside the locale
 * scheme and the localized Link would prefix /km onto an admin URL.
 */
export default async function BooksBreadcrumb({
  /** Omit on the workspace root; pass the leaf's label on Upload / Duplicates. */
  current,
}: {
  current?: string;
} = {}) {
  const t = await getTranslations("adminEbooks.breadcrumb");

  return (
    <nav aria-label={t("label")} className="text-xs text-text-muted">
      <Link href="/admin" className="focus-field rounded transition-colors duration-150 hover:text-text-body">
        {t("home")}
      </Link>
      <Separator />
      {current ? (
        <>
          <Link
            href={EBOOKS_BASE_PATH}
            className="focus-field rounded transition-colors duration-150 hover:text-text-body"
          >
            {t("current")}
          </Link>
          <Separator />
          <span className="text-text-body">{current}</span>
        </>
      ) : (
        <span className="text-text-body">{t("current")}</span>
      )}
    </nav>
  );
}

function Separator() {
  return (
    <span className="px-1.5 text-divider" aria-hidden="true">
      /
    </span>
  );
}
