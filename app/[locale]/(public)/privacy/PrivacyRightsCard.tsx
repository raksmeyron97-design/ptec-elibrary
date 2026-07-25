import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Settings, Download, Trash2, Mail, Info, ArrowRight } from "lucide-react";

// Every card links to a real, working destination — no dead buttons. Deletion
// links to the settings page where the real confirmation workflow lives.
const CARDS = [
  { key: "edit", href: "/dashboard/settings", Icon: Settings, danger: false },
  { key: "export", href: "/dashboard", Icon: Download, danger: false },
  { key: "delete", href: "/dashboard/settings", Icon: Trash2, danger: true },
  { key: "ask", href: "/contact", Icon: Mail, danger: false },
] as const;

/**
 * The "Manage your privacy" control panel. Account deletion links to the
 * settings page where the real confirmation workflow lives; this card never
 * performs a destructive action itself.
 *
 * Static/server-rendered: the links work for everyone (visiting them while
 * signed out redirects to login), so no client JS or auth read is needed here.
 */
export default async function PrivacyRightsCard({ km }: { km: boolean }) {
  const t = await getTranslations("privacy.rights");
  const headingFont = km ? "font-khmer-serif" : "";

  return (
    <div className="mt-6 rounded-2xl border border-divider bg-bg-app/60 p-5 sm:p-6">
      <p className="text-[14px] text-text-body">{t("intro")}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {CARDS.map(({ key, href, Icon, danger }) => (
          <li key={key}>
            <Link
              href={href}
              className={`group flex h-full items-start gap-3 rounded-xl border bg-bg-surface p-4 shadow-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                danger
                  ? "border-danger/30 hover:border-danger/60 hover:bg-danger/[0.03]"
                  : "border-divider hover:border-brand/50 hover:bg-brand/[0.03]"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  danger ? "bg-danger/10 text-danger" : "bg-brand/10 text-brand"
                }`}
                aria-hidden="true"
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`flex items-center gap-1 text-[15px] font-semibold ${
                    danger ? "text-danger" : "text-text-heading"
                  } ${headingFont}`}
                >
                  {t(`${key}.title`)}
                  <ArrowRight
                    className="h-4 w-4 shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-0.5 block text-[13.5px] leading-relaxed text-text-body">
                  {t(`${key}.body`)}
                </span>
                <span
                  className={`mt-2 inline-block text-[13px] font-medium ${
                    danger ? "text-danger" : "text-brand"
                  }`}
                >
                  {t(`${key}.cta`)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-2 text-[13px] text-text-muted">
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t("loggedOutNote")}
      </p>
    </div>
  );
}
