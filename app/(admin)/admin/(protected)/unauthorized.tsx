import { getTranslations } from "next-intl/server";
import { LogIn, UserRoundX } from "lucide-react";

/**
 * The admin panel's 401 — authentication, not authorization.
 *
 * It is a separate state from the 403 on purpose: "your session ended" and "you
 * are signed in but lack this permission" have different causes and different
 * fixes, and collapsing them into one screen sends people to re-login for a
 * problem that logging in again will not solve.
 */
export default async function AdminUnauthorized() {
  const t = await getTranslations("adminErrors.unauthorized");

  return (
    <div className="flex w-full justify-center px-4 py-12 sm:py-20">
      <section
        role="alert"
        aria-labelledby="admin-unauthorized-title"
        className="w-full max-w-md rounded-2xl border border-divider bg-bg-surface p-8 text-center shadow-sm"
      >
        <span
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-divider bg-paper text-text-muted"
          aria-hidden="true"
        >
          <UserRoundX className="h-6 w-6" />
        </span>
        <h1
          id="admin-unauthorized-title"
          className="text-lg font-bold tracking-tight text-text-heading"
        >
          {t("title")}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-body">{t("body")}</p>
        {/* Full load: the login route must run its own server-side session
            check, and a client transition could restore a stale RSC payload. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full
            load on purpose: the login route must re-run its own session check,
            and a client transition could restore a stale RSC payload. */}
        <a
          href="/admin/login"
          className="focus-field mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-contrast shadow-sm transition-colors duration-150 hover:bg-brand-hover"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          {t("action")}
        </a>
      </section>
    </div>
  );
}
