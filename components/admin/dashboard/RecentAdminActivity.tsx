import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { History, Shield } from "lucide-react";
import type { AdminActivityEntry } from "@/lib/admin/intelligence";
import { relativeFromNow } from "./formatters";

/** "user_password.reset_sent" → "User password reset sent" when unmapped. */
const humanise = (action: string) =>
  action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * The last few administrative actions, so an admin can see what colleagues
 * changed before wondering why a number moved. Rendered only for ADMIN_ROLES —
 * the audit trail names administrators and the records they touched, so the
 * caller gates it; actions touching personal data carry a shield marker.
 *
 * Consecutive identical actions by one administrator are collapsed upstream
 * (`groupConsecutiveActivity`), so a bulk import is one line, not forty.
 */
export default async function RecentAdminActivity({
  entries,
  logsHref,
  generatedAt,
}: {
  entries: AdminActivityEntry[];
  logsHref: string;
  generatedAt: string;
}) {
  const [t, locale] = await Promise.all([getTranslations("adminDashboard.activity"), getLocale()]);
  const now = new Date(generatedAt).getTime();
  const relative = (iso: string) => relativeFromNow(locale, iso, now);

  return (
    <section aria-labelledby="activity-heading" className="dash-card flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="dash-ico dash-ico--md dash-ico--brand" aria-hidden="true">
            <History className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 id="activity-heading" className="text-[14px] font-bold text-text-heading">
              {t("title")}
            </h2>
            <p className="text-[11.5px] text-text-muted">{t("subtitle")}</p>
          </div>
        </div>
        <Link
          href={logsHref}
          className="shrink-0 rounded-lg px-1.5 py-1 text-[11.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {t("viewLog")}
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="mt-3 flex flex-1 items-center justify-center rounded-xl bg-paper/60 px-3 py-8 text-center text-[12px] text-text-muted">
          {t("empty")}
        </p>
      ) : (
        <ol className="mt-3 flex-1 space-y-1">
          {entries.map((e, i) => {
            const label = e.labelKey ? t(`action.${e.labelKey}`) : humanise(e.action);
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium leading-4 text-text-body">
                    {label}
                    {e.repeats > 1 && (
                      <span className="ms-1 rounded bg-paper px-1 py-px text-[10px] font-bold tabular-nums text-text-muted">
                        ×{e.repeats}
                      </span>
                    )}
                    {e.sensitive && (
                      <>
                        <Shield className="ms-1 inline h-3 w-3 align-[-1px] text-amber-600" aria-hidden="true" />
                        <span className="sr-only">{t("sensitive")}</span>
                      </>
                    )}
                  </span>
                  <span className="block text-[11px] text-text-muted">
                    {t("byline", { actor: e.actor, when: relative(e.createdAt) })}
                  </span>
                </span>
              </>
            );

            return (
              <li key={`${e.action}-${e.createdAt}-${i}`}>
                {e.href ? (
                  <Link
                    href={e.href}
                    className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                  >
                    {body}
                  </Link>
                ) : (
                  <span className="flex items-start gap-2 px-2 py-1.5">{body}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
