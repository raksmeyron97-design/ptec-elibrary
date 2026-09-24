// components/ui/dashboard/DashboardHeader.tsx
// Compact, calm identity band — deliberately NOT a big hero banner. This is a
// personal workspace, not a marketing page or an admin console.
//
// It also carries the account facts (email, role, member since). Those used
// to be a separate "Account Information" card further down, repeating the
// name this band already shows; editing them lives in Settings either way.
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import { Settings, ShieldCheck, LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Avatar from "@/components/ui/Avatar";

export type GreetingBand = "greetingMorning" | "greetingAfternoon" | "greetingEvening";

type Props = {
  displayName: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  greetingBand: GreetingBand;
  /** Pre-formatted in the reader's locale; null when the profile has no date. */
  memberSince: string | null;
};

// Icon-only below `sm`, where three labelled buttons would push the greeting
// onto three lines; the label is still the accessible name and the tooltip.
const ACTION =
  "focus-field inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-xl border border-divider bg-bg-surface text-[13px] font-semibold text-text-body transition-colors hover:border-brand/30 hover:text-brand sm:w-auto sm:px-3.5";

export default async function DashboardHeader({
  displayName, email, avatarUrl, isAdmin, greetingBand, memberSince,
}: Props) {
  const t = await getTranslations("dashboard");

  return (
    <header className="border-b border-divider bg-bg-surface">
      <div className="mx-auto flex max-w-[1300px] items-center gap-3.5 px-4 py-5 sm:gap-5 sm:px-8 sm:py-7 md:px-12">
        <Avatar
          url={avatarUrl}
          name={displayName}
          email={email}
          size={56}
          className="ring-4 ring-surface-brand-soft max-sm:!h-12 max-sm:!w-12"
        />

        <div className="min-w-0 flex-1">
          <h1 className="font-khmer-serif text-[20px] font-bold leading-snug text-text-heading sm:text-[26px]">
            {t(greetingBand, { name: displayName })}
          </h1>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-text-muted sm:text-[13px]">
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${
                isAdmin
                  ? "bg-warning-soft text-warning-text ring-1 ring-inset ring-warning-line"
                  : "bg-surface-brand-soft text-brand ring-1 ring-inset ring-surface-brand-line"
              }`}
            >
              {isAdmin ? t("admin") : t("reader")}
            </span>
            {email && <span className="min-w-0 truncate max-sm:hidden">{email}</span>}
            {memberSince && (
              <>
                <span aria-hidden="true" className="max-sm:hidden">·</span>
                <span className="truncate">{t("memberSinceDate", { date: memberSince })}</span>
              </>
            )}
          </div>
        </div>

        <nav aria-label={t("accountActions")} className="flex shrink-0 items-center gap-2 self-start sm:self-center">
          {isAdmin && (
            <NextLink href="/admin" className={ACTION} aria-label={t("linkAdminPanel")} title={t("linkAdminPanel")}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span className="max-sm:sr-only">{t("admin")}</span>
            </NextLink>
          )}
          <Link href="/dashboard/settings" className={ACTION} title={t("settings")}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span className="max-sm:sr-only">{t("settings")}</span>
          </Link>
          <form action="/auth/signout" method="POST">
            <button type="submit" className={`${ACTION} text-text-muted hover:!border-danger/30 hover:!text-danger`} title={t("signOut")}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="max-sm:sr-only">{t("signOut")}</span>
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
