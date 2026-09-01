import { getTranslations } from "next-intl/server";
import { FileQuestion, LayoutDashboard } from "lucide-react";

/**
 * The admin panel's 404, inside the admin shell rather than the public
 * `global-not-found`. A mistyped admin URL used to leave the panel entirely,
 * which reads as "you were signed out" rather than "that page does not exist".
 */
export default async function AdminNotFound() {
  const t = await getTranslations("adminErrors.notFound");

  return (
    <div className="flex w-full justify-center px-4 py-12 sm:py-20">
      <section
        aria-labelledby="admin-not-found-title"
        className="w-full max-w-md rounded-2xl border border-divider bg-bg-surface p-8 text-center shadow-sm"
      >
        <span
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-divider bg-paper text-text-muted"
          aria-hidden="true"
        >
          <FileQuestion className="h-6 w-6" />
        </span>
        <h1 id="admin-not-found-title" className="text-lg font-bold tracking-tight text-text-heading">
          {t("title")}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-body">{t("body")}</p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full
            load on purpose: the dashboard re-runs its own guard on arrival. */}
        <a
          href="/admin"
          className="focus-field mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-contrast shadow-sm transition-colors duration-150 hover:bg-brand-hover"
        >
          <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
          {t("action")}
        </a>
      </section>
    </div>
  );
}
