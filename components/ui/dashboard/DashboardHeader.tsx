// components/ui/dashboard/DashboardHeader.tsx
// Compact, calm welcome band — deliberately NOT a big hero banner. This is a
// personal workspace, not a marketing page or an admin console.
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
};

export default async function DashboardHeader({
  displayName, email, avatarUrl, isAdmin, greetingBand,
}: Props) {
  const t = await getTranslations("dashboard");

  return (
    <div className="border-b border-divider bg-bg-surface">
      <div className="mx-auto flex max-w-[1300px] flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 md:px-12">
        <div className="flex min-w-0 items-center gap-3.5">
          <Avatar url={avatarUrl} name={displayName} email={email} size={52} className="shrink-0 ring-2 ring-divider" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-khmer-serif text-[20px] font-bold leading-tight text-text-heading">
                {t(greetingBand, { name: displayName })}
              </h1>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                isAdmin
                  ? "border border-accent/30 bg-accent/10 text-accent-text"
                  : "border border-divider bg-paper text-text-muted"
              }`}>
                {isAdmin ? t("admin") : t("reader")}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[13px] text-text-muted">{t("headerSubtitle")}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isAdmin && (
            <NextLink href="/admin"
              className="focus-field inline-flex items-center gap-1.5 rounded-xl border border-divider bg-paper px-3 py-2 text-[12.5px] font-semibold text-text-body transition hover:border-brand/30 hover:text-brand">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("admin")}
            </NextLink>
          )}
          <Link href="/dashboard/settings"
            className="focus-field inline-flex items-center gap-1.5 rounded-xl border border-divider bg-paper px-3 py-2 text-[12.5px] font-semibold text-text-body transition hover:border-brand/30 hover:text-brand">
            <Settings className="h-3.5 w-3.5" />
            {t("settings")}
          </Link>
          <form action="/auth/signout" method="POST">
            <button type="submit"
              className="focus-field inline-flex items-center gap-1.5 rounded-xl border border-divider bg-paper px-3 py-2 text-[12.5px] font-semibold text-text-muted transition hover:border-danger/30 hover:text-danger">
              <LogOut className="h-3.5 w-3.5" />
              {t("signOut")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
